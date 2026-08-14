/* atlasView.js — az „Élő Atlasz" kezdőoldal: DOM-felépítés + koreográfia.
 *
 * Nincs benne üzleti logika: a „mi a következő nézet" kérdést az `atlasMachine`
 * dönti el, az adatot a `graphModel` adja, az igazságforrás a `selectionStore`.
 * Ez a modul KÖTI ÖSSZE őket, és minden átmenetnél lejátssza a megnevezett
 * animációt (WAAPI + kamera-tween + lista-FLIP) — semmi sem „vágódik be".
 *
 * Két Canvas egymáson: alul az ambient részecskemező (a bejelentkezőből
 * ÚJRAHASZNOSÍTOTT `constellation.js`), felül a kurált térkép (`atlasRenderer.js`).
 *
 * Publikus: window.mountAtlas(container, opts) → { destroy, refresh, refreshColors }
 */
(function (global) {
  'use strict';

  var SEARCH_DEBOUNCE = 160;

  var ICON_SEARCH =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  var ICON_ZOOM_OUT =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/></svg>';

  var ICON_ALERT =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';

  var ICON_CARET =
    '<svg class="catfilter__caret" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function mountAtlas(container, opts) {
    opts = opts || {};
    var data = opts.data || {};
    var H = opts.helpers || {};
    var cb = opts.callbacks || {};
    var handoff = opts.handoff || null;
    var reduced = !!opts.reducedMotion;

    // ---------------- DOM ----------------
    var root = el(
      '<section class="atlas" data-view="loading" aria-label="Tudástár">' +
        '<header class="atlas__bar">' +
          '<div class="atlas__search">' +
            '<span class="atlas__search-icon" aria-hidden="true">' + ICON_SEARCH + '</span>' +
            '<input class="input atlas__input" type="search" autocomplete="off" ' +
                   'placeholder="Keresés címben és tartalomban…" aria-label="Keresés a tudástárban">' +
          '</div>' +
          '<div class="atlas__facets" role="group" aria-label="Szűrők és nézet">' +
            '<button class="btn btn--ghost btn--sm" data-facet="today" aria-pressed="false" type="button">Ma</button>' +
            '<button class="btn btn--ghost btn--sm" data-facet="mine" aria-pressed="false" type="button">Enyém</button>' +
            '<button class="btn btn--ghost btn--sm" data-facet="team" aria-pressed="false" type="button">Csapat</button>' +
            '<button class="btn btn--ghost btn--sm" data-facet="onlyFav" aria-pressed="false" type="button">★ Kedvenc</button>' +
            '<button class="btn btn--ghost btn--sm" data-facet="onlyTpl" aria-pressed="false" type="button">Sablon</button>' +
            '<select class="input atlas__select" data-select="status" aria-label="Státusz szűrő"></select>' +
            '<div class="catfilter" data-catfilter>' +
              '<div class="catfilter__control" data-catfilter-control tabindex="0" role="button" ' +
                   'aria-haspopup="true" aria-expanded="false" aria-controls="atlas-catpanel" aria-label="Kategóriák szűrése">' +
                '<span class="catfilter__tags" data-catfilter-tags>' +
                  '<span class="catfilter__placeholder">Kategóriák</span>' +
                '</span>' +
                ICON_CARET +
              '</div>' +
              '<div class="catfilter__panel" id="atlas-catpanel" role="group" aria-label="Kategóriák szűrése" ' +
                   'hidden data-catfilter-panel></div>' +
            '</div>' +
            '<button class="btn btn--ghost btn--sm" data-toggle="listonly" aria-pressed="false" type="button">Csak lista</button>' +
          '</div>' +
          '<button class="btn btn--primary btn--sm atlas__new" type="button">＋ Új dokumentum</button>' +
        '</header>' +

        '<div class="atlas__stage">' +
          '<div class="atlas__map">' +
            '<canvas class="atlas__field" aria-hidden="true"></canvas>' +
            '<canvas class="atlas__graph" aria-hidden="true"></canvas>' +
            '<div class="atlas__hud">' +
              '<button class="btn btn--sm atlas__zoomout" type="button" aria-label="Kizoomolás az áttekintésre">' +
                ICON_ZOOM_OUT + '<span>Áttekintés</span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          '<aside class="atlas__results" role="region" aria-label="Találatok">' +
            '<ul class="atlas__list" role="listbox" aria-label="Dokumentumok" tabindex="0"></ul>' +
            '<div class="atlas__empty" hidden></div>' +
            '<div class="atlas__status" role="status" aria-live="polite"></div>' +
          '</aside>' +
        '</div>' +
      '</section>'
    );
    container.appendChild(root);

    var bar = root.querySelector('.atlas__bar');
    var input = root.querySelector('.atlas__input');
    var facetsWrap = root.querySelector('.atlas__facets');
    var statusSel = root.querySelector('[data-select="status"]');
    var catFilterEl = root.querySelector('[data-catfilter]');
    var catControl = root.querySelector('[data-catfilter-control]');
    var catTagsEl = root.querySelector('[data-catfilter-tags]');
    var catPanel = root.querySelector('[data-catfilter-panel]');
    var listOnlyBtn = root.querySelector('[data-toggle="listonly"]');
    var newBtn = root.querySelector('.atlas__new');
    var mapEl = root.querySelector('.atlas__map');
    var fieldCanvas = root.querySelector('.atlas__field');
    var graphCanvas = root.querySelector('.atlas__graph');
    var zoomOutBtn = root.querySelector('.atlas__zoomout');
    var listEl = root.querySelector('.atlas__list');
    var emptyEl = root.querySelector('.atlas__empty');
    var statusEl = root.querySelector('.atlas__status');
    var resultsEl = root.querySelector('.atlas__results');

    // token-vezérelt időzítés
    var cs = getComputedStyle(root);
    function ms(name, fallback) {
      var v = cs.getPropertyValue(name).trim();
      if (!v) return fallback;
      return v.indexOf('ms') > -1 ? parseFloat(v) : parseFloat(v) * 1000;
    }
    var DUR = {
      fast: ms('--duration-fast', 150), base: ms('--duration-base', 250),
      slow: ms('--duration-slow', 400), slower: ms('--duration-slower', 600)
    };
    var EASE_GROW = cs.getPropertyValue('--ease-grow').trim() || 'cubic-bezier(.22,1,.36,1)';

    // ---------------- szűrő-vezérlők feltöltése ----------------
    function fillStatusSelect() {
      var sHtml = '<option value="">Minden státusz</option>';
      var statuses = data.statuses || [];
      for (var i = 0; i < statuses.length; i++) {
        sHtml += '<option value="' + statuses[i] + '">' + statuses[i] + '</option>';
      }
      statusSel.innerHTML = sHtml;
    }
    fillStatusSelect();

    // ---------------- kategória-szűrő: multiszelekt dropdown (checkbox-lista) ----------------
    // A kiválasztott kategóriák a vezérlőn belül tag-ként jelennek meg, „×"
    // gombbal törölhetők; a legördülő panelben checkbox-listával több is
    // kiválasztható egyszerre. A kánoni sorrend MINDIG a `data.categories`
    // eredeti sorrendje — így a store `filters.categories` tömbje kattintási
    // sorrendtől függetlenül összehasonlítható (lásd selectionStore `sameArray`).
    function categoryNames() {
      var cats = data.categories || [], out = [];
      for (var i = 0; i < cats.length; i++) if (cats[i] && cats[i].name) out.push(cats[i].name);
      return out;
    }

    // A kategória paletta-slotja a modellből jön (egyetlen igazságforrás), így a
    // legördülő színjelei biztosan ugyanazok, mint a térkép csomópontjain.
    // A legördülő EGYBEN jelmagyarázat: a szín önmagában sosem hordoz jelentést.
    function slotOf(name) {
      if (!model || !model.categorySlots) return 0;
      var m = model.categorySlots();
      return m[name] || 0;
    }

    function swatch(slot) {
      return slot ? '<span class="catfilter__swatch" data-slot="' + slot + '" aria-hidden="true"></span>' : '';
    }

    function renderCategoryPanel() {
      var names = categoryNames();
      var html = '';
      for (var i = 0; i < names.length; i++) {
        var n = H.esc ? H.esc(names[i]) : names[i];
        html += '<label class="chk catfilter__option">' +
          '<input type="checkbox" data-catopt="' + n + '">' +
          swatch(slotOf(names[i])) +
          '<span>' + n + '</span>' +
        '</label>';
      }
      catPanel.innerHTML = html || '<p class="catfilter__empty">Nincs kategória.</p>';
    }
    // Első renderelés még modell NÉLKÜL fut (a vezérlőnek létezni kell, mire a
    // modell felépül) → ilyenkor még nincs színjel. A `boot()` a modell
    // elkészülte után ÚJRA rendereli, akkor kerülnek be a slot-színek.
    renderCategoryPanel();

    // a trigger + panel vizuális állapotát a store `filters.categories`-ből tükrözi
    function paintCategoryFilter() {
      var selected = store.state.filters.categories;
      var selSet = {};
      for (var i = 0; i < selected.length; i++) selSet[selected[i]] = true;

      var tagsHtml = '';
      if (!selected.length) {
        tagsHtml = '<span class="catfilter__placeholder">Kategóriák</span>';
      } else {
        for (i = 0; i < selected.length; i++) {
          var n = H.esc ? H.esc(selected[i]) : selected[i];
          tagsHtml += '<span class="tag catfilter__tag">' + swatch(slotOf(selected[i])) + n +
            '<button type="button" class="catfilter__remove" data-remove="' + n + '" ' +
                    'aria-label="„' + n + '” eltávolítása a szűrőből">×</button>' +
          '</span>';
        }
      }
      catTagsEl.innerHTML = tagsHtml;

      var boxes = catPanel.querySelectorAll('input[data-catopt]');
      for (i = 0; i < boxes.length; i++) {
        boxes[i].checked = !!selSet[boxes[i].getAttribute('data-catopt')];
      }
    }

    function setSelectedCategories(next) {
      // kánoni sorrend: mindig a data.categories eredeti sorrendje
      var order = categoryNames(), inNext = {}, i, canon = [];
      for (i = 0; i < next.length; i++) inNext[next[i]] = true;
      for (i = 0; i < order.length; i++) if (inNext[order[i]]) canon.push(order[i]);
      store.setFilters({ categories: canon });
      paintCategoryFilter();
      machine.send('FILTER', store.state.filters);
      recompute();
    }

    function toggleCategory(name) {
      var cur = store.state.filters.categories.slice();
      var idx = cur.indexOf(name);
      if (idx > -1) cur.splice(idx, 1); else cur.push(name);
      setSelectedCategories(cur);
    }

    // `position:fixed` + kézi igazítás — 640px alatt a facet-sáv horizontális
    // scroll-konténer (overflow-x:auto), ami levágná az `absolute` panelt.
    function positionCategoryPanel() {
      var r = catControl.getBoundingClientRect();
      catPanel.style.top = Math.round(r.bottom + 8) + 'px';
      catPanel.style.left = Math.round(Math.min(r.left, window.innerWidth - 232)) + 'px';
      catPanel.style.minWidth = Math.max(220, Math.round(r.width)) + 'px';
    }

    var catPanelOpen = false;
    function openCategoryPanel() {
      if (catPanelOpen) return;
      catPanelOpen = true;
      positionCategoryPanel();
      catPanel.hidden = false;
      catControl.setAttribute('aria-expanded', 'true');
      global.addEventListener('resize', positionCategoryPanel);
    }
    function closeCategoryPanel(refocus) {
      if (!catPanelOpen) return;
      catPanelOpen = false;
      catPanel.hidden = true;
      catControl.setAttribute('aria-expanded', 'false');
      global.removeEventListener('resize', positionCategoryPanel);
      if (refocus) catControl.focus();
    }

    function onCatControlClick(e) {
      if (e.target.closest && e.target.closest('.catfilter__remove')) return;   // az eltávolítás nem nyit/zár
      if (catPanelOpen) closeCategoryPanel(false); else openCategoryPanel();
    }
    function onCatControlKeydown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (catPanelOpen) closeCategoryPanel(false); else openCategoryPanel();
      } else if (e.key === 'ArrowDown' && !catPanelOpen) {
        e.preventDefault();
        openCategoryPanel();
        var first = catPanel.querySelector('input[data-catopt]');
        if (first) first.focus();
      } else if (e.key === 'Escape' && catPanelOpen) {
        closeCategoryPanel(true);
      }
    }
    function onCatTagsClick(e) {
      var rm = e.target.closest ? e.target.closest('.catfilter__remove') : null;
      if (!rm) return;
      e.stopPropagation();
      toggleCategory(rm.getAttribute('data-remove'));
    }
    function onCatPanelChange(e) {
      var box = e.target.closest ? e.target.closest('input[data-catopt]') : null;
      if (!box) return;
      toggleCategory(box.getAttribute('data-catopt'));
    }
    function onCatFilterKeydown(e) {
      if (e.key === 'Escape' && catPanelOpen) { e.stopPropagation(); closeCategoryPanel(true); }
    }
    function onDocClickForCatFilter(e) {
      if (catPanelOpen && !catFilterEl.contains(e.target)) closeCategoryPanel(false);
    }
    catControl.addEventListener('click', onCatControlClick);
    catControl.addEventListener('keydown', onCatControlKeydown);
    catTagsEl.addEventListener('click', onCatTagsClick);
    catPanel.addEventListener('change', onCatPanelChange);
    catFilterEl.addEventListener('keydown', onCatFilterKeydown);
    document.addEventListener('click', onDocClickForCatFilter);

    // ---------------- állapot-modulok ----------------
    var store = global.createSelectionStore();
    var machine = global.createAtlasMachine({ onTransition: onTransition });
    var model = null, map = null, field = null, list = null;
    var lastView = null;          // { nodes, edges, matchIds }
    var destroyed = false;

    // ---------------- zoom ↔ szűrés összhang ----------------
    // Amíg a kamera lényegesen közelebb van, mint az áttekintés-illesztés, a
    // lista a NÉZETBEN LÁTHATÓ dokumentumokra szűkül — pontosan azokra, amiket
    // a térképen látsz (a `atlasRenderer` csomópont-id-ket jelent, nem
    // kategóriát: a kategória itt már csak facet). Kizoomoláskor (vissza az
    // áttekintésre) ez a korlátozás megszűnik — újra minden dokumentum elérhető.
    var VIEWPORT_ZOOM_THRESHOLD = 1.12;   // az ovZoom hányadában — kis tolerancia a fit-kerekítésre
    var viewportIds = null;               // null = nincs korlátozás
    var viewportSet = null;

    function setViewportFilter(ids) {
      viewportIds = ids;
      viewportSet = null;
      if (ids) {
        viewportSet = {};
        for (var i = 0; i < ids.length; i++) viewportSet[ids[i]] = true;
      }
    }

    function clearViewportFilter() { setViewportFilter(null); }

    // a renderer debounce-olva jelzi, mi látszik a nézetben (kamera mozgás / zoom)
    function onAtlasViewport(info) {
      if (!info) return;
      var next = (info.zoomRatio > VIEWPORT_ZOOM_THRESHOLD) ? info.visibleIds : null;
      var sameAsBefore =
        (next === viewportIds) ||
        (next && viewportIds && next.length === viewportIds.length &&
          next.every(function (id) { return viewportSet && viewportSet[id]; }));
      if (sameAsBefore) return;
      setViewportFilter(next);
      // Keresés közben a globális találati listát mutatjuk, nem a kamera-nézetet —
      // ott a viewport-szűrés szünetel (recompute() ezt már figyeli).
      if (machine.state !== 'searching' && machine.state !== 'empty') recompute();
    }

    function inViewport(docId) {
      if (!viewportSet || !model) return true;
      var nodeId = docToNode(docId);
      return !!(nodeId && viewportSet[nodeId]);
    }

    // ambient részecskemező — a BEJELENTKEZŐBŐL újrahasznosított motor
    field = global.createConstellation(fieldCanvas, {
      intensity: 'balanced',
      reducedMotion: reduced
    });
    // FOLYTONOSSÁG: ha a bejelentkezőtől kaptunk pillanatképet, a csillagkép
    // ott folytatódik, ahol abbahagyta — nem keveredik újra.
    if (handoff && handoff.ambient) field.applySnapshot(handoff.ambient);
    field.setMode('idle');
    field.start();

    // kurált térkép
    try {
      model = global.createGraphModel(buildRaw(), { tier: 0 });
      map = global.createAtlasRenderer(graphCanvas, {
        intensity: 'balanced',
        reducedMotion: reduced,
        onHover: function (id) { store.setHover(nodeToDoc(id)); },
        onSelect: onMapSelect,
        onViewport: onAtlasViewport
      });
    } catch (err) {
      map = null;
    }

    list = global.createResultsList(listEl, {
      store: store,
      reducedMotion: reduced,
      onOpen: function (docId) { if (cb.onOpenDoc) cb.onOpenDoc(docId); },
      onToggleFav: function (docId) { if (cb.onToggleFav) cb.onToggleFav(docId); }
    });

    // ---------------- adat ----------------
    function buildRaw() {
      var docs = data.docs || [];
      var out = [];
      for (var i = 0; i < docs.length; i++) {
        var d = docs[i];
        out.push({
          id: d.id, title: d.title, categories: d.categories || [],
          ownerId: d.ownerId, authorIds: d.authorIds || [],
          updatedAt: d.updatedAt, status: d.status,
          isTemplate: !!d.isTemplate, iteration: d.iteration,
          text: d.text || ''                // tartalom a kereséshez
        });
      }
      return {
        docs: out,
        categories: data.categories || [],
        users: data.users || [],
        currentUserId: data.currentUserId
      };
    }

    // Kattintás a térképen. A kategória nem hely többé, csak facet — nincs
    // domén-csomópont, amire kattintani lehetne. Két cél maradt:
    //  · üres terület → kizoomolás áttekintésre (a renderer null-t ad)
    //  · dokumentum-csomópont → kiválasztás (kamera ráközelít, a lista odagördül);
    //    UGYANARRA újra kattintva pedig KIKAPCSOL a fókusz, és a kamera visszatér
    //    az eredeti áttekintésre — így egy kattintással kijössz a mélységből.
    function onMapSelect(nodeId) {
      if (!nodeId) {
        if (!store.state.selectedId) return;
        backToOverview();
        return;
      }
      var n = model ? model.nodeById(nodeId) : null;
      if (!n || !n.docId) return;
      if (store.state.selectedId === n.docId) backToOverview();
      else store.select(n.docId);
    }

    // egy helyen a „vissza az áttekintésre" út: kijelölés törlése + kamera-tween
    function backToOverview() {
      store.select(null);
      machine.send('ZOOM_OUT');
      recompute();
    }

    // a megadott halmazon KÍVÜLI csomópont-id-k (ezeket halványítja a renderer —
    // találatoknál a nem-találatok, kiválasztásnál a szomszédságon kívüliek)
    function idsOutside(nodes, keepIds) {
      var keep = {};
      for (var m = 0; m < keepIds.length; m++) keep[keepIds[m]] = true;
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        if (!keep[nodes[i].id]) out.push(nodes[i].id);
      }
      return out;
    }

    // a térkép csomópont-id-jéből dokumentum-id
    function nodeToDoc(nodeId) {
      if (!nodeId || !model) return null;
      var n = model.nodeById(nodeId);
      if (!n) return null;
      return n.docId || null;
    }
    function docToNode(docId) {
      if (!docId || !model) return null;
      var n = model.nodeForDoc(docId);
      return n ? n.id : null;
    }

    function currentFacets() {
      var f = store.state.filters;
      return {
        today: f.today, mine: f.mine, team: f.team,
        status: f.status, categories: f.categories,
        onlyFav: f.onlyFav, onlyTpl: f.onlyTpl,
        favoriteIds: data.favoriteIds || []
      };
    }

    // A lista tételei — az escape/formázás a hívótól kapott helperekkel
    function buildItems(docIds, query) {
      var byId = {};
      var docs = data.docs || [];
      for (var i = 0; i < docs.length; i++) byId[docs[i].id] = docs[i];
      var items = [];
      for (var j = 0; j < docIds.length; j++) {
        var d = byId[docIds[j]];
        if (!d) continue;
        // a listasor kategória-címkéi ugyanazt a paletta-slotot kapják, mint a
        // térkép csomópontjai → a térkép színei a listából dekódolhatók
        var cats = [];
        for (var c = 0; c < (d.categories || []).length; c++) {
          cats.push({
            name: H.esc ? H.esc(d.categories[c]) : d.categories[c],
            slot: slotOf(d.categories[c])
          });
        }
        items.push({
          id: d.id,
          title: H.esc ? H.esc(d.title) : d.title,
          status: d.status,
          statusClass: 'st-' + d.status,
          isTemplate: !!d.isTemplate,
          categories: cats,
          ownerName: H.userName ? H.esc(H.userName(d.ownerId)) : '',
          updatedText: H.fmtDate ? H.fmtDate(d.updatedAt) : '',
          iteration: d.iteration,
          lockedBy: H.lockedByName ? H.lockedByName(d.id) : '',
          isFav: H.isFav ? !!H.isFav(d.id) : false,
          snippetHtml: query && H.snippetHtml ? H.snippetHtml(d.id, query) : ''
        });
      }
      return items;
    }

    // ---------------- a nézet újraszámolása (a store állapotából) ----------------
    // FONTOS: a térkép adatkészlete SOHA nem szűkül a fókuszra — mélyebbre
    // navigálva (kiválasztás) a többi gombóc nem tűnik el, csak elhalványul
    // (`map.setDimmed`). Ezt az `getOverview()` + a fókusz-szomszédság UNIÓJA
    // adja (`mergeViews`), így a szomszédság minden tagja garantáltan jelen van
    // a rajzolt adatban, még ha az áttekintés top-N kurálása kihagyta is.
    function recompute(opt) {
      opt = opt || {};
      if (!model) return;
      var s = store.state;
      var facetRes = model.applyFacets(currentFacets());
      var q = s.query.trim();
      var view, docIds, matchIds = null, focusIds = null;

      if (q) {
        view = model.search(q, { max: 60 });
        matchIds = view.matchIds || [];
        docIds = [];
        for (var i = 0; i < matchIds.length; i++) {
          var n = model.nodeById(matchIds[i]);
          if (n && n.docId) docIds.push(n.docId);
        }
      } else if (s.selectedId) {
        var nid = docToNode(s.selectedId);
        var overview = model.getOverview();
        var nb = nid ? model.getNeighborhood(nid, { max: 32 }) : null;
        view = nb ? mergeViews(overview, nb) : overview;
        focusIds = nb ? nb.nodes.map(function (nd) { return nd.id; }) : null;
        docIds = facetRes.docIds.slice();
      } else {
        view = model.getOverview();
        docIds = facetRes.docIds.slice();
      }

      // Zoom ↔ szűrés összhang: rázoomolva a lista a nézetben látható
      // DOKUMENTUMOKRA szűkül (pontos csomópont-egyezés, nem kategórián
      // keresztül); kizoomolva (viewportSet === null) minden, a facetnek
      // megfelelő dokumentum újra elérhető. Keresésnél a globális találati
      // lista a mérvadó, a kamera-korlátozás nem érvényesül.
      if (!q && viewportSet) docIds = docIds.filter(inViewport);

      lastView = view;
      if (map) {
        map.setData({ nodes: view.nodes, edges: view.edges });
        map.setHighlight({
          selectedId: docToNode(s.selectedId),
          hoverId: docToNode(s.hoverId),
          matchIds: matchIds
        });
        // A renderer a NEKI ÁTADOTT id-ket halványítja. Keresésnél a
        // nem-találatok, kiválasztásnál a szomszédságon KÍVÜLI csomópontok
        // halványulnak — soha nem tűnnek el a rajzolt adatból.
        var dimIds = null;
        if (matchIds && matchIds.length) dimIds = idsOutside(view.nodes, matchIds);
        else if (focusIds && focusIds.length) dimIds = idsOutside(view.nodes, focusIds);
        map.setDimmed(dimIds);
      }

      list.setItems(buildItems(docIds, q), { query: q });

      if (!opt.silent) announceCount(docIds.length, q);
      return docIds.length;
    }

    // Két nézet (csomópont/él) uniója, id szerint deduplikálva. A fókusz-
    // szomszédság mindig ráépül az áttekintésre — semmi nem esik ki.
    function mergeViews(base, extra) {
      var nodes = base.nodes.slice(), edges = base.edges.slice();
      var seenN = {}, seenE = {}, i, k;
      for (i = 0; i < nodes.length; i++) seenN[nodes[i].id] = true;
      for (i = 0; i < edges.length; i++) seenE[edges[i].source + '>' + edges[i].target] = true;
      for (i = 0; i < extra.nodes.length; i++) {
        if (!seenN[extra.nodes[i].id]) { seenN[extra.nodes[i].id] = true; nodes.push(extra.nodes[i]); }
      }
      for (i = 0; i < extra.edges.length; i++) {
        k = extra.edges[i].source + '>' + extra.edges[i].target;
        if (!seenE[k]) { seenE[k] = true; edges.push(extra.edges[i]); }
      }
      return { nodes: nodes, edges: edges };
    }

    function announceCount(n, q) {
      if (machine.state === 'error') return;
      var txt;
      if (q) txt = n + ' találat a(z) „' + q + '” keresésre.';
      else txt = n + ' dokumentum. Nyilakkal lépkedhetsz, Enterrel kiválasztod, még egy Enterrel megnyitod.';
      statusEl.textContent = txt;
    }

    // ---------------- FSM → koreográfia ----------------
    function onTransition(now, prev, ctx, event) {
      root.dataset.view = now;

      if (now === 'overview') {
        emptyEl.hidden = true;
        clearViewportFilter();            // kizoomolva minden dokumentum újra elérhető
        if (map) map.toOverview({ animate: prev !== 'loading' });
        if (prev === 'loading') playEntrance();
      } else if (now === 'focused') {
        emptyEl.hidden = true;
        var nid = docToNode(ctx.selectedId);
        if (map && nid) map.focusOn(nid, { animate: true });
      } else if (now === 'searching') {
        emptyEl.hidden = true;
      } else if (now === 'empty') {
        showEmpty(ctx.query);
      } else if (now === 'error') {
        showError();
      }
    }

    // ---------------- belépő koreográfia ----------------
    function playEntrance() {
      // Az ambient mező FOLYTATÓDIK a bejelentkezőből → nincs fade, nem pislog.
      // A kurált térkép „kigyúl", a lista sorai staggerrel jönnek be.
      if (reduced) { graphCanvas.style.opacity = '1'; return; }

      graphCanvas.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: DUR.slower, easing: EASE_GROW, fill: 'both' }
      );
      if (!handoff) {
        fieldCanvas.animate([{ opacity: 0 }, { opacity: 1 }],
          { duration: DUR.slower, easing: EASE_GROW, fill: 'both' });
      }
      bar.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: DUR.base, easing: EASE_GROW, fill: 'both' });

      var rows = listEl.querySelectorAll('.atlas__row');
      for (var i = 0; i < rows.length && i < 14; i++) {
        rows[i].animate(
          [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: DUR.base, easing: EASE_GROW, fill: 'both', delay: 90 + i * 40 }
        );
      }
    }

    function showEmpty(q) {
      emptyEl.hidden = false;
      emptyEl.innerHTML =
        '<div class="empty-state">' +
          '<p class="empty-state__title">Nincs találat</p>' +
          '<p class="empty-state__lead">Próbálj tágabb kulcsszót, vagy törölj egy szűrőt.</p>' +
          '<button class="btn btn--sm" type="button" data-act="clear">Szűrők törlése</button>' +
        '</div>';
      var b = emptyEl.querySelector('[data-act="clear"]');
      if (b) b.addEventListener('click', clearAll);
      statusEl.textContent = 'Nincs találat a(z) „' + q + '” keresésre.';
      if (!reduced) {
        emptyEl.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: DUR.base, easing: EASE_GROW, fill: 'both' });
      }
    }

    function showError() {
      // Fallback: a térkép eltűnik, a lista teljes szélességen átveszi a helyét.
      root.dataset.listonly = 'true';
      emptyEl.hidden = false;
      emptyEl.innerHTML =
        '<div class="atlas__alert" role="alert">' +
          '<span class="atlas__alert-icon">' + ICON_ALERT + '</span>' +
          '<div class="atlas__alert-body">' +
            '<span>A térképet most nem tudjuk megjeleníteni. A lista teljes értékűen használható.</span>' +
            '<button class="btn btn--sm" type="button" data-act="retry">Próbáld újra</button>' +
          '</div>' +
        '</div>';
      var r = emptyEl.querySelector('[data-act="retry"]');
      if (r) {
        r.addEventListener('click', function () { machine.send('RETRY'); boot(); });
        r.focus();
      }
      statusEl.textContent = 'A térkép nem elérhető — a lista használható.';
    }

    function clearAll() {
      input.value = '';
      store.setFilters({ today: false, mine: false, team: false, status: '', categories: [], onlyFav: false, onlyTpl: false });
      statusSel.value = '';
      paintFacetButtons();
      paintCategoryFilter();
      store.clear();
      machine.send('CLEAR');
      recompute();
    }

    // ---------------- store → panelek ----------------
    var unsubscribe = store.subscribe(function (s, prev) {
      // hover: csak vizuális kiemelés mindkét panelen (a lista maga is figyeli)
      if (s.hoverId !== prev.hoverId && map) {
        map.setHighlight({
          selectedId: docToNode(s.selectedId),
          hoverId: docToNode(s.hoverId),
          matchIds: lastView && lastView.matchIds ? lastView.matchIds : null
        });
      }
      if (s.selectedId !== prev.selectedId) {
        // ELŐBB az adat, UTÁNA az FSM: a `focusOn(id)` csak a legutóbbi
        // `setData`-ból ismert csomópontokat látja, ezért a szomszédság-nézetnek
        // már a kamera-tween indulásakor a rendererben kell lennie.
        recompute({ silent: true });
        if (s.selectedId) machine.send('SELECT', s.selectedId);
        else machine.send('CLEAR');
      }
      if (s.query !== prev.query) {
        var q = s.query.trim();
        if (q) {
          machine.send('SEARCH', q);
          var n = recompute();
          machine.send('RESULTS_OK', n);
        } else if (s.selectedId) {
          // A keresés törlése nem szünteti meg a kiválasztást — különben az FSM
          // „overview"-ra állna, miközben a store még fókuszált csomópontot tart.
          recompute();
        } else {
          machine.send('CLEAR');
          recompute();
        }
      }
    });

    // ---------------- vezérlők ----------------
    var searchTimer = 0;
    function onInput() {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { store.setQuery(input.value); }, SEARCH_DEBOUNCE);
    }
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; store.setQuery(''); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list.focusList(); }
    });

    function paintFacetButtons() {
      var f = store.state.filters;
      var btns = facetsWrap.querySelectorAll('[data-facet]');
      for (var i = 0; i < btns.length; i++) {
        var k = btns[i].getAttribute('data-facet');
        btns[i].setAttribute('aria-pressed', f[k] ? 'true' : 'false');
      }
    }

    function onFacetClick(e) {
      var b = e.target.closest ? e.target.closest('[data-facet]') : null;
      if (!b || !facetsWrap.contains(b)) return;
      var k = b.getAttribute('data-facet');
      var patch = {};
      patch[k] = !store.state.filters[k];
      store.setFilters(patch);
      paintFacetButtons();
      machine.send('FILTER', store.state.filters);
      recompute();
    }
    facetsWrap.addEventListener('click', onFacetClick);

    function onStatusChange() {
      store.setFilters({ status: statusSel.value });
      machine.send('FILTER', store.state.filters);
      recompute();
    }
    statusSel.addEventListener('change', onStatusChange);

    function toggleListOnly() {
      var on = root.dataset.listonly === 'true';
      if (on) {
        delete root.dataset.listonly;
        listOnlyBtn.setAttribute('aria-pressed', 'false');
        field.start(); if (map) map.start();
      } else {
        root.dataset.listonly = 'true';
        listOnlyBtn.setAttribute('aria-pressed', 'true');
        field.stop(); if (map) map.stop();   // rejtett térkép = ne pörgessünk rAF-ot
      }
      setTimeout(function () { field.resize(); if (map) map.resize(); }, 0);
    }
    listOnlyBtn.addEventListener('click', toggleListOnly);

    zoomOutBtn.addEventListener('click', backToOverview);

    newBtn.addEventListener('click', function () { if (cb.onNew) cb.onNew(); });

    // Esc a térképen = kizoomolás (a térkép nem lehet billentyűzet-csapda)
    function onRootKey(e) {
      if (e.key === 'Escape' && machine.state === 'focused') backToOverview();
    }
    root.addEventListener('keydown', onRootKey);

    // ---------------- méret ----------------
    function resizeAll() { field.resize(); if (map) map.resize(); }
    var ro = null;
    if (global.ResizeObserver) {
      ro = new ResizeObserver(resizeAll);
      ro.observe(mapEl);
    } else {
      global.addEventListener('resize', resizeAll);
    }
    // a kezdő méret néha layout előtt mérődik → deferred újramérés (setTimeout,
    // mert az rejtett fülön is lefut, ellentétben a rAF-fal)
    var resizeTimers = [setTimeout(resizeAll, 0), setTimeout(resizeAll, 220)];

    // ---------------- indítás ----------------
    function boot() {
      if (!model || !map) { machine.send('DATA_ERR'); return; }
      if (map.start) map.start();
      recompute({ silent: true });
      paintFacetButtons();
      renderCategoryPanel();      // most már van modell → a színjelek is bekerülnek
      paintCategoryFilter();
      announceCount(list.count, '');
      // a belépő koreográfia végén READY → overview
      var delay = reduced ? 0 : 120;
      setTimeout(function () { if (!destroyed) machine.send('READY'); }, delay);
    }
    boot();

    // ---------------- publikus ----------------
    function refresh(nextData) {
      if (nextData) data = nextData;
      if (!model) return;
      try {
        model = global.createGraphModel(buildRaw(), { tier: 0 });
      } catch (e) { machine.send('DATA_ERR'); return; }
      fillStatusSelect();
      renderCategoryPanel();
      statusSel.value = store.state.filters.status || '';
      paintFacetButtons();
      paintCategoryFilter();
      recompute({ silent: true });
    }

    function refreshColors() {
      field.refreshColors();
      if (map && map.refreshColors) map.refreshColors();
    }

    function destroy() {
      destroyed = true;
      clearTimeout(searchTimer);
      for (var i = 0; i < resizeTimers.length; i++) clearTimeout(resizeTimers[i]);
      unsubscribe();
      if (ro) ro.disconnect(); else global.removeEventListener('resize', resizeAll);
      input.removeEventListener('input', onInput);
      facetsWrap.removeEventListener('click', onFacetClick);
      statusSel.removeEventListener('change', onStatusChange);
      listOnlyBtn.removeEventListener('click', toggleListOnly);
      root.removeEventListener('keydown', onRootKey);
      catControl.removeEventListener('click', onCatControlClick);
      catControl.removeEventListener('keydown', onCatControlKeydown);
      catTagsEl.removeEventListener('click', onCatTagsClick);
      catPanel.removeEventListener('change', onCatPanelChange);
      catFilterEl.removeEventListener('keydown', onCatFilterKeydown);
      document.removeEventListener('click', onDocClickForCatFilter);
      global.removeEventListener('resize', positionCategoryPanel);   // ha épp nyitva volt
      if (list) list.destroy();
      if (map && map.destroy) map.destroy();
      if (field) field.destroy();
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    return {
      destroy: destroy,
      refresh: refresh,
      refreshColors: refreshColors,
      focusSearch: function () { input.focus(); },
      get machine() { return machine; },
      get store() { return store; }
    };
  }

  global.mountAtlas = mountAtlas;
})(window);
