/* graphModel.js — az Élő Atlasz adatrétege (Tier 0). Önálló modul.
 *
 * Nyers dokumentum-metaadatból SZÁRMAZTATOTT, könnyű gráfot épít:
 *   csomópont = dokumentum
 *   él        = közös kategória („topic")
 *
 * Kiindulási állapot: KIZÁRÓLAG a közös kategória köt össze. A közös közre-
 * működő („coauthor") él logikája megvan, de ki van kapcsolva — lásd a
 * `LINK_BY_CATEGORY` / `LINK_BY_COAUTHOR` kapcsolókat.
 *
 * EGYSÉGES MÉRET. Minden csomópont sugara ugyanaz (`NODE_R`) — a méret nem
 * hordoz jelentést. A fokszám és az aktivitás csak RANGSOROL (felirat-prioritás,
 * kuráció). Korábban a méret aktivitásból, majd fokszámból jött; egyik sem vált
 * be, mert a méretkülönbség jelentést sugall ott, ahol a szín (kategória) és a
 * pozíció (klaszter) már hordozza azt.
 *
 * A KATEGÓRIA ADJA A HELYET. A dokumentum az ELSŐDLEGES (első) kategóriájának
 * klaszterébe kerül, azon belül koncentrikus, egyenletesen osztott gyűrűkre —
 * kis kategória szabályos N-szög, nagyobb szabályos gyűrűs korong. A klaszter-
 * korongok nem érnek össze, így egyetlen csomópont sem lóg ki a klaszteréből.
 * A további kategóriák a színátmenetben és a facetekben látszanak, a köztük
 * futó élek pedig a klasztereket kötik össze.
 *
 * Ez SZÁNDÉKOS VISSZAFORDÍTÁSA a korábbi elvnek („a kategória nem fizikai
 * hely"): ott a helyet kizárólag a kapcsolat adta, erő-szimulációval. Az 50+
 * dokumentumos korpuszon ez nem működött — egy kategória tagjai szétszóródtak,
 * klaszter nem állt össze. A geometria most zárt formulából jön: nincs
 * erő-szimuláció, nincs Math.random, az átfedés-mentesség pedig KONSTRUKCIÓ
 * SZERINT teljesül, nem utólagos ütközésfeloldásból.
 *
 * Publikus API:
 *   createGraphModel(raw, { tier: 0 })
 *     .getOverview({ includeInactive })   -> { nodes, edges }
 *     .getNeighborhood(id, { max: 32 })   -> { nodes, edges }
 *     .search(q, { max: 60 })             -> { nodes, edges, matchIds }
 *     .applyFacets(facets)                -> { docIds, nodeIds, active }   // facets.categories: [name,...] (VAGY-kapcsolat)
 *     .nodeById(id) .nodeForDoc(docId) .categorySlots() .categoryLegend() .stats()
 *
 * `getOverview({ includeInactive: true })` a SZŰRŐTŐL FÜGGETLEN teljes halmazt
 * adja. Erre azért van szükség, mert szűréskor a kiszűrt dokumentum nem tűnik el
 * a térképről, csak halványan ott marad kontextusként — a „mi felel meg a
 * szűrőnek" kérdést továbbra is az `applyFacets` válaszolja meg (`nodeIds`).
 *
 * Kurálás: szomszédság ≤ 32, keresés ≤ 60 találat; EGYETLEN getter sem ad
 * vissza 150-nél több csomópontot.
 */
(function (global) {
  'use strict';

  var WORLD = 1000;                       // referencia-span: a szerkezet KÖZEPE ide kerül
                                          // (a renderer a tartalom bboxához illeszt, ezért nem kemény határ)
  var TAU = Math.PI * 2;
  var MAX_NODES = 150;                    // kemény sapka minden getterre
  var MAX_EDGES_PER_NODE = 5;             // fokszám-sapka (a legsúlyosabbak maradnak)
  var MAX_EDGES_RETURNED = 420;
  var PAIRING_LIMIT = 120;                // párosítási védőkorlát nagy csoportokra
  var DAY = 86400000;

  // Mi kössön össze két dokumentumot? Kiindulásképp KIZÁRÓLAG a közös kategória.
  // A közös közreműködő („coauthor") logika a helyén van, de ki van kapcsolva —
  // `true`-ra állítva visszakapcsolható, és onnantól a súly a kettő SZUMMÁJA lesz.
  var LINK_BY_CATEGORY = true;
  var LINK_BY_COAUTHOR = false;

  // EGYSÉGES csomópont-sugár (px az ÁTTEKINTÉS zoomján) — minden dokumentum
  // ugyanilyen nagy, fokszámtól és aktivitástól függetlenül. A méret tehát nem
  // hordoz jelentést: a jelentést a szín (kategória), a pozíció (klaszter) és az
  // élek adják. A renderer ezt FELSŐ korlátnak tekinti: ha a rendelkezésre álló
  // térköz kevesebb, kisebbre rajzol (lásd `nodeScreenR`).
  var NODE_R = 10;

  // Kategória-paletta slotjai (tokens.css --catcolor-1..8). Egy kategória slotja
  // a kanonikus kategória-sorrendből jön, így stabil: nem vándorol akkor sem, ha
  // egy kategória dokumentumot kap vagy elveszít.
  var CAT_PALETTE_SIZE = 8;

  // ---------- kategória-klaszteres, determinisztikus elrendezés ----------
  // A dokumentum az ELSŐDLEGES (első) kategóriájának klaszterébe kerül, a
  // klaszteren belül koncentrikus, egyenletesen osztott gyűrűkre. Nincs
  // erő-szimuláció: a geometria zárt formulából jön, ezért ütközésmentes
  // KONSTRUKCIÓ SZERINT, és újratöltés után bitre ugyanaz.
  var DOC_PAD = 8;                        // két csomópont pereme közti minimális rés
  var RING_BASE = 6;                      // az 1. gyűrű ennyi helyet visz, a k. gyűrű k×ennyit
  var CLUSTER_PAD = 10;                   // a klaszter-korong pereme a legkülső csomóponton túl
  var CLUSTER_GAP = 34;                   // két klaszter-korong közti minimális rés
  var CLUSTER_STEP = 12;                  // a klaszter-kereső spirál lépése (finomabb = tömörebb pakolás)
  var CLUSTER_TRIES = 20000;              // védőkorlát a spirál-keresésre
  var GOLDEN_ANGLE = 2.399963229728653;   // arany szög — egyenletes spirál-fedés

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

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

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

    // ---------- 1. kategóriák — facet ÉS klaszter-hovatartozás (lásd 5.) ----------
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
        px: 0, py: 0, r: 5, activity: 1, degree: 0
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

    // ---------- 3. aktivitás-pontszám (iteráció + frissesség + közreműködők) ----------
    // Ez NEM a rajzolási méret: az EGYSÉGES (`NODE_R`), minden csomópontnál
    // ugyanannyi. Az aktivitás csak RANGSOROL: nagy kategóriában eldönti, mely
    // dokumentumok párosodnak egyáltalán, és a `MAX_NODES` sapka fölött azt,
    // melyek kerülnek a térképre.
    var ageDays, recency, w;
    for (i = 0; i < n; i++) {
      it = items[i];
      ageDays = Math.max(0, (nowMs - (it.doc.updatedAt || 0)) / DAY);
      recency = clamp(1 - ageDays / 90, 0, 1);
      w = (it.doc.iteration || 1) + recency * 3 + Math.max(0, it.contributors.length - 1) * 0.6;
      it.activity = w;
    }

    // ---------- 4. élek (Tier 0: közös kategória) ----------
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
        var dw = items[y].activity - items[x].activity;
        if (dw) return dw;
        return items[x].doc.id < items[y].doc.id ? -1 : 1;
      });
      return copy.slice(0, PAIRING_LIMIT);
    }

    // közös kategória
    if (LINK_BY_CATEGORY) {
      for (ci = 0; ci < liveCats.length; ci++) {
        var grp = limitedGroup(liveCats[ci].docs);
        for (i = 0; i < grp.length; i++) {
          for (k = i + 1; k < grp.length; k++) bumpPair(grp[i], grp[k], 't');
        }
      }
    }

    // közös közreműködő — ma KI VAN KAPCSOLVA (lásd `LINK_BY_COAUTHOR`)
    if (LINK_BY_COAUTHOR) {
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

    // ---------- 4/b. EGYSÉGES méret + fokszám (csak felirat-rangsorhoz) ----------
    // Minden csomópont sugara ugyanaz (`NODE_R`). A fokszám nem méretez — csak
    // a felirat-prioritást és a kurációs rangsort adja. Korábban a méret előbb
    // aktivitásból, majd fokszámból jött; egyik sem vált be, mert a méret-
    // különbség jelentést sugall ott, ahol a szín és a pozíció már hordozza azt.
    for (i = 0; i < n; i++) {
      items[i].degree = deg[i];
      items[i].r = NODE_R;
    }
    // ---------- 5. elrendezés: kategória-klaszterek, determinisztikus geometria ----------
    // A dokumentum az ELSŐDLEGES (első) kategóriájának klaszterébe kerül. Egy
    // klaszter tagjai koncentrikus, egyenletesen osztott gyűrűkön állnak: kis
    // kategória így szabályos N-szöget ad, nagyobb szabályos gyűrűs korongot.
    // A klaszter-korongok nem érnek össze, ezért egyetlen csomópont sem lóg ki
    // a saját klaszteréből, és nem is keveredik a szomszédéba.
    //
    // Ez SZÁNDÉKOSAN visszafordítja a modul korábbi elvét („a kategória nem
    // fizikai hely"): ott a helyet kizárólag a kapcsolat adta egy erő-
    // szimulációval, ami 50+ dokumentumnál átlátszatlan gubanchoz vezetett —
    // egy kategória tagjai szétszóródtak, klaszter nem állt össze. Most a
    // kategória ADJA a helyet; a további kategóriák a színátmenetben és a
    // facetekben látszanak, a köztük futó élek pedig a klasztereket kötik össze.
    //
    // Nincs erő-szimuláció és nincs utólagos ütközésfeloldás: a geometria zárt
    // formulából jön, az átfedés-mentesség KONSTRUKCIÓ SZERINT teljesül (lásd a
    // klaszteren belüli `step`-et és a korongok közti `CLUSTER_GAP`-et).

    // 5/a. csoportosítás elsődleges kategória szerint
    var clusters = [], clusterByKey = {}, cl, pKey;
    for (i = 0; i < n; i++) {
      pKey = items[i].cats[0].key;
      cl = clusterByKey[pKey];
      if (!cl) {
        cl = { key: pKey, name: items[i].cats[0].name, list: [], cx: 0, cy: 0, radius: 0 };
        clusterByKey[pKey] = cl;
        clusters.push(cl);
      }
      cl.list.push(i);
    }

    // 5/b. klaszteren belüli gyűrűk. A tagokat fokszám szerint rendezzük, így a
    // legjobban bekötött dokumentum kerül a klaszter közepére — a nézet
    // középpontja jelentést hordoz, nem véletlen.
    function ringLayout(cluster) {
      var list = cluster.list, m = list.length, j;
      list.sort(function (x, y) {
        if (items[y].degree !== items[x].degree) return items[y].degree - items[x].degree;
        if (items[y].activity !== items[x].activity) return items[y].activity - items[x].activity;
        return items[x].doc.id < items[y].doc.id ? -1 : 1;
      });

      var rMax = 0;
      for (j = 0; j < m; j++) if (items[list[j]].r > rMax) rMax = items[list[j]].r;
      var step = 2 * rMax + DOC_PAD;              // bármely két tag közti min. középpont-távolság

      if (m === 1) {
        items[list[0]].lx = 0; items[list[0]].ly = 0;
        cluster.radius = rMax + CLUSTER_PAD;
        return;
      }

      // Gyűrű-kiosztás: ha minden tag elfér EGY gyűrűn, szabályos N-szöget adunk.
      // Fölötte középpont + növekvő kapacitású gyűrűk (k. gyűrű: k × RING_BASE).
      var sizes = [], remaining = m, ringNo = 1;
      var hasCenter = m > RING_BASE;
      if (hasCenter) { sizes.push(1); remaining -= 1; }
      while (remaining > 0) {
        var take = Math.min(RING_BASE * ringNo, remaining);
        sizes.push(take);
        remaining -= take;
        ringNo++;
      }
      // Ne maradjon 1-2 elemű külső gyűrű: az nem szabályos alakzatnak látszik,
      // hanem elkószált csomópontnak. A csonka maradékot az előző gyűrűbe
      // olvasztjuk — az egyenletes szögosztás miatt az továbbra is szabályos
      // (csak több csúcsú) sokszög lesz. (8 tag: [1,6,1] helyett [1,7].)
      var minRing = Math.ceil(RING_BASE / 2);
      if (sizes.length >= (hasCenter ? 3 : 2) && sizes[sizes.length - 1] < minRing) {
        var tail = sizes.pop();
        sizes[sizes.length - 1] += tail;
      }

      var cursor = 0, prevR = 0, ri, cnt, ringR, a0, ang, s;
      for (ri = 0; ri < sizes.length; ri++) {
        cnt = sizes[ri];
        if (ri === 0 && hasCenter) {
          items[list[cursor]].lx = 0; items[list[cursor]].ly = 0;
          cursor++;
          prevR = 0;
          continue;
        }
        // A gyűrű sugara: (1) a szomszédok a gyűrűn legalább `step`-re legyenek
        // egymástól, (2) a gyűrű a korábbitól is `step`-re legyen.
        s = Math.sin(Math.PI / cnt);
        ringR = cnt > 1 ? step / (2 * s) : step;
        if (ringR < prevR + step) ringR = prevR + step;
        // páros/páratlan gyűrűk félfázissal, hogy a csomópontok összeérjenek
        a0 = -Math.PI / 2 + (ri % 2) * (Math.PI / cnt);
        for (j = 0; j < cnt; j++) {
          ang = a0 + TAU * j / cnt;
          items[list[cursor]].lx = Math.cos(ang) * ringR;
          items[list[cursor]].ly = Math.sin(ang) * ringR;
          cursor++;
        }
        prevR = ringR;
      }
      cluster.radius = prevR + rMax + CLUSTER_PAD;
    }

    for (ci = 0; ci < clusters.length; ci++) ringLayout(clusters[ci]);

    // 5/c. klaszter-középpontok: a legnagyobb korong a közepére, a többi az
    // arany-szög szerinti spirál ELSŐ ütközésmentes pontjára. Determinisztikus
    // (nincs Math.random), és a méret szerint csökkenő sorrend miatt a nagy
    // klaszterek kerülnek középre, a kicsik köréjük.
    clusters.sort(function (a2, b2) {
      if (b2.radius !== a2.radius) return b2.radius - a2.radius;
      return a2.key < b2.key ? -1 : 1;
    });

    var placed = [], t, cang, crad, tx, ty, okSpot, pj, other;
    for (ci = 0; ci < clusters.length; ci++) {
      cl = clusters[ci];
      if (!placed.length) { cl.cx = 0; cl.cy = 0; placed.push(cl); continue; }
      okSpot = false;
      for (t = 1; t <= CLUSTER_TRIES; t++) {
        cang = t * GOLDEN_ANGLE;
        crad = CLUSTER_STEP * Math.sqrt(t);
        tx = Math.cos(cang) * crad; ty = Math.sin(cang) * crad;
        okSpot = true;
        for (pj = 0; pj < placed.length; pj++) {
          other = placed[pj];
          if (Math.sqrt((tx - other.cx) * (tx - other.cx) + (ty - other.cy) * (ty - other.cy))
              < cl.radius + other.radius + CLUSTER_GAP) { okSpot = false; break; }
        }
        if (okSpot) { cl.cx = tx; cl.cy = ty; break; }
      }
      if (!okSpot) {
        // Védőág: a spirál kifutott. Rakjuk a mostani legkülső korong mögé —
        // így sem lesz átfedés, csak a pakolás lesz lazább.
        var far = 0;
        for (pj = 0; pj < placed.length; pj++) {
          var dd = Math.sqrt(placed[pj].cx * placed[pj].cx + placed[pj].cy * placed[pj].cy)
                 + placed[pj].radius;
          if (dd > far) far = dd;
        }
        cang = ci * GOLDEN_ANGLE;
        crad = far + cl.radius + CLUSTER_GAP;
        cl.cx = Math.cos(cang) * crad; cl.cy = Math.sin(cang) * crad;
      }
      placed.push(cl);
    }

    // 5/d. világ-koordináták: klaszter-eltolás + gyűrű-pozíció, majd az egész
    // szerkezetet a világ közepére igazítjuk. Skálázás NINCS: az mind a
    // sugarakhoz mért térközöket, mind a gyűrű-geometriát elrontaná. A renderer
    // a TARTALOM befoglaló téglalapjához illeszti a kamerát, ezért a 0..1000
    // világ csak referencia-span — a koordináták túlnyúlhatnak nagy korpusznál.
    for (ci = 0; ci < clusters.length; ci++) {
      cl = clusters[ci];
      for (k = 0; k < cl.list.length; k++) {
        it = items[cl.list[k]];
        it.px = cl.cx + it.lx;
        it.py = cl.cy + it.ly;
      }
    }
    var bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (i = 0; i < n; i++) {
      it = items[i];
      if (it.px - it.r < bx0) bx0 = it.px - it.r;
      if (it.py - it.r < by0) by0 = it.py - it.r;
      if (it.px + it.r > bx1) bx1 = it.px + it.r;
      if (it.py + it.r > by1) by1 = it.py + it.r;
    }
    if (isFinite(bx0)) {
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
        // A koordináta NEM kap záró `clamp`-et: a klaszter-geometria pont attól
        // ütközésmentes, hogy senki nem tolja utólag. A világ-négyzet ezért már
        // csak referencia-span (a renderer a tartalom bboxához illeszt), nagy
        // korpusznál a koordináták túlnyúlhatnak rajta.
        x: it.px,
        y: it.py,
        // A renderer ebből rangsorolja a feliratokat — a FOKSZÁM adja, hogy a
        // felirat-prioritás a látható mérettel egy irányba mutasson.
        weight: it.degree,
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
    function buildResult(idList, extraEdges, includeInactive) {
      var seen = {}, out = [], i2, n2;
      for (i2 = 0; i2 < idList.length && out.length < MAX_NODES; i2++) {
        if (seen[idList[i2]]) continue;
        n2 = resolveNode(idList[i2], includeInactive);
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

    function resolveNode(id, includeInactive) {
      var nd = byId[id];
      if (!nd) return null;
      if (!includeInactive && !isActiveNode(nd)) return null;
      return nd;
    }

    // ---------- 9. publikus getterek ----------
    // Kurációs rangsor: ha 150-nél több dokumentum van, a LEGJOBBAN BEKÖTÖTTEK
    // kerülnek a térképre — így a rangsor ugyanazt a szempontot követi, mint a
    // csomópont mérete. Fokszám-döntetlennél az aktivitás dönt.
    function sortByProminenceDesc(idxList) {
      idxList.sort(function (x, y) {
        if (items[y].degree !== items[x].degree) return items[y].degree - items[x].degree;
        var dw = items[y].activity - items[x].activity;
        if (dw) return dw;
        return items[x].doc.id < items[y].doc.id ? -1 : 1;
      });
      return idxList;
    }

    // `includeInactive: true` → a szűrőt figyelmen kívül hagyó teljes halmaz.
    // A kezdőoldal ezt KONTEXTUS-RÉTEGKÉNT kéri: a szűrőből kiesett dokumentum
    // halványan a térképen marad, nem tűnik el alóla a szerkezet.
    function getOverview(opts) {
      var includeInactive = !!(opts && opts.includeInactive);
      var pool = [], i2;
      for (i2 = 0; i2 < n; i2++) {
        if (includeInactive || isActiveDoc(items[i2].doc.id)) pool.push(i2);
      }
      sortByProminenceDesc(pool);
      var ids = [], seen = {};
      for (i2 = 0; i2 < pool.length && ids.length < MAX_NODES; i2++) pushUnique(ids, seen, items[pool[i2]].node.id);
      return buildResult(ids, null, includeInactive);
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
        scored.push({ i: i2, s: sc + Math.min(9, it.activity * 0.5) });
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

      var any = !!(today || mine || team || onlyFav || onlyTpl || status || categories.length);
      var docIds = [], nodeIds = [], i2;

      if (!any) {
        activeSet = null;
        activeCount = n;
        for (i2 = 0; i2 < n; i2++) {
          docIds.push(items[i2].doc.id);
          nodeIds.push(items[i2].node.id);
        }
        // `active: false` → a hívónak nincs mit halványítania, minden benne van
        return { docIds: docIds, nodeIds: nodeIds, active: false };
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
      return { docIds: docIds, nodeIds: nodeIds, active: true };
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

    // Jelmagyarázat-adat: CSAK a HASZNÁLATBAN lévő kategóriák (amelyeknek van
    // dokumentumuk), a kanonikus sorrendben, a paletta-slotjukkal és a
    // dokumentumszámukkal. Az üres kategória kimarad: egyetlen csomópontot sem
    // színez, felsorolni félrevezető lenne. A kategória nélküli doksik gyűjtője
    // („Egyéb") viszont bekerül, mert az IS színez csomópontot.
    function categoryLegend() {
      var out = [], ci2;
      for (ci2 = 0; ci2 < cats.length; ci2++) {
        if (!cats[ci2].docs.length) continue;
        out.push({
          name: cats[ci2].name,
          slot: catSlotByKey[cats[ci2].key] || CAT_PALETTE_SIZE,
          count: cats[ci2].docs.length
        });
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
      categoryLegend: categoryLegend,
      stats: stats
    };
  }

  global.createGraphModel = createGraphModel;
})(window);
