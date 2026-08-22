/* atlasRenderer.js — az Élő Atlasz kurált térképe (Canvas 2D). Önálló modul.
 *
 * A `graphModel` egy getterének eredményét rajzolja: dokumentum-csomópont + él +
 * címke. Kezeli a kamerát (pan/zoom, tween), a viewport-cullingot, a címke-
 * ütközést és a rács-alapú hit-testet.
 *
 * NINCS domén-/klaszter-kör és nincs LOD-szint (0/1/2) — a kategória a modellben
 * is csak facet, itt nincs külön megjelenítése. A részletesség (címke-budget,
 * csomópont-méret/-alfa, él-fényerő) FOLYTONOSAN skálázódik a zoommal, nem
 * ugrik szinteken.
 *
 * Nem dönt állapotot: a kiemelést és a kamerát a view vezérli. Színt SOSEM éget be —
 * a design tokeneket olvassa (getComputedStyle), így témával EGYÜTT vált.
 *
 * Publikus API:
 *   createAtlasRenderer(canvas, { intensity, reducedMotion, onHover, onSelect, onViewport })
 *     .setData({ nodes, edges })
 *     .setHighlight({ selectedId, hoverId, matchIds })   // csak vizuális, kamerát nem mozgat
 *     .focusOn(id, { animate: true })                    // fit-to-bounds a csomópontra + szomszédaira
 *     .toOverview({ animate: true })                     // sólyom-nézet
 *     .setDimmed(idsOrNull) .setExcluded(idsOrNull) .getNodeScreenRect(id)
 *     .start() .stop() .resize() .refreshColors() .destroy()
 *
 * Két, KÜLÖNBÖZŐ erősségű háttérbe-tolás — ne keverd őket:
 *   `setDimmed`   — lágy elhalkítás (keresés nem-találatai, fókusz szomszédságán
 *                   kívüliek). A csomópont TOVÁBBRA IS kattintható: így lehet a
 *                   gráfban továbblépni egy szomszédra.
 *   `setExcluded` — a szűrőből kiesett dokumentum: halvány ÜRES karika, nincs
 *                   felirata, és NEM kattintható (inert). Azért marad ott, hogy
 *                   lásd, van még tudás a szűrőn túl — de amire nem szűrtél, azon
 *                   nem is tudsz cselekedni (a listában sem lenne sora).
 *
 * Teljesítmény: egyetlen rAF, előre lefoglalt tömbök (nincs per-frame allokáció),
 * ≤150 látható csomópont, DPR sapka 2, `visibilitychange`-re megáll.
 */
(function (global) {
  'use strict';

  var WORLD_SPAN = 1000;                  // a graphModel 0..1000 világot ad
  var MAX_VISIBLE = 150;                  // kemény sapka — efölött nem rajzolunk
  var MAX_LABELS = 32;                    // címke-ütközési budget

  var INTENSITY = {
    calm: { glow: 0.75, edge: 0.85, labels: 22, pulse: 0.6 },
    balanced: { glow: 1.00, edge: 1.00, labels: 28, pulse: 1.0 },
    vivid: { glow: 1.30, edge: 1.20, labels: 32, pulse: 1.3 }
  };

  // Zoom → részletesség FOLYTONOS leképezése (nincs discrete LOD-szint, nincs
  // szint-crossfade — maga a kameraz-zoom már easelt, ez csak levezeti belőle).
  var ZOOM_DETAIL_SPAN = 1.6;              // ennyi zoomRatio-nyi sávon fut 0→1 a részletesség
  function smooth01(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }

  // Él-fényerő. Az élek ALAPÉRTELMEZETTEN halványan, de LÁTHATÓAN ott vannak — a
  // kapcsolati szövet a térkép fő olvasata, nem díszítés. Hover (vagy kijelölés)
  // hatására a csomópontba futó élek élénk `--accent`-re váltanak: a kiemelt
  // alfa szándékosan NEM skálázódik a zoommal, hogy áttekintésben is ugyanolyan
  // egyértelmű legyen, mint közelről.
  var EDGE_A_BASE = 0.20;                  // a legkisebb súlyú él alap-alfája
  var EDGE_A_WEIGHT = 0.16;                // súly szerinti ráadás az alapra
  var EDGE_A_HI = 0.62;                    // kiemelt (hover/kijelölt) él alfája
  var EDGE_A_HI_WEIGHT = 0.30;             // súly szerinti ráadás a kiemeltre
  var EDGE_W_HI = 1.75;                    // kiemelt él vonalvastagsága (px)
  var EDGE_A_EXCLUDED = 0.3;               // szűrőből kiesett végpont → visszahúzódik

  // Kattinthatósági padló: a KIRAJZOLT sugár sosem esik ez alá, akármilyen kicsi
  // a modell-súly vagy a térkép-panel. A hit-test ezen felül még +6 px-t ad, így
  // a legkisebb célfelület is ~26 px átmérőjű marad.
  var MIN_NODE_R = 7;
  var CAT_PALETTE_SIZE = 8;
  var SPRITE_PX = 64;                      // a többkategóriás színátmenet sprite mérete

  function createAtlasRenderer(canvas, options) {
    options = options || {};
    var cfg = INTENSITY[options.intensity] || INTENSITY.balanced;
    var reduced = !!options.reducedMotion;
    var onHover = typeof options.onHover === 'function' ? options.onHover : noop;
    var onSelect = typeof options.onSelect === 'function' ? options.onSelect : noop;
    // A nézetben lévő csomópontokat jelenti a hívónak (a lista ehhez szűkül:
    // amit a térképen látsz, azt kapod a listában is).
    var onViewport = typeof options.onViewport === 'function' ? options.onViewport : noop;

    function noop() {}

    var ctx = canvas.getContext('2d');
    var dpr = 1, W = 0, H = 0;

    // ---------- adat: párhuzamos tömbök (nincs frame-allokáció) ----------
    var cap = 0;                            // lefoglalt kapacitás
    var nCount = 0;
    var nx, ny, nr, nw, ntype, nsx, nsy, nscr, nvis, nmatch, ndim, nout, nlabelW;
    var nid = [], nlabel = [], ncat = [];    // ncat[i] = kategória paletta-slotok tömbje
    var idIndex = {};
    var order;                              // Int32Array — súly szerint csökkenő festési/címke-sorrend

    var eCap = 0, eCount = 0;
    var ea, eb, ew, ehl;                    // hl = a kijelölt szomszédságában van-e

    // szomszédság CSR (a kijelölt szomszédság kiemeléséhez, fit-to-boundshoz)
    var nbStart, nbList;

    // rács-index (hit-test) — CSR
    var G = 1, gx0 = 0, gy0 = 0, gw = 1, gh = 1;
    var cellStart, cellItems;

    // világ-befoglaló + kamera
    var bMinX = 0, bMinY = 0, bMaxX = WORLD_SPAN, bMaxY = WORLD_SPAN;
    var fitBase = 1;                        // px / világ-egység zoom 1-en
    var ovZoom = 1, ovX = WORLD_SPAN / 2, ovY = WORLD_SPAN / 2;
    var camX = WORLD_SPAN / 2, camY = WORLD_SPAN / 2, camZ = 1;
    var frX = camX, frY = camY, frZ = camZ;  // tween-kezdet
    var toX = camX, toY = camY, toZ = camZ;  // tween-cél
    var camT = 1, camDur = 400;
    var camReady = false;
    var camTouched = false;                 // igaz, ha a felhasználó/fókusz már mozgatta a kamerát

    // folytonos részlet-paraméterek (a zoomból, nem discrete LOD-ból)
    var P = { docAlpha: 0.55, docScale: 0.62, docLabel: 0.15, docLabelTop: 5, edge: 0.75 };

    // kiemelés
    var selectedId = null, hoverId = null, selIdx = -1, hovIdx = -1;
    var dimActive = false, outActive = false;
    var phase = 0;

    // színek (tokenekből)
    var col = {
      primary: '#1F5C4C', secondary: '#29528C', accent: '#C9861A',
      text: '#1A1712', textMuted: '#6B6355', textSubtle: '#7A7264', surface: '#FFFFFF',
      border: '#DDD6C8', borderStrong: '#BFB7A6',
      edgeStr: 'rgb(191,183,166)', edgeHiStr: 'rgb(201,134,26)',
      fontBody: 'Inter, sans-serif', docFontPx: 12, fontDocBase: '500 12px Inter',
      cat: []                               // kategória-paletta (--catcolor-1..8), 1-alapú indexeléssel
    };
    var fontCache = {};                     // méret → font-string (nincs frame-enkénti string-építés)
    var spriteCache = {};                   // "1-4" → offscreen canvas a többkategóriás átmenethez
    var ease = defaultEase;

    // címke-ütközés: előre lefoglalt téglalapok
    var labelRects = new Float32Array(MAX_LABELS * 4);
    var labelUsed = 0;
    var labelBudget = cfg.labels;

    // ---------- segédek ----------
    function defaultEase(t) { return 1 - Math.pow(1 - t, 3); }

    function readVar(name, fallback) {
      var v = getComputedStyle(canvas).getPropertyValue(name);
      v = v ? v.replace(/^\s+|\s+$/g, '') : '';
      return v || fallback;
    }

    function toRGB(str) {
      str = (str || '').replace(/^\s+|\s+$/g, '');
      if (str.charAt(0) === '#') {
        if (str.length === 4) {
          return [parseInt(str.charAt(1) + str.charAt(1), 16),
                  parseInt(str.charAt(2) + str.charAt(2), 16),
                  parseInt(str.charAt(3) + str.charAt(3), 16)];
        }
        return [parseInt(str.slice(1, 3), 16), parseInt(str.slice(3, 5), 16), parseInt(str.slice(5, 7), 16)];
      }
      var m = str.match(/(\d+(?:\.\d+)?)/g);
      if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
      return [128, 128, 128];
    }

    function parseMs(str, fallback) {
      if (!str) return fallback;
      var v = parseFloat(str);
      if (isNaN(v)) return fallback;
      return str.indexOf('ms') >= 0 ? v : (str.indexOf('s') >= 0 ? v * 1000 : v);
    }

    // cubic-bezier(…) → időfüggvény (Newton-közelítés, allokáció nélkül fut)
    function makeEase(str) {
      var m = str && str.match(/cubic-bezier\(([^)]+)\)/);
      if (!m) return defaultEase;
      var p = m[1].split(',');
      if (p.length < 4) return defaultEase;
      var x1 = parseFloat(p[0]), y1 = parseFloat(p[1]), x2 = parseFloat(p[2]), y2 = parseFloat(p[3]);
      if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) return defaultEase;
      function bx(t) { var u = 1 - t; return 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t; }
      function by(t) { var u = 1 - t; return 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t; }
      return function (x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        var t = x, i, e2, d;
        for (i = 0; i < 6; i++) {
          e2 = bx(t) - x;
          if (e2 > -0.0005 && e2 < 0.0005) break;
          d = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
          if (d < 0.0001 && d > -0.0001) break;
          t -= e2 / d;
          if (t < 0) t = 0; else if (t > 1) t = 1;
        }
        return by(t);
      };
    }

    function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

    function refreshColors() {
      col.primary = readVar('--primary', '#1F5C4C');
      col.secondary = readVar('--secondary', '#29528C');
      col.accent = readVar('--accent', '#C9861A');
      col.text = readVar('--text', '#1A1712');
      col.textMuted = readVar('--text-muted', '#6B6355');
      // a szűrőből kiesett csomópontok karikája — mindkét témában halvány, de
      // biztosan látható (a `--border` ehhez már kevés lenne sötét témán)
      col.textSubtle = readVar('--text-subtle', '#7A7264');
      col.surface = readVar('--surface', '#FFFFFF');
      col.border = readVar('--border', '#DDD6C8');
      col.borderStrong = readVar('--border-strong', '#BFB7A6');
      col.fontBody = readVar('--font-body', 'Inter, sans-serif');
      col.docFontPx = Math.round(parseFloat(readVar('--text-xs', '12')) || 12);
      col.fontDocBase = '500 ' + col.docFontPx + 'px ' + col.fontBody;
      fontCache = {};
      // kategória-paletta a tokenekből (témával vált) — a sprite-cache dobandó
      col.cat = [null];
      for (var ci = 1; ci <= CAT_PALETTE_SIZE; ci++) {
        col.cat[ci] = readVar('--catcolor-' + ci, col.secondary);
      }
      spriteCache = {};

      var e1 = toRGB(col.border);
      col.edgeStr = 'rgb(' + e1[0] + ',' + e1[1] + ',' + e1[2] + ')';
      // Hoverelt/kijelölt szomszédság: az él szinte tisztán --accent (csak egy
      // csipet keret-szín marad benne, hogy a térkép meleg hangját tartsa) — ez
      // adja az „élénkebb szín" olvasatot a halvány alaphálóhoz képest.
      var e2 = toRGB(col.accent);
      col.edgeHiStr = 'rgb(' + Math.round(e1[0] * 0.2 + e2[0] * 0.8) + ',' +
        Math.round(e1[1] * 0.2 + e2[1] * 0.8) + ',' +
        Math.round(e1[2] * 0.2 + e2[2] * 0.8) + ')';

      camDur = parseMs(readVar('--duration-slow', '400ms'), 400);
      ease = makeEase(readVar('--ease-grow', 'cubic-bezier(.22,1,.36,1)'));

      if (nlabelW) { for (var i = 0; i < nCount; i++) nlabelW[i] = -1; }   // szélesség-cache dobás
      requestDraw();
    }

    // ---------- kapacitás ----------
    function ensureNodeCap(n) {
      if (cap > 0 && n <= cap) return;
      cap = Math.max(176, n + 32);
      nx = new Float32Array(cap); ny = new Float32Array(cap);
      nr = new Float32Array(cap); nw = new Float32Array(cap);
      ntype = new Uint8Array(cap);
      nsx = new Float32Array(cap); nsy = new Float32Array(cap); nscr = new Float32Array(cap);
      nvis = new Uint8Array(cap); nmatch = new Uint8Array(cap);
      ndim = new Uint8Array(cap); nout = new Uint8Array(cap);
      nlabelW = new Float32Array(cap);
      order = new Int32Array(cap);
      nbStart = new Int32Array(cap + 1);
    }
    function ensureEdgeCap(n) {
      if (eCap > 0 && n <= eCap) return;
      eCap = Math.max(64, n + 32);
      ea = new Int32Array(eCap); eb = new Int32Array(eCap);
      ew = new Float32Array(eCap); ehl = new Uint8Array(eCap);
      nbList = new Int32Array(eCap * 2);
    }

    function typeCode(t) { return t === 'person' ? 2 : 1; }   // 1 = dokumentum (alap), 2 = személy (Tier 1+)

    // ---------- adatbetöltés ----------
    function setData(view) {
      view = view || {};
      var vn = view.nodes || [], ve = view.edges || [];
      var n = Math.min(vn.length, MAX_VISIBLE);

      ensureNodeCap(n);
      idIndex = {};
      nid.length = 0; nlabel.length = 0; ncat.length = 0;
      nCount = 0;

      var i, nd;
      for (i = 0; i < n; i++) {
        nd = vn[i];
        if (!nd || !nd.id) continue;
        idIndex[nd.id] = nCount;
        nid.push(nd.id);
        nlabel.push(nd.label == null ? '' : String(nd.label));
        ncat.push(nd.catSlots && nd.catSlots.length ? nd.catSlots : null);
        nx[nCount] = +nd.x || 0;
        ny[nCount] = +nd.y || 0;
        nr[nCount] = nd.r > 0 ? +nd.r : 5;
        nw[nCount] = +nd.weight || 0;
        ntype[nCount] = typeCode(nd.type);
        nmatch[nCount] = 0; ndim[nCount] = 0; nout[nCount] = 0; nlabelW[nCount] = -1;
        nCount++;
      }
      outActive = false;      // az új adathalmazra a hívó újra kiadja a setExcluded-et

      // festési ÉS címke-sorrend: súly szerint csökkenő (a súlyosabb kerül felülre,
      // és előbb kap feliratot)
      var tmp = [];
      for (i = 0; i < nCount; i++) tmp.push(i);
      tmp.sort(function (a2, b2) {
        var d = nw[b2] - nw[a2];
        if (d) return d;
        return nid[a2] < nid[b2] ? -1 : 1;
      });
      for (i = 0; i < nCount; i++) order[i] = tmp[i];

      // élek
      ensureEdgeCap(ve.length);
      eCount = 0;
      var si, ti;
      for (i = 0; i < ve.length; i++) {
        if (!ve[i]) continue;
        si = idIndex[ve[i].source]; ti = idIndex[ve[i].target];
        if (si == null || ti == null || si === ti) continue;
        ea[eCount] = si; eb[eCount] = ti;
        ew[eCount] = +ve[i].weight || 1;
        ehl[eCount] = 0;
        eCount++;
      }
      buildAdjacency();

      computeBounds();
      buildGrid();
      selIdx = selectedId != null && idIndex[selectedId] != null ? idIndex[selectedId] : -1;
      hovIdx = hoverId != null && idIndex[hoverId] != null ? idIndex[hoverId] : -1;
      markSelectedEdges();

      // Amíg a felhasználó nem mozgatta a kamerát (nincs pan/zoom/fókusz), az
      // ÚJ adathalmaz áttekintésére illesztünk. Ez azért kell, mert a szűrés
      // megváltoztatja a befoglalót (és így az `ovZoom`-ot): ha a kamera a régi
      // értéken maradna, a térkép „zoomoltnak" tűnne az új adathoz képest, és a
      // nézet-alapú lista-szűrés indokolatlanul leszűkítené a találatokat.
      if (!camReady || !camTouched) {
        camX = ovX; camY = ovY; camZ = ovZoom;
        frX = toX = camX; frY = toY = camY; frZ = toZ = camZ;
        camT = 1;
        if (nCount > 0) camReady = true;
      }
      requestDraw();
    }

    function buildAdjacency() {
      var i;
      for (i = 0; i <= nCount; i++) nbStart[i] = 0;
      if (!eCount) return;
      for (i = 0; i < eCount; i++) { nbStart[ea[i] + 1]++; nbStart[eb[i] + 1]++; }
      for (i = 1; i <= nCount; i++) nbStart[i] += nbStart[i - 1];
      // átmeneti kurzorok: az nbStart-ot nem rontjuk el, ezért visszaszámolunk
      var cursor = new Int32Array(nCount + 1);
      for (i = 0; i <= nCount; i++) cursor[i] = nbStart[i];
      for (i = 0; i < eCount; i++) {
        nbList[cursor[ea[i]]++] = eb[i];
        nbList[cursor[eb[i]]++] = ea[i];
      }
    }

    function computeBounds() {
      if (!nCount) {
        bMinX = 0; bMinY = 0; bMaxX = WORLD_SPAN; bMaxY = WORLD_SPAN;
      } else {
        bMinX = Infinity; bMinY = Infinity; bMaxX = -Infinity; bMaxY = -Infinity;
        for (var i = 0; i < nCount; i++) {
          if (nx[i] < bMinX) bMinX = nx[i];
          if (nx[i] > bMaxX) bMaxX = nx[i];
          if (ny[i] < bMinY) bMinY = ny[i];
          if (ny[i] > bMaxY) bMaxY = ny[i];
        }
        var padW = Math.max(40, (bMaxX - bMinX) * 0.08);
        var padH = Math.max(40, (bMaxY - bMinY) * 0.08);
        bMinX -= padW; bMaxX += padW; bMinY -= padH; bMaxY += padH;
      }
      ovX = (bMinX + bMaxX) / 2;
      ovY = (bMinY + bMaxY) / 2;
      ovZoom = fitZoom(bMinX, bMinY, bMaxX, bMaxY, 1);
    }

    // fit-to-bounds: mekkora zoom mellett fér be a téglalap (margóval)
    function fitZoom(x1, y1, x2, y2, margin) {
      if (W < 2 || H < 2 || fitBase <= 0) return 1;
      var ww = Math.max(1, x2 - x1), hh = Math.max(1, y2 - y1);
      var zx = (W * 0.86) / (ww * fitBase);
      var zy = (H * 0.86) / (hh * fitBase);
      var z = Math.min(zx, zy) * (margin || 1);
      return clamp(z, 0.25, 12);
    }

    function buildGrid() {
      if (!nCount) { G = 1; cellStart = new Int32Array(2); cellItems = new Int32Array(1); return; }
      G = Math.round(clamp(Math.ceil(Math.sqrt(nCount)) + 1, 4, 24));
      gx0 = bMinX; gy0 = bMinY;
      gw = Math.max(1, (bMaxX - bMinX) / G);
      gh = Math.max(1, (bMaxY - bMinY) / G);
      var cells = G * G, i, ccell;
      if (!cellStart || cellStart.length < cells + 1) cellStart = new Int32Array(cells + 1);
      else for (i = 0; i <= cells; i++) cellStart[i] = 0;
      if (!cellItems || cellItems.length < nCount) cellItems = new Int32Array(Math.max(16, nCount));
      for (i = 0; i <= cells; i++) cellStart[i] = 0;
      for (i = 0; i < nCount; i++) cellStart[cellOf(nx[i], ny[i]) + 1]++;
      for (i = 1; i <= cells; i++) cellStart[i] += cellStart[i - 1];
      var cur = new Int32Array(cells + 1);
      for (i = 0; i <= cells; i++) cur[i] = cellStart[i];
      for (i = 0; i < nCount; i++) { ccell = cellOf(nx[i], ny[i]); cellItems[cur[ccell]++] = i; }
    }

    function cellOf(wx, wy) {
      var ix = Math.floor((wx - gx0) / gw); if (ix < 0) ix = 0; else if (ix >= G) ix = G - 1;
      var iy = Math.floor((wy - gy0) / gh); if (iy < 0) iy = 0; else if (iy >= G) iy = G - 1;
      return iy * G + ix;
    }

    // ---------- kiemelés ----------
    function setHighlight(h) {
      h = h || {};
      var i;
      if (h.selectedId !== undefined) selectedId = h.selectedId || null;
      if (h.hoverId !== undefined) hoverId = h.hoverId || null;
      selIdx = selectedId != null && idIndex[selectedId] != null ? idIndex[selectedId] : -1;
      hovIdx = hoverId != null && idIndex[hoverId] != null ? idIndex[hoverId] : -1;
      if (h.matchIds !== undefined) {
        for (i = 0; i < nCount; i++) nmatch[i] = 0;
        if (h.matchIds) {
          for (i = 0; i < h.matchIds.length; i++) {
            var mi = idIndex[h.matchIds[i]];
            if (mi != null) nmatch[mi] = 1;
          }
        }
      }
      markSelectedEdges();
      requestDraw();
    }

    function markSelectedEdges() {
      var i;
      for (i = 0; i < eCount; i++) {
        ehl[i] = (selIdx >= 0 && (ea[i] === selIdx || eb[i] === selIdx)) ||
                 (hovIdx >= 0 && (ea[i] === hovIdx || eb[i] === hovIdx)) ? 1 : 0;
      }
    }

    // a felsorolt csomópontok halványodnak (nem tűnnek el); null = nincs halványítás
    function setDimmed(ids) {
      var i;
      for (i = 0; i < nCount; i++) ndim[i] = 0;
      dimActive = false;
      if (ids && ids.length) {
        for (i = 0; i < ids.length; i++) {
          var k = idIndex[ids[i]];
          if (k != null) { ndim[k] = 1; dimActive = true; }
        }
      }
      requestDraw();
    }

    // A szűrőből kiesett csomópontok: halvány üres karika, felirat nélkül, és
    // INERT (a hit-test átlép rajtuk). Erősebb háttérbe-tolás, mint a `setDimmed`.
    // null = nincs kiesett csomópont.
    function setExcluded(ids) {
      var i;
      for (i = 0; i < nCount; i++) nout[i] = 0;
      outActive = false;
      if (ids && ids.length) {
        for (i = 0; i < ids.length; i++) {
          var k = idIndex[ids[i]];
          if (k != null) { nout[k] = 1; outActive = true; }
        }
      }
      // a kiesett csomópont nem lehet hover-cél: ha épp azon állt a kurzor, elengedjük
      if (outActive && hovIdx >= 0 && nout[hovIdx]) {
        hoverId = null; hovIdx = -1;
        markSelectedEdges();
      }
      requestDraw();
    }

    // ---------- kamera ----------
    function panClamp() {
      var scale = fitBase * camZ;
      if (scale <= 0) return;
      var halfW = (W / 2) / scale, halfH = (H / 2) / scale;
      var loX = bMinX - halfW * 0.6, hiX = bMaxX + halfW * 0.6;
      var loY = bMinY - halfH * 0.6, hiY = bMaxY + halfH * 0.6;
      if (loX > hiX) { loX = hiX = (bMinX + bMaxX) / 2; }
      if (loY > hiY) { loY = hiY = (bMinY + bMaxY) / 2; }
      camX = clamp(camX, loX, hiX);
      camY = clamp(camY, loY, hiY);
    }

    function tweenTo(x, y, z, animate) {
      z = clamp(z, ovZoom * 0.6, ovZoom * 9);
      if (reduced || animate === false) {
        camX = x; camY = y; camZ = z;
        frX = toX = x; frY = toY = y; frZ = toZ = z;
        camT = 1;
        panClamp();
        requestDraw();
        return;
      }
      frX = camX; frY = camY; frZ = camZ;
      toX = x; toY = y; toZ = z;
      camT = 0;
      requestDraw();
    }

    function stepCamera(dt) {
      if (camT >= 1) return;
      camT += dt / Math.max(1, camDur);
      if (camT > 1) camT = 1;
      var e = ease(camT);
      camX = frX + (toX - frX) * e;
      camY = frY + (toY - frY) * e;
      // a zoom exponenciálisan interpolál, hogy a pozícióval EGYÜTT, snap nélkül érkezzen
      camZ = frZ * Math.pow(toZ / frZ, e);
      panClamp();
    }

    function focusOn(id, opts) {
      var animate = !(opts && opts.animate === false);
      var i = idIndex[id];
      if (i == null) return;
      var x1 = nx[i], x2 = nx[i], y1 = ny[i], y2 = ny[i];
      var s = nbStart[i], e = nbStart[i + 1], j, k;
      for (j = s; j < e; j++) {
        k = nbList[j];
        if (nx[k] < x1) x1 = nx[k];
        if (nx[k] > x2) x2 = nx[k];
        if (ny[k] < y1) y1 = ny[k];
        if (ny[k] > y2) y2 = ny[k];
      }
      var minSpan = 150;                     // magányos csomópont se zoomoljon a végtelenbe
      if (x2 - x1 < minSpan) { var mx = (x1 + x2) / 2; x1 = mx - minSpan / 2; x2 = mx + minSpan / 2; }
      if (y2 - y1 < minSpan) { var my = (y1 + y2) / 2; y1 = my - minSpan / 2; y2 = my + minSpan / 2; }
      var pad = Math.max(30, (x2 - x1) * 0.18);
      camTouched = true;
      tweenTo((x1 + x2) / 2, (y1 + y2) / 2, fitZoom(x1 - pad, y1 - pad, x2 + pad, y2 + pad, 1), animate);
    }

    function toOverview(opts) {
      var animate = !(opts && opts.animate === false);
      camTouched = false;
      tweenTo(ovX, ovY, ovZoom, animate);
    }

    // ---------- folytonos részlet-paraméterek (zoomból, nincs discrete LOD) ----------
    function zoomRatio() { return camZ / Math.max(0.0001, ovZoom); }

    function updateVisualParams() {
      var e = smooth01((zoomRatio() - 1) / ZOOM_DETAIL_SPAN);
      P.docAlpha = 0.80 + 0.20 * e;
      // Áttekintésben 1.0: a modell `r`-je EGY-AZ-EGYBEN px — így a legkisebb
      // csomópont is a modell minimumát (8 px) kapja, nem annak 62%-át.
      P.docScale = 1.00 + 0.30 * e;
      P.docLabel = 0.15 + 0.85 * e;
      P.docLabelTop = Math.round(5 + 40 * e);
      // az alapháló áttekintésben is olvasható marad (0,75), közelítve erősödik
      P.edge = 0.75 + 0.25 * e;
    }

    // ---------- méret ----------
    function resize() {
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      var rect = canvas.getBoundingClientRect();
      W = Math.max(0, Math.round(rect.width));
      H = Math.max(0, Math.round(rect.height));
      if (W < 2 || H < 2) { return; }        // nulla méretű canvas: ne rajzoljunk
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fitBase = Math.min(W, H) / WORLD_SPAN;
      ovZoom = fitZoom(bMinX, bMinY, bMaxX, bMaxY, 1);
      // amíg a felhasználó nem mozgatta a kamerát, az áttekintés újraillesztődik
      if (!camReady || !camTouched) {
        camX = ovX; camY = ovY; camZ = ovZoom;
        frX = toX = camX; frY = toY = camY; frZ = toZ = camZ; camT = 1;
      }
      panClamp();
      requestDraw();
    }

    // ---------- projekció ----------
    function zoomFactor() {
      // az áttekintéshez normalizálva: a modell `r`-je AZ áttekintésben érvényes px-méret,
      // és szublineárisan nő, hogy közelítve se legyen „bogyó"
      return Math.pow(Math.max(0.05, zoomRatio()), 0.5);
    }

    function nodeScreenR(i, scale) {
      var r = nr[i] * zoomFactor() * P.docScale;
      // kattinthatósági padló — kis panelen/alacsony súlynál se essen pont-méretűre
      return r < MIN_NODE_R ? MIN_NODE_R : r;
    }

    // ---------- kategória-színezés ----------
    function catColor(slot) {
      var c = col.cat[slot];
      return c || col.secondary;
    }

    // Több kategóriás csomópont: FINOM ÁTMENET a kategóriái színei között.
    // Egy kis offscreen canvasre rajzoljuk (slot-kombinációnként EGYSZER), majd
    // `drawImage`-zsel méretezzük — így nincs per-frame gradiens-allokáció.
    // A színmegállók a szegmensek KÖZEPÉN vannak, ezért a színek folyamatosan
    // olvadnak egymásba, nem sávokban ugranak.
    function nodeSprite(slots) {
      var key = slots.join('-');
      var cached = spriteCache[key];
      if (cached) return cached;

      var cv = document.createElement('canvas');
      cv.width = SPRITE_PX; cv.height = SPRITE_PX;
      var c2 = cv.getContext('2d');
      if (!c2) return null;

      var g = c2.createLinearGradient(0, 0, SPRITE_PX, SPRITE_PX);   // 135°-os átló
      var m = slots.length, j;
      g.addColorStop(0, catColor(slots[0]));
      for (j = 0; j < m; j++) g.addColorStop((j + 0.5) / m, catColor(slots[j]));
      g.addColorStop(1, catColor(slots[m - 1]));

      c2.fillStyle = g;
      c2.beginPath();
      c2.arc(SPRITE_PX / 2, SPRITE_PX / 2, SPRITE_PX / 2, 0, Math.PI * 2);
      c2.fill();

      spriteCache[key] = cv;
      return cv;
    }

    // ---------- nézet-jelentés ----------
    // A zoom és a lista összhangja: jelentjük, mely csomópontok vannak a
    // nézetben. Debounce-olva, hogy panolás/zoom közben ne áradjon.
    var lastVpSig = -1, vpTimer = 0;

    function scheduleViewport() {
      if (vpTimer) return;
      vpTimer = global.setTimeout(function () {
        vpTimer = 0;
        var ids = [], i;
        for (i = 0; i < nCount; i++) if (nvis[i]) ids.push(nid[i]);
        onViewport({ visibleIds: ids, zoomRatio: zoomRatio() });
      }, 90);
    }

    // ---------- rajz ----------
    function drawFrame() {
      if (W < 2 || H < 2) return;
      ctx.clearRect(0, 0, W, H);
      if (!nCount) return;

      updateVisualParams();
      var scale = fitBase * camZ;
      var hw = W / 2, hh = H / 2;
      var i, j, k, idx, sx, sy, r, m = 90;
      var pulse = reduced ? 0 : Math.sin(phase * 0.0021) * 0.5 + 0.5;

      // projekció + culling
      for (i = 0; i < nCount; i++) {
        sx = (nx[i] - camX) * scale + hw;
        sy = (ny[i] - camY) * scale + hh;
        r = nodeScreenR(i, scale);
        nsx[i] = sx; nsy[i] = sy; nscr[i] = r;
        nvis[i] = (sx > -m && sx < W + m && sy > -m && sy < H + m) ? 1 : 0;
      }

      // A látható halmaz jelzése a hívónak. Per-frame NEM allokálunk: csak egy
      // egész-szignatúrát számolunk, és eltérés esetén ütemezünk egy (debounce-olt)
      // visszahívást, ami akkor építi fel az id-listát.
      var vsig = 0, vcnt = 0;
      for (i = 0; i < nCount; i++) {
        if (nvis[i]) { vcnt++; vsig = (vsig * 31 + i + 1) % 2147483647; }
      }
      vsig = (vsig * 131 + vcnt * 7 + Math.round(zoomRatio() * 20)) % 2147483647;
      if (vsig !== lastVpSig) { lastVpSig = vsig; scheduleViewport(); }

      // 1) élek — két menet (alap / kiemelt), hogy a strokeStyle ne váltogasson
      ctx.lineWidth = 1;
      if (P.edge > 0.02) {
        ctx.strokeStyle = col.edgeStr;
        for (i = 0; i < eCount; i++) {
          if (ehl[i]) continue;
          if (!nvis[ea[i]] && !nvis[eb[i]]) continue;
          var wA = Math.min(1, 0.35 + ew[i] * 0.18);
          var al = (EDGE_A_BASE + wA * EDGE_A_WEIGHT) * P.edge * cfg.edge;
          if (dimActive && ndim[ea[i]] && ndim[eb[i]]) al *= 0.35;
          // szűrőből kiesett végpont: az él is visszahúzódik — a kapcsolat látszik,
          // de nem versenyez a szűrt halmaz éleivel
          if (outActive && (nout[ea[i]] || nout[eb[i]])) al *= EDGE_A_EXCLUDED;
          ctx.globalAlpha = al;
          ctx.beginPath();
          ctx.moveTo(nsx[ea[i]], nsy[ea[i]]);
          ctx.lineTo(nsx[eb[i]], nsy[eb[i]]);
          ctx.stroke();
        }
      }
      // A hoverelt/kijelölt csomópontból INDULÓ és oda BEFUTÓ élek: élénk
      // --accent, vastagabb vonal. Az alfa NEM a zoomból jön (nincs `P.edge`
      // tényező), így a kiemelés áttekintésben is ugyanolyan határozott.
      ctx.strokeStyle = col.edgeHiStr;
      ctx.lineWidth = EDGE_W_HI;
      for (i = 0; i < eCount; i++) {
        if (!ehl[i]) continue;
        if (!nvis[ea[i]] && !nvis[eb[i]]) continue;
        var wB = Math.min(1, 0.35 + ew[i] * 0.18);
        var alB = Math.min(0.95, (EDGE_A_HI + wB * EDGE_A_HI_WEIGHT) * cfg.edge);
        // a kijelölt szomszédsága is visszafogott, ha a másik vége kiesett a szűrőből
        if (outActive && (nout[ea[i]] || nout[eb[i]])) alB *= EDGE_A_EXCLUDED;
        ctx.globalAlpha = alB;
        ctx.beginPath();
        ctx.moveTo(nsx[ea[i]], nsy[ea[i]]);
        ctx.lineTo(nsx[eb[i]], nsy[eb[i]]);
        ctx.stroke();
      }
      ctx.lineWidth = 1;

      // 2) csomópontok — a rajzsorrend visszafelé: a súlyosabb kerül felülre
      for (j = nCount - 1; j >= 0; j--) {
        idx = order[j];
        if (!nvis[idx]) continue;
        drawNode(idx, pulse);
      }

      // 3) címkék — ütközés-budget + prioritás (kijelölt/hover, majd súly szerint)
      labelUsed = 0;
      var budget = Math.min(MAX_LABELS, labelBudget);
      if (selIdx >= 0 && nvis[selIdx]) labelFor(selIdx, budget, true);
      if (hovIdx >= 0 && hovIdx !== selIdx && nvis[hovIdx]) labelFor(hovIdx, budget, true);
      var docLabels = 0;
      for (j = 0; j < nCount && labelUsed < budget; j++) {
        idx = order[j];
        if (!nvis[idx] || idx === selIdx || idx === hovIdx) continue;
        if (P.docLabel <= 0.05) continue;
        if (!nmatch[idx]) {
          if (docLabels >= P.docLabelTop) continue;
          docLabels++;
        }
        if (dimActive && ndim[idx]) continue;
        if (outActive && nout[idx]) continue;      // kiesett csomópont nem kap feliratot
        labelFor(idx, budget, false);
      }
      ctx.globalAlpha = 1;
    }

    function drawNode(i, pulse) {
      var x = nsx[i], y = nsy[i], r = nscr[i];
      var t = ntype[i];
      var isSel = i === selIdx, isHov = i === hovIdx;
      var a = P.docAlpha;

      // A szűrőből kiesett dokumentum NEM tűnik el: halvány ÜRES karika marad
      // belőle. A jelentést nem a szín hordozza, hanem a KITÖLTÉS eltűnése — a
      // kategória-színt sem viszi tovább, így a paletta csak a szűrt halmazt
      // írja le. A méret marad (az továbbra is a súlyt jelenti).
      if (outActive && nout[i]) {
        ctx.globalAlpha = Math.min(0.55, a * 0.5);
        ctx.strokeStyle = col.textSubtle;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        return;
      }
      if (dimActive && ndim[i] && !isSel && !isHov) a *= 0.22;
      if (a < 0.02) return;

      if (isHov && !reduced) r *= 1 + 0.09 * pulse * cfg.pulse;
      if (isSel) r *= 1.12;

      // A kitöltés a KATEGÓRIÁ(I)T tükrözi: egy kategória = tömör szín, több
      // kategória = finom átmenet a színei között (sprite). Ha nincs kategória-
      // adat, a semleges --secondary marad.
      var slots = ncat[i];
      var fill = t === 2 ? col.accent : (slots ? catColor(slots[0]) : col.secondary);

      // kijelölés: --primary glória (nem csak szín: a méret és a gyűrű is jelzi)
      if (isSel) {
        ctx.fillStyle = col.primary;
        var g = (reduced ? 0.5 : 0.35 + 0.3 * pulse) * cfg.glow;
        ctx.globalAlpha = 0.10 * g;
        ctx.beginPath(); ctx.arc(x, y, r * 3.1, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.16 * g;
        ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();
      }

      // találat-jelzés: --secondary→ itt inkább --primary gyűrű, hogy a kék testtől
      // is jól elváljon a keresés-kiemelés
      if (nmatch[i]) {
        ctx.strokeStyle = col.primary;
        ctx.globalAlpha = Math.min(0.9, 0.55 * a + 0.3);
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }

      // test
      ctx.globalAlpha = a;
      if (slots && slots.length > 1) {
        // több kategória → az előre renderelt színátmenet-sprite
        var sp = nodeSprite(slots);
        if (sp) ctx.drawImage(sp, x - r, y - r, r * 2, r * 2);
        else { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
      } else {
        ctx.fillStyle = fill;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }

      // --surface keret, hogy sűrű részen is elváljanak a csomópontok
      if (r > 2.5) {
        ctx.strokeStyle = col.surface;
        ctx.globalAlpha = a * 0.85;
        ctx.lineWidth = Math.min(2, Math.max(1, r * 0.22));
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
      if (isSel || isHov) {
        ctx.strokeStyle = col.primary;
        ctx.globalAlpha = isSel ? 0.95 : 0.6;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2); ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    function labelWidthOf(i, sizePx, baseSize) {
      if (nlabelW[i] < 0) nlabelW[i] = ctx.measureText(nlabel[i]).width;
      return nlabelW[i] * (sizePx / baseSize);
    }

    function labelFor(i, budget, forced) {
      if (labelUsed >= budget) return;
      var alpha = Math.max(P.docLabel, forced ? 0.9 : 0);
      if (alpha < 0.06) return;
      if (dimActive && ndim[i] && !forced) alpha *= 0.35;

      var baseSize = col.docFontPx;
      ctx.font = col.fontDocBase;
      var tw = labelWidthOf(i, baseSize, baseSize);
      var th = baseSize * 1.25;
      var x = nsx[i], y = nsy[i] + nscr[i] + th * 0.9;
      var left = x - tw / 2, top = y - th * 0.8;

      // ütközés-teszt a már kiosztott címkékkel
      var padX = 4, padY = 2, q;
      for (q = 0; q < labelUsed; q++) {
        var o = q * 4;
        if (left - padX < labelRects[o] + labelRects[o + 2] && left + tw + padX > labelRects[o] &&
            top - padY < labelRects[o + 1] + labelRects[o + 3] && top + th + padY > labelRects[o + 1]) {
          if (!forced) return;
        }
      }
      var off = labelUsed * 4;
      labelRects[off] = left; labelRects[off + 1] = top;
      labelRects[off + 2] = tw; labelRects[off + 3] = th;
      labelUsed++;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // olvashatósági alap: --surface halvány pasztilla (nem új szín, tokenből)
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = col.surface;
      roundRect(left - 4, top - 1, tw + 8, th + 2, Math.min(6, th / 2));
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i === selIdx ? col.text : col.textMuted;
      ctx.fillText(nlabel[i], x, top + th / 2);
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    // ---------- hit-test (rács-index, nem O(n) minden pointermove-ra) ----------
    function hitTest(px, py) {
      if (!nCount || W < 2 || fitBase <= 0) return -1;
      var scale = fitBase * camZ;
      var wx = (px - W / 2) / scale + camX;
      var wy = (py - H / 2) / scale + camY;
      var reachPx = 18 * zoomFactor() + 8;
      var reach = reachPx / scale;
      var ix0 = Math.floor((wx - reach - gx0) / gw), ix1 = Math.floor((wx + reach - gx0) / gw);
      var iy0 = Math.floor((wy - reach - gy0) / gh), iy1 = Math.floor((wy + reach - gy0) / gh);
      if (ix0 < 0) ix0 = 0; if (iy0 < 0) iy0 = 0;
      if (ix1 > G - 1) ix1 = G - 1; if (iy1 > G - 1) iy1 = G - 1;
      var best = -1, bestD = Infinity, gxi, gyi, s, e, j, i, dx, dy, d, r;
      for (gyi = iy0; gyi <= iy1; gyi++) {
        for (gxi = ix0; gxi <= ix1; gxi++) {
          s = cellStart[gyi * G + gxi]; e = cellStart[gyi * G + gxi + 1];
          for (j = s; j < e; j++) {
            i = cellItems[j];
            if (outActive && nout[i]) continue;    // a kiesett csomópont inert: átlépünk rajta
            // a pozíciót itt is számoljuk (nem a rajzolt puffert olvassuk) — így akkor is
            // helyes, ha még nem futott képkocka
            dx = ((nx[i] - camX) * scale + W / 2) - px;
            dy = ((ny[i] - camY) * scale + H / 2) - py;
            d = dx * dx + dy * dy;
            r = nodeScreenR(i, scale) + 6;
            if (d <= r * r && d < bestD) { bestD = d; best = i; }
          }
        }
      }
      return best;
    }

    function getNodeScreenRect(id) {
      var i = idIndex[id];
      if (i == null || W < 2) return null;
      var scale = fitBase * camZ;
      var sx = (nx[i] - camX) * scale + W / 2;
      var sy = (ny[i] - camY) * scale + H / 2;
      var r = nodeScreenR(i, scale);
      var rect = canvas.getBoundingClientRect();
      return {
        left: rect.left + sx - r,
        top: rect.top + sy - r,
        width: r * 2,
        height: r * 2
      };
    }

    // ---------- interakció ----------
    var dragging = false, dragMoved = false, downX = 0, downY = 0, lastPX = 0, lastPY = 0, downId = -1;
    var DRAG_SLOP = 4;

    function onPointerDown(e) {
      if (e.button != null && e.button !== 0) return;
      var rect = canvas.getBoundingClientRect();
      downX = lastPX = e.clientX - rect.left;
      downY = lastPY = e.clientY - rect.top;
      dragging = true; dragMoved = false;
      downId = hitTest(downX, downY);
      if (canvas.setPointerCapture && e.pointerId != null) {
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }
    }

    function onPointerMove(e) {
      var rect = canvas.getBoundingClientRect();
      var px = e.clientX - rect.left, py = e.clientY - rect.top;
      if (dragging) {
        if (!dragMoved && (Math.abs(px - downX) > DRAG_SLOP || Math.abs(py - downY) > DRAG_SLOP)) dragMoved = true;
        if (dragMoved) {
          var scale = fitBase * camZ;
          if (scale > 0) {
            camTouched = true;
            camX -= (px - lastPX) / scale;
            camY -= (py - lastPY) / scale;
            camT = 1; frX = toX = camX; frY = toY = camY; frZ = toZ = camZ;
            panClamp();
            requestDraw();
          }
        }
        lastPX = px; lastPY = py;
        return;
      }
      var hit = hitTest(px, py);
      var id = hit >= 0 ? nid[hit] : null;
      if (id !== hoverId) {
        hoverId = id;
        hovIdx = hit;
        markSelectedEdges();
        requestDraw();
        onHover(id);
      }
    }

    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      if (canvas.releasePointerCapture && e.pointerId != null) {
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      }
      if (dragMoved) { dragMoved = false; return; }     // húzás sosem választ ki
      var rect = canvas.getBoundingClientRect();
      var hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
      if (hit < 0) hit = downId;
      onSelect(hit >= 0 ? nid[hit] : null);
    }

    function onPointerLeave() {
      if (hoverId !== null) {
        hoverId = null; hovIdx = -1;
        markSelectedEdges();
        requestDraw();
        onHover(null);
      }
    }

    function onWheel(e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var px = e.clientX - rect.left, py = e.clientY - rect.top;
      var scale = fitBase * camZ;
      if (scale <= 0) return;
      var wx = (px - W / 2) / scale + camX;
      var wy = (py - H / 2) / scale + camY;
      // Érzékeny zoom: egy görgetés-notch (~100px delta) ~1.5× — így 2-3
      // mozdulatból le lehet érni a dokumentum-szintre, nem 5-6-ból.
      var factor = Math.exp(-(e.deltaY || 0) * (e.deltaMode === 1 ? 0.12 : 0.0042));
      var nz = clamp(camZ * factor, ovZoom * 0.55, ovZoom * 12);
      camTouched = true;
      camZ = nz;
      var s2 = fitBase * camZ;
      camX = wx - (px - W / 2) / s2;
      camY = wy - (py - H / 2) / s2;
      camT = 1; frX = toX = camX; frY = toY = camY; frZ = toZ = camZ;
      panClamp();
      requestDraw();
    }

    // ---------- rAF ----------
    var raf = 0, running = false, lastT = 0;

    function frameFn(ts) {
      if (!running) return;
      if (!lastT) lastT = ts;
      var dt = ts - lastT;
      if (dt > 50) dt = 50;
      lastT = ts;
      phase += dt;
      stepCamera(dt);
      drawFrame();
      raf = global.requestAnimationFrame(frameFn);
    }

    function start() {
      if (reduced) { drawFrame(); return; }
      if (running) return;
      running = true; lastT = 0;
      raf = global.requestAnimationFrame(frameFn);
    }

    function stop() {
      running = false;
      if (raf) global.cancelAnimationFrame(raf);
      raf = 0;
    }

    // reduced-motion: nincs ciklus — egyetlen statikus képkocka, azonnali állapottal
    var inDraw = false;
    function requestDraw() {
      if (running || inDraw) return;         // újrabelépés-védelem
      inDraw = true;
      if (reduced) camT = 1;
      drawFrame();
      inDraw = false;
    }

    // ---------- életciklus ----------
    function onVisibility() {
      if (document.hidden) stop();
      else if (!reduced) start();
    }

    canvas.style.touchAction = 'none';       // hogy a pointer-drag ne görgessen mobilon
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('visibilitychange', onVisibility);

    function destroy() {
      stop();
      if (vpTimer) { global.clearTimeout(vpTimer); vpTimer = 0; }
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    // init
    ensureNodeCap(0); ensureEdgeCap(0);
    cellStart = new Int32Array(2); cellItems = new Int32Array(16);
    refreshColors();
    resize();

    return {
      setData: setData,
      setHighlight: setHighlight,
      setDimmed: setDimmed,
      setExcluded: setExcluded,
      focusOn: focusOn,
      toOverview: toOverview,
      getNodeScreenRect: getNodeScreenRect,
      start: start,
      stop: stop,
      resize: resize,
      refreshColors: refreshColors,
      destroy: destroy
    };
  }

  global.createAtlasRenderer = createAtlasRenderer;
})(window);
