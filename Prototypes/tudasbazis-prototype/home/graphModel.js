/* graphModel.js — az Élő Atlasz adatrétege (Tier 0). Önálló modul.
 *
 * Nyers dokumentum-metaadatból SZÁRMAZTATOTT, könnyű gráfot épít:
 *   csomópont = dokumentum
 *   él        = közös kategória („topic") / közös közreműködő („coauthor")
 *
 * A KATEGÓRIA NEM FIZIKAI HELY — nincs domén-csomópont, nincs „téma-kör".
 * Egy dokumentum ugyanolyan súllyal tartozhat több kategóriába is; ez korábban
 * (amikor a kategória volt a térkép szerkezete) követhetetlenné tette a többkate-
 * góriás dokumentumok elhelyezését. Most a kategória tisztán SZŰRŐ/facet (lásd
 * `applyFacets`); az elrendezést a dokumentumok KAPCSOLATA (közös kategória / közös
 * szerző → él) adja, erő-alapú, de DETERMINISZTIKUS szimulációval (a pszeudo-
 * véletlen az azonosító hash-éből jön, nincs Math.random). Kemény ütközés-
 * feloldás zárja ki, hogy dokumentum-csomópontok fedjék egymást.
 *
 * Publikus API:
 *   createGraphModel(raw, { tier: 0 })
 *     .getOverview()                      -> { nodes, edges }
 *     .getNeighborhood(id, { max: 32 })   -> { nodes, edges }
 *     .search(q, { max: 60 })             -> { nodes, edges, matchIds }
 *     .applyFacets(facets)                -> { docIds, nodeIds }   // facets.categories: [name,...] (VAGY-kapcsolat)
 *     .nodeById(id) .nodeForDoc(docId) .categorySlots() .stats()
 *
 * Kurálás: szomszédság ≤ 32, keresés ≤ 60 találat; EGYETLEN getter sem ad
 * vissza 150-nél több csomópontot.
 */
(function (global) {
  'use strict';

  var WORLD = 1000;                       // világ-négyzet oldala (0..1000)
  var TAU = Math.PI * 2;
  var MAX_NODES = 150;                    // kemény sapka minden getterre
  var MAX_EDGES_PER_NODE = 5;             // fokszám-sapka (a legsúlyosabbak maradnak)
  var MAX_EDGES_RETURNED = 420;
  var PAIRING_LIMIT = 120;                // párosítási védőkorlát nagy csoportokra
  var DAY = 86400000;

  // Csomópont-sugár (px az ÁTTEKINTÉS zoomján). A minimum azért ilyen nagy, hogy
  // a legkisebb csomópont is jól látható és kényelmesen kattintható maradjon —
  // a renderer ezen felül még egy px-alapú padlót is tart (MIN_NODE_R).
  var NODE_R_MIN = 8;
  var NODE_R_MAX = 18;

  // Kategória-paletta slotjai (tokens.css --catcolor-1..8). Egy kategória slotja
  // a kanonikus kategória-sorrendből jön, így stabil: nem vándorol akkor sem, ha
  // egy kategória dokumentumot kap vagy elveszít.
  var CAT_PALETTE_SIZE = 8;

  // ---------- erő-alapú, ütközésmentes elrendezés ----------
  // Csak KAPCSOLAT (közös kategória / közös szerző) rendezi a teret — a
  // kategória-NÉV sosem határoz meg pozíciót. Determinisztikus kezdőpozíció +
  // rögzített iterációszám (nincs Math.random) → újratöltés után is ugyanott.
  var FORCE_ITERS = 220;
  var REPEL_K = 26000;                    // taszítás (minden pár közt, d² szerint gyengül)
  var SPRING_K = 0.012;                   // rugóállandó a kapcsolt pároknál (Hooke)
  var SPRING_PAD = 30;                    // egy kapcsolt pár "nyugalmi" rése a sugaraikon felül
  var CENTER_K = 0.0006;                  // enyhe húzás a világ közepe felé (ne sodródjon el)
  var MAX_STEP = 14;                      // egy iterációban max ennyit mozoghat egy pont
  var DOC_PAD = 8;                        // végső ütközésfeloldás: minimális rés a sugarakon felül
  // Ez a lépés O(n²·iter) — ennél a prototípus-méretnél (néhány tíz-száz doksi)
  // ez ezredmásodperces modell-építést jelent; nagyobb korpusznál (Tier 1/2,
  // valódi méretskála) ezt már a `getView` webworkerbe/inkrementálisra kellene
  // váltani, de ez itt szándékosan NEM szükséges korai optimalizálás.

  // egyszerű diakritika-hajtogatás (magyar + gyakori latin) a kereséshez
  var FOLD_FROM = 'áàâäãåéèêëíìîïóòôöõúùûüőűçñ';
  var FOLD_TO = 'aaaaaaeeeeiiiiooooouuuuoucn';

  // ---------- segédek ----------
  function fold(s) {
    s = String(s == null ? '' : s).toLowerCase();
    var out = '', i, k;
    for (i = 0; i < s.length; i++) {
      k = FOLD_FROM.indexOf(s.charAt(i));
      out += k >= 0 ? FOLD_TO.charAt(k) : s.charAt(i);
    }
    return out;
  }

  // FNV-1a — determinisztikus, stabil azonosító-hash
  function hash32(str) {
    var h = 2166136261, i;
    for (i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
  }
  function hash01(id, salt) {
    return (hash32(salt + ':' + String(id)) >>> 8) / 16777216;   // 0..1
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // súly → rajzolási sugár (px, zoom 1-en). sqrt: a nagy súlyok ne domináljanak.
  function mapRadius(w, minW, maxW, lo, hi) {
    if (!(maxW > minW)) return (lo + hi) / 2;
    var t = clamp((w - minW) / (maxW - minW), 0, 1);
    return lo + Math.sqrt(t) * (hi - lo);
  }

  function pushUnique(arr, seen, id) {
    if (seen[id]) return false;
    seen[id] = 1; arr.push(id); return true;
  }

  function countDistinct(list) {
    var seen = {}, n = 0, i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && !seen[list[i]]) { seen[list[i]] = 1; n++; }
    }
    return n;
  }

  function createGraphModel(raw, options) {
    options = options || {};
    var tier = options.tier || 0;                 // 0 = származtatott gráf (ma ez a valóság)
    raw = raw || {};

    var rawDocs = raw.docs || [];
    var rawCats = raw.categories || [];
    var rawUsers = raw.users || [];
    var currentUserId = raw.currentUserId || null;
    var nowMs = typeof raw.now === 'number' ? raw.now : Date.now();

    var userName = {};                            // userId -> hajtogatott név (kereséshez)
    var ui;
    for (ui = 0; ui < rawUsers.length; ui++) {
      if (rawUsers[ui] && rawUsers[ui].id) userName[rawUsers[ui].id] = fold(rawUsers[ui].name || '');
    }

    // ---------- 1. kategóriák — CSAK metaadat/facet, nincs pozíciójuk ----------
    var cats = [];                                // { id, name, key, description, docs: [docIndex] }
    var catByName = {};
    var ci, c;

    function ensureCat(name) {
      var key = fold(name);
      if (catByName[key]) return catByName[key];
      c = { id: '', name: String(name), key: key, description: '', docs: [] };
      catByName[key] = c;
      cats.push(c);
      return c;
    }

    for (ci = 0; ci < rawCats.length; ci++) {
      if (!rawCats[ci] || !rawCats[ci].name) continue;
      c = ensureCat(rawCats[ci].name);
      c.id = rawCats[ci].id || ('c-' + c.key);
      c.description = rawCats[ci].description || '';
    }

    // ---------- 2. dokumentumok ----------
    var items = [];                               // { doc, node, cats: [cat], contributors: [], labelFold, hayFold }
    var di, d, k, cat, contribs, seenContrib, aid;

    for (di = 0; di < rawDocs.length; di++) {
      d = rawDocs[di];
      if (!d || !d.id) continue;
      if (d.deletedAt) continue;                  // törölt/archivált dokumentum nem kap csomópontot

      contribs = []; seenContrib = {};
      if (d.ownerId) { seenContrib[d.ownerId] = 1; contribs.push(d.ownerId); }
      if (d.authorIds) {
        for (k = 0; k < d.authorIds.length; k++) {
          aid = d.authorIds[k];
          if (aid && !seenContrib[aid]) { seenContrib[aid] = 1; contribs.push(aid); }
        }
      }

      var myCats = [];
      var seenCat = {};
      if (d.categories) {
        for (k = 0; k < d.categories.length; k++) {
          if (!d.categories[k]) continue;
          cat = ensureCat(d.categories[k]);
          if (!cat.id) cat.id = 'c-' + cat.key;
          if (seenCat[cat.key]) continue;
          seenCat[cat.key] = 1;
          myCats.push(cat);
        }
      }
      if (myCats.length === 0) myCats.push(ensureCat('Egyéb'));   // kategória nélküli doksi gyűjtője
      if (!myCats[0].id) myCats[0].id = 'c-' + myCats[0].key;

      var item = {
        doc: d,
        cats: myCats,
        contributors: contribs,
        authorCount: d.authorIds ? countDistinct(d.authorIds) : 0,
        node: null,
        labelFold: fold(d.title || d.id),
        hayFold: '',
        px: 0, py: 0, r: 5, weight: 1
      };
      // A keresési szénakazalba a dokumentum TARTALMA is belekerül (`text`) —
      // a tudástár keresése cím ÉS tartalom szerint találjon (MVP-4), ezért ad
      // a lista tartalmi részletet (snippetet) is a találathoz.
      var hay = fold(d.title || '') + ' ' + fold(d.status || '') + ' ' + fold(d.text || '');
      for (k = 0; k < myCats.length; k++) hay += ' ' + myCats[k].key;
      for (k = 0; k < contribs.length; k++) hay += ' ' + (userName[contribs[k]] || '');
      item.hayFold = hay;

      var idx = items.length;
      items.push(item);
      for (k = 0; k < myCats.length; k++) myCats[k].docs.push(idx);
    }

    var n = items.length, it, i;

    // Kategória → paletta-slot a KANONIKUS sorrend szerint (a `cats` tömb a
    // raw.categories sorrendjét követi, majd a dokumentumokból előkerülő
    // extrákat fűzi utána). Az üres kategóriák is slotot foglalnak, hogy a
    // színek ne vándoroljanak, amikor egy kategória kiürül vagy megtelik.
    var catSlotByKey = {};
    for (ci = 0; ci < cats.length; ci++) {
      catSlotByKey[cats[ci].key] = (ci % CAT_PALETTE_SIZE) + 1;
    }

    // üres kategóriák kiszórása a facet-listából (nincs dokumentumuk)
    var liveCats = [];
    for (ci = 0; ci < cats.length; ci++) if (cats[ci].docs.length > 0) liveCats.push(cats[ci]);
    liveCats.sort(function (a, b) {
      if (b.docs.length !== a.docs.length) return b.docs.length - a.docs.length;
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });

    // ---------- 3. dokumentum-súlyok (iteráció + frissesség + közreműködők) ----------
    var minDocW = Infinity, maxDocW = -Infinity, ageDays, recency, w;
    for (i = 0; i < n; i++) {
      it = items[i];
      ageDays = Math.max(0, (nowMs - (it.doc.updatedAt || 0)) / DAY);
      recency = clamp(1 - ageDays / 90, 0, 1);
      w = (it.doc.iteration || 1) + recency * 3 + Math.max(0, it.contributors.length - 1) * 0.6;
      it.weight = w;
      if (w < minDocW) minDocW = w;
      if (w > maxDocW) maxDocW = w;
    }
    if (!isFinite(minDocW)) { minDocW = 0; maxDocW = 1; }
    for (i = 0; i < n; i++) items[i].r = mapRadius(items[i].weight, minDocW, maxDocW, NODE_R_MIN, NODE_R_MAX);

    // ---------- 4. élek (Tier 0: közös kategória + közös közreműködő) ----------
    // MEG KELL előznie az elrendezést: az erő-szimuláció a kapcsolatot (élt)
    // használja rugóként — a kategória csak azon keresztül hat a helyre, hogy
    // KAPCSOLATOT jelent, nem azáltal, hogy „hazát" ad.
    var pairMap = {};                             // "i|j" -> { t: közös kategória, c: közös közreműködő }
    var a, b, key2;

    function bumpPair(x1, x2, field) {
      if (x1 === x2) return;
      a = x1 < x2 ? x1 : x2;
      b = x1 < x2 ? x2 : x1;
      key2 = a + '|' + b;
      var p = pairMap[key2];
      if (!p) { p = { t: 0, c: 0 }; pairMap[key2] = p; }
      p[field] += 1;
    }

    function limitedGroup(list) {
      if (list.length <= PAIRING_LIMIT) return list;
      var copy = list.slice(0);
      copy.sort(function (x, y) {
        var dw = items[y].weight - items[x].weight;
        if (dw) return dw;
        return items[x].doc.id < items[y].doc.id ? -1 : 1;
      });
      return copy.slice(0, PAIRING_LIMIT);
    }

    // közös kategória
    for (ci = 0; ci < liveCats.length; ci++) {
      var grp = limitedGroup(liveCats[ci].docs);
      for (i = 0; i < grp.length; i++) {
        for (k = i + 1; k < grp.length; k++) bumpPair(grp[i], grp[k], 't');
      }
    }

    // közös közreműködő
    var byContrib = {};
    for (i = 0; i < n; i++) {
      var cl = items[i].contributors;
      for (k = 0; k < cl.length; k++) {
        if (!byContrib[cl[k]]) byContrib[cl[k]] = [];
        byContrib[cl[k]].push(i);
      }
    }
    for (var cid in byContrib) {
      if (!Object.prototype.hasOwnProperty.call(byContrib, cid)) continue;
      var g2 = limitedGroup(byContrib[cid]);
      for (i = 0; i < g2.length; i++) {
        for (k = i + 1; k < g2.length; k++) bumpPair(g2[i], g2[k], 'c');
      }
    }

    // jelöltek → fokszám-sapka (max 5 él / csomópont, a legsúlyosabbak nyernek)
    var cand = [];
    for (var pk in pairMap) {
      if (!Object.prototype.hasOwnProperty.call(pairMap, pk)) continue;
      var parts = pk.split('|');
      var pa = +parts[0], pb = +parts[1];
      var pv = pairMap[pk];
      cand.push({ a: pa, b: pb, w: pv.t + pv.c, type: pv.t > 0 ? 'topic' : 'coauthor' });
    }
    cand.sort(function (x, y) {
      if (y.w !== x.w) return y.w - x.w;
      var ia = items[x.a].doc.id + items[x.b].doc.id;
      var ib = items[y.a].doc.id + items[y.b].doc.id;
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    });

    var deg = new Uint16Array(Math.max(1, n));
    var docEdges = [];                            // { source, target, type, weight } — node-id-kkel (lásd lentebb)
    var edgePairs = [];                            // { a, b, weight } — item-indexekkel, a layout-hoz
    var adj = {};                                  // nodeId -> [{ id, weight }]
    function nodeIdOf(itemIdx) { return 'doc:' + items[itemIdx].doc.id; }
    function addAdj(idA, idB, weight) {
      if (!adj[idA]) adj[idA] = [];
      adj[idA].push({ id: idB, weight: weight });
    }
    for (i = 0; i < cand.length; i++) {
      var e = cand[i];
      if (deg[e.a] >= MAX_EDGES_PER_NODE || deg[e.b] >= MAX_EDGES_PER_NODE) continue;
      deg[e.a]++; deg[e.b]++;
      var idA = nodeIdOf(e.a), idB = nodeIdOf(e.b);
      docEdges.push({ source: idA, target: idB, type: e.type, weight: e.w });
      edgePairs.push({ a: e.a, b: e.b, weight: e.w });
      addAdj(idA, idB, e.w);
      addAdj(idB, idA, e.w);
    }
    for (var ak in adj) {
      if (!Object.prototype.hasOwnProperty.call(adj, ak)) continue;
      adj[ak].sort(function (x, y) {
        if (y.weight !== x.weight) return y.weight - x.weight;
        return x.id < y.id ? -1 : 1;
      });
    }

    // ---------- 5. elrendezés: erő-szimuláció (kapcsolat) + kemény ütközésfeloldás ----------
    // Determinisztikus kezdőpozíció az azonosító hash-éből (nincs Math.random).
    for (i = 0; i < n; i++) {
      it = items[i];
      var ang0 = hash01(it.doc.id, 'ix') * TAU;
      var rad0 = WORLD * 0.32 * Math.sqrt(hash01(it.doc.id, 'ir'));
      it.px = WORLD / 2 + Math.cos(ang0) * rad0;
      it.py = WORLD / 2 + Math.sin(ang0) * rad0;
    }

    if (n > 1) {
      var fx = new Float64Array(n), fy = new Float64Array(n);
      var iter, dx, dy, d2, d, f, ux, uy, damp;
      for (iter = 0; iter < FORCE_ITERS; iter++) {
        fx.fill(0); fy.fill(0);
        // taszítás — minden pár közt (a kapcsolatlan doksik is szétnyíljanak)
        for (i = 0; i < n; i++) {
          for (k = i + 1; k < n; k++) {
            dx = items[i].px - items[k].px; dy = items[i].py - items[k].py;
            d2 = dx * dx + dy * dy; if (d2 < 1) d2 = 1;
            d = Math.sqrt(d2);
            f = REPEL_K / d2;
            ux = dx / d; uy = dy / d;
            fx[i] += ux * f; fy[i] += uy * f;
            fx[k] -= ux * f; fy[k] -= uy * f;
          }
        }
        // rugó a kapcsolt pároknál — a nyugalmi hossz a sugarakhoz igazodik
        for (i = 0; i < edgePairs.length; i++) {
          var ep = edgePairs[i];
          var A = items[ep.a], B = items[ep.b];
          dx = B.px - A.px; dy = B.py - A.py;
          d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          var target = A.r + B.r + SPRING_PAD;
          f = SPRING_K * (d - target) * Math.min(3, ep.weight);
          ux = dx / d; uy = dy / d;
          fx[ep.a] += ux * f; fy[ep.a] += uy * f;
          fx[ep.b] -= ux * f; fy[ep.b] -= uy * f;
        }
        // enyhe középre-húzás, hogy az egész ne sodródjon el a világ szélére
        for (i = 0; i < n; i++) {
          fx[i] += (WORLD / 2 - items[i].px) * CENTER_K;
          fy[i] += (WORLD / 2 - items[i].py) * CENTER_K;
        }
        damp = 1 - (iter / FORCE_ITERS) * 0.55;                 // idővel csillapodik → stabilizálódik
        for (i = 0; i < n; i++) {
          items[i].px += clamp(fx[i] * damp, -MAX_STEP, MAX_STEP);
          items[i].py += clamp(fy[i] * damp, -MAX_STEP, MAX_STEP);
        }
      }

      // Kemény ütközésfeloldás: dokumentum-csomópontok SOSE fedjék egymást,
      // függetlenül attól, hogy hány kategórián/kapcsolaton keresztül húzzák
      // őket egymáshoz az erő-szimulációban.
      var relaxA, relaxB, rdx, rdy, rd, need, push, rux, ruy, moved;
      for (iter = 0; iter < 250; iter++) {
        moved = false;
        for (relaxA = 0; relaxA < n; relaxA++) {
          for (relaxB = relaxA + 1; relaxB < n; relaxB++) {
            var IA = items[relaxA], IB = items[relaxB];
            rdx = IB.px - IA.px; rdy = IB.py - IA.py;
            rd = Math.sqrt(rdx * rdx + rdy * rdy);
            need = IA.r + IB.r + DOC_PAD;
            if (rd >= need) continue;
            if (rd < 0.0001) { rdx = Math.cos(relaxA * 2.399963229728653); rdy = Math.sin(relaxA * 2.399963229728653); rd = 1; }
            push = (need - rd) / 2;
            rux = rdx / rd; ruy = rdy / rd;
            IA.px -= rux * push; IA.py -= ruy * push;
            IB.px += rux * push; IB.py += ruy * push;
            moved = true;
          }
        }
        if (!moved) break;
      }

      // a szerkezetet a világ közepére igazítjuk (a renderer illeszti a kamerát,
      // de tartsuk a koordinátákat rendben)
      var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (i = 0; i < n; i++) {
        it = items[i];
        if (it.px - it.r < bx0) bx0 = it.px - it.r;
        if (it.py - it.r < by0) by0 = it.py - it.r;
        if (it.px + it.r > bx1) bx1 = it.px + it.r;
        if (it.py + it.r > by1) by1 = it.py + it.r;
      }
      var offX = WORLD / 2 - (bx0 + bx1) / 2, offY = WORLD / 2 - (by0 + by1) / 2;
      for (i = 0; i < n; i++) { items[i].px += offX; items[i].py += offY; }
    }

    // ---------- 6. csomópontok ----------
    var nodes = [];
    var byId = {};
    var docNode = {};                             // docId -> node
    var itemByDocId = {};

    for (i = 0; i < n; i++) {
      it = items[i];
      var tags = [], slots = [];
      for (k = 0; k < it.cats.length; k++) {
        tags.push(it.cats[k].name);
        slots.push(catSlotByKey[it.cats[k].key] || CAT_PALETTE_SIZE);
      }

      it.node = {
        id: nodeIdOf(i),
        label: it.doc.title || it.doc.id,
        type: 'document',
        x: clamp(it.px, 24, WORLD - 24),
        y: clamp(it.py, 24, WORLD - 24),
        weight: it.weight,
        r: it.r,
        docId: it.doc.id,
        tags: tags,
        // paletta-slotok a kategóriáihoz; több kategória = a renderer finom
        // színátmenettel osztja meg a csomópontot
        catSlots: slots,
        updatedAt: it.doc.updatedAt || 0,
        status: it.doc.status || ''
      };
      nodes.push(it.node);
      byId[it.node.id] = it.node;
      docNode[it.doc.id] = it.node;
      itemByDocId[it.doc.id] = it;
    }

    // ---------- 7. facet-állapot ----------
    var activeSet = null;                         // null = minden dokumentum aktív
    var activeCount = n;

    function isActiveDoc(docId) { return activeSet === null || !!activeSet[docId]; }
    function isActiveNode(node) { return !node ? false : isActiveDoc(node.docId); }

    // ---------- 8. eredmény-összeállítás ----------
    function buildResult(idList, extraEdges) {
      var seen = {}, out = [], i2, n2;
      for (i2 = 0; i2 < idList.length && out.length < MAX_NODES; i2++) {
        if (seen[idList[i2]]) continue;
        n2 = resolveNode(idList[i2]);
        if (!n2) continue;
        seen[idList[i2]] = 1;
        out.push(n2);
      }

      var inSet = {};
      for (i2 = 0; i2 < out.length; i2++) inSet[out[i2].id] = 1;

      var edges = [];
      for (i2 = 0; i2 < docEdges.length && edges.length < MAX_EDGES_RETURNED; i2++) {
        if (inSet[docEdges[i2].source] && inSet[docEdges[i2].target]) edges.push(docEdges[i2]);
      }
      if (extraEdges) {
        for (i2 = 0; i2 < extraEdges.length && edges.length < MAX_EDGES_RETURNED; i2++) {
          if (inSet[extraEdges[i2].source] && inSet[extraEdges[i2].target]) edges.push(extraEdges[i2]);
        }
      }
      return { nodes: out, edges: edges };
    }

    function resolveNode(id) {
      var nd = byId[id];
      if (!nd || !isActiveNode(nd)) return null;
      return nd;
    }

    // ---------- 9. publikus getterek ----------
    function sortByWeightDesc(idxList) {
      idxList.sort(function (x, y) {
        var dw = items[y].weight - items[x].weight;
        if (dw) return dw;
        return items[x].doc.id < items[y].doc.id ? -1 : 1;
      });
      return idxList;
    }

    function getOverview() {
      var pool = [], i2;
      for (i2 = 0; i2 < n; i2++) if (isActiveDoc(items[i2].doc.id)) pool.push(i2);
      sortByWeightDesc(pool);
      var ids = [], seen = {};
      for (i2 = 0; i2 < pool.length && ids.length < MAX_NODES; i2++) pushUnique(ids, seen, items[pool[i2]].node.id);
      return buildResult(ids, null);
    }

    function getNeighborhood(id, opts) {
      var max = (opts && opts.max) || 32;
      var node = byId[id];
      if (!node) return getOverview();

      var ids = [], seen = {}, i2;
      pushUnique(ids, seen, node.id);
      var nb = adj[node.id] || [];
      for (i2 = 0; i2 < nb.length && ids.length <= max; i2++) {
        if (resolveNode(nb[i2].id)) pushUnique(ids, seen, nb[i2].id);
      }
      // másodfokú szomszédok, ha még van hely a rangsorban
      if (ids.length < max) {
        var first = ids.slice(1);
        for (var f = 0; f < first.length && ids.length <= max; f++) {
          var nb2 = adj[first[f]] || [];
          for (i2 = 0; i2 < nb2.length && ids.length <= max; i2++) {
            if (resolveNode(nb2[i2].id)) pushUnique(ids, seen, nb2[i2].id);
          }
        }
      }
      return buildResult(ids, null);
    }

    function search(query, opts) {
      var max = (opts && opts.max) || 60;
      var q = fold(query || '').replace(/^\s+|\s+$/g, '');
      if (!q) {
        var base = getOverview();
        base.matchIds = [];
        return base;
      }

      var scored = [], i2, sc, lf, pos;
      for (i2 = 0; i2 < n; i2++) {
        it = items[i2];
        if (!isActiveDoc(it.doc.id)) continue;
        sc = 0;
        lf = it.labelFold;
        if (lf.indexOf(q) === 0) sc = 100;
        else {
          pos = lf.indexOf(q);
          if (pos > 0) sc = lf.charAt(pos - 1) === ' ' ? 80 : 60;
          else if (it.hayFold.indexOf(q) >= 0) sc = 38;
        }
        if (!sc) continue;
        scored.push({ i: i2, s: sc + Math.min(9, it.weight * 0.5) });
      }
      scored.sort(function (x, y) {
        if (y.s !== x.s) return y.s - x.s;
        return items[x.i].doc.id < items[y.i].doc.id ? -1 : 1;
      });

      var ids = [], seen = {}, matchIds = [];
      for (i2 = 0; i2 < scored.length && i2 < max; i2++) {
        var n2 = items[scored[i2].i].node;
        if (pushUnique(ids, seen, n2.id)) matchIds.push(n2.id);
      }
      // közvetlen kapcsolatok (kontextus) — a találatok nem lógnak a levegőben
      var hits = ids.slice(0);
      for (i2 = 0; i2 < hits.length && ids.length < MAX_NODES - 20; i2++) {
        var nbc = adj[hits[i2]] || [];
        for (k = 0; k < nbc.length && k < 2; k++) {
          if (resolveNode(nbc[k].id)) pushUnique(ids, seen, nbc[k].id);
        }
      }

      var res = buildResult(ids, null);
      res.matchIds = matchIds;
      return res;
    }

    // facets.categories: [kategórianév, ...] — VAGY-kapcsolat (bármelyik egyezés elég)
    function applyFacets(facets) {
      facets = facets || {};
      var today = !!facets.today, mine = !!facets.mine, team = !!facets.team;
      var onlyFav = !!facets.onlyFav, onlyTpl = !!facets.onlyTpl;
      var status = facets.status || '';
      var categories = facets.categories || [];
      var favIds = facets.favoriteIds || [];

      var any = today || mine || team || onlyFav || onlyTpl || status || categories.length;
      var docIds = [], nodeIds = [], i2;

      if (!any) {
        activeSet = null;
        activeCount = n;
        for (i2 = 0; i2 < n; i2++) {
          docIds.push(items[i2].doc.id);
          nodeIds.push(items[i2].node.id);
        }
        return { docIds: docIds, nodeIds: nodeIds };
      }

      var favMap = {};
      for (i2 = 0; i2 < favIds.length; i2++) favMap[favIds[i2]] = 1;
      var catKeys = {};
      for (i2 = 0; i2 < categories.length; i2++) catKeys[fold(categories[i2])] = 1;
      var catActive = categories.length > 0;

      activeSet = {};
      for (i2 = 0; i2 < n; i2++) {
        it = items[i2];
        d = it.doc;
        if (today && (nowMs - (d.updatedAt || 0)) > DAY) continue;
        if (mine && d.ownerId !== currentUserId) continue;
        if (team && it.authorCount <= 1) continue;
        if (status && d.status !== status) continue;
        if (onlyFav && !favMap[d.id]) continue;
        if (onlyTpl && !d.isTemplate) continue;
        if (catActive) {
          var hasCat = false;
          for (k = 0; k < it.cats.length; k++) if (catKeys[it.cats[k].key]) { hasCat = true; break; }
          if (!hasCat) continue;
        }
        activeSet[d.id] = 1;
        docIds.push(d.id);
        nodeIds.push(it.node.id);
      }
      activeCount = docIds.length;
      return { docIds: docIds, nodeIds: nodeIds };
    }

    function nodeByIdFn(id) { return byId[id] || null; }
    function nodeForDoc(docId) { return docNode[docId] || null; }

    // kategórianév → paletta-slot (1..8). A view ebből rajzol színjelet a
    // legördülőbe / a listasor címkéire, hogy a térkép színei dekódolhatók
    // legyenek — így a szín nem magában hordozza a jelentést.
    function categorySlots() {
      var out = {};
      for (var ci2 = 0; ci2 < cats.length; ci2++) {
        out[cats[ci2].name] = catSlotByKey[cats[ci2].key];
      }
      return out;
    }

    function stats() {
      var ec = 0, i2;
      for (i2 = 0; i2 < docEdges.length; i2++) {
        var sn = byId[docEdges[i2].source], tn = byId[docEdges[i2].target];
        if (sn && tn && isActiveDoc(sn.docId) && isActiveDoc(tn.docId)) ec++;
      }
      return { docCount: activeCount, edgeCount: ec };
    }

    return {
      tier: tier,
      world: WORLD,
      getOverview: getOverview,
      getNeighborhood: getNeighborhood,
      search: search,
      applyFacets: applyFacets,
      nodeById: nodeByIdFn,
      nodeForDoc: nodeForDoc,
      categorySlots: categorySlots,
      stats: stats
    };
  }

  global.createGraphModel = createGraphModel;
})(window);
