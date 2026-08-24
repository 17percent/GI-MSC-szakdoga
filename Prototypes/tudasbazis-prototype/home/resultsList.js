/* resultsList.js — a találati lista: az AKADÁLYMENTESSÉGI ELSŐDLEGES nézet.
 *
 * A térkép dekoratív (aria-hidden); minden jelentés itt is elérhető. A lista
 * `role="listbox"`, a sorok `role="option"` + `aria-selected`; a kiválasztás a
 * közös `selectionStore`-ba megy, így a térkép azonnal követi (és fordítva).
 *
 * Átrendezés FLIP-pel: a sorok elcsúsznak az új helyükre, nem „bevágódnak".
 *
 * Gördülés: a lista a kiválasztott sorhoz gördül, ÉS a térképen hoverelt
 * dokumentumhoz is — hogy a kiemelt sor tényleg látható legyen. A LISTÁBÓL induló
 * hover viszont sosem gördít (különben a sorok a kurzor alól csúsznának el, és a
 * `pointerover` önmagát hajtó hurokba kerülne).
 *
 * A KIJELÖLÉS gördülése nem egyszeri kísérlet: a szándékot megjegyezzük, és minden
 * újrafestés után újrapróbáljuk (`requestScrollTo` / `flushPendingScroll`). Erre
 * azért van szükség, mert a kijelölés ugyanabban a körben újraépítheti a sorokat,
 * és egy már megtörtént gördülés elveszne — emiatt nem oda állt a lista, ahol a
 * térképen kiválasztott elem van.
 *
 * Billentyűzet:
 *   ↑/↓/Home/End — lépés a sorok között (aktív sor + a térképen pulzálás)
 *   Enter/Space  — kiválasztás (a térkép kamerája ráközelít)
 *   Enter újra   — a kiválasztott dokumentum megnyitása
 *
 * A soron belüli ikongombok (kedvenc, megnyitás) `tabindex="-1"`-esek, hogy a
 * `listbox` billentyűzet-modellt ne törjék meg (egy `option` nem tartalmazhat
 * fókuszálható vezérlőt); a kedvenc billentyűzetről a dokumentumnézetben állítható.
 */
(function (global) {
  'use strict';

  var VIRTUAL_THRESHOLD = 200;   // efölött ablakozunk (a prototípus korpusza ennél kisebb)
  var ROW_ESTIMATE = 96;         // px — csak az ablakozás becsléséhez

  function createResultsList(listEl, opts) {
    opts = opts || {};
    var store = opts.store;
    var reduced = !!opts.reducedMotion;
    var onOpen = opts.onOpen || function () {};
    var onToggleFav = opts.onToggleFav || function () {};

    var items = [];
    var query = '';
    var activeId = null;
    var rowsById = {};
    var windowed = false;
    var scrollRaf = 0;

    listEl.setAttribute('role', 'listbox');
    if (!listEl.hasAttribute('tabindex')) listEl.setAttribute('tabindex', '0');

    // ---------- render ----------
    function rowHtml(it) {
      var lock = it.lockedBy
        ? '<span class="meta-item lock">🔒 szerkeszti: ' + it.lockedBy + '</span>' : '';
      // A kategória-címke a térkép paletta-slotját is hordozza (színpont), így a
      // térképen látott szín itt visszakereshető — a szín nem magában áll.
      var cats = '';
      for (var i = 0; i < it.categories.length; i++) {
        var c = it.categories[i];
        var nm = (c && c.name !== undefined) ? c.name : c;      // visszafelé kompatibilis
        var sl = (c && c.slot) ? c.slot : 0;
        cats += '<span class="badge cat"' + (sl ? ' data-slot="' + sl + '"' : '') + '>' + nm + '</span>';
      }
      return '' +
        '<li class="atlas__row" role="option" id="atlas-opt-' + it.id + '" data-id="' + it.id + '" aria-selected="false">' +
          // A kedvenc-állapot NEM csak színnel: a glyph is más (★ / ☆), és
          // `aria-pressed` mondja ki a képernyőolvasónak.
          '<button class="fav-star atlas__fav' + (it.isFav ? ' on' : '') + '" tabindex="-1" type="button" ' +
                  'aria-pressed="' + (it.isFav ? 'true' : 'false') + '" ' +
                  'aria-label="Kedvenc — privát, csak te látod" data-act="fav">' +
                  (it.isFav ? '★' : '☆') + '</button>' +
          '<div class="atlas__row-main">' +
            '<div class="atlas__row-title">' + it.title +
              (it.isTemplate ? ' <span class="badge tpl">sablon</span>' : '') +
            '</div>' +
            (it.snippetHtml ? '<div class="atlas__row-snippet">' + it.snippetHtml + '</div>' : '') +
            '<div class="atlas__row-meta">' + cats +
              '<span class="meta-item">' + it.ownerName + '</span>' +
              '<span class="meta-item mono">' + it.updatedText + '</span>' +
              '<span class="meta-item mono">it. ' + it.iteration + '</span>' +
              lock +
            '</div>' +
          '</div>' +
          '<span class="badge ' + it.statusClass + '">' + it.status + '</span>' +
          '<button class="atlas__open" tabindex="-1" type="button" data-act="open" ' +
                  'aria-label="Megnyitás">→</button>' +
        '</li>';
    }

    function visibleSlice() {
      if (!windowed) return { from: 0, to: items.length, padTop: 0, padBottom: 0 };
      var h = listEl.clientHeight || 600;
      var from = Math.max(0, Math.floor(listEl.scrollTop / ROW_ESTIMATE) - 5);
      var to = Math.min(items.length, from + Math.ceil(h / ROW_ESTIMATE) + 10);
      return { from: from, to: to, padTop: from * ROW_ESTIMATE, padBottom: (items.length - to) * ROW_ESTIMATE };
    }

    // FLIP: az átrendezés előtti pozíciók
    function capturePositions() {
      var map = {};
      for (var id in rowsById) {
        if (!Object.prototype.hasOwnProperty.call(rowsById, id)) continue;
        var el = rowsById[id];
        if (el && el.parentNode) map[id] = el.getBoundingClientRect().top;
      }
      return map;
    }

    function paint(before) {
      var slice = visibleSlice();
      var html = '';
      if (slice.padTop) html += '<li class="atlas__spacer" aria-hidden="true" style="height:' + slice.padTop + 'px"></li>';
      for (var i = slice.from; i < slice.to; i++) html += rowHtml(items[i]);
      if (slice.padBottom) html += '<li class="atlas__spacer" aria-hidden="true" style="height:' + slice.padBottom + 'px"></li>';
      listEl.innerHTML = html;

      rowsById = {};
      var rows = listEl.querySelectorAll('.atlas__row');
      for (var r = 0; r < rows.length; r++) rowsById[rows[r].getAttribute('data-id')] = rows[r];

      applyHighlight(store.state);

      // FLIP: a régi és új pozíció különbségéből visszafelé animálunk
      if (before && !reduced && !windowed) {
        for (var id in rowsById) {
          if (!Object.prototype.hasOwnProperty.call(rowsById, id)) continue;
          if (!(id in before)) continue;
          var el = rowsById[id];
          var delta = before[id] - el.getBoundingClientRect().top;
          if (!delta) continue;
          el.animate(
            [{ transform: 'translateY(' + delta + 'px)' }, { transform: 'translateY(0)' }],
            { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' }
          );
        }
      }

      // A sorok most cserélődtek ki: ha volt elmaradt gördülés-szándék (pl. egy
      // térkép-kattintás kijelölése, ami épp újraépítette a listát), most van
      // értelme újrapróbálni.
      flushPendingScroll();
    }

    function setItems(next, meta) {
      var before = capturePositions();
      items = next || [];
      query = (meta && meta.query) || '';
      windowed = items.length > VIRTUAL_THRESHOLD;
      if (activeId && !findIndex(activeId)) activeId = null;
      paint(before);
    }

    function findIndex(id) {
      for (var i = 0; i < items.length; i++) if (items[i].id === id) return i + 1; // 1-alapú (0 = nincs)
      return 0;
    }

    // ---------- kiemelés (a store tükre) ----------
    function applyHighlight(s) {
      for (var id in rowsById) {
        if (!Object.prototype.hasOwnProperty.call(rowsById, id)) continue;
        var el = rowsById[id];
        el.setAttribute('aria-selected', s.selectedId === id ? 'true' : 'false');
        if (s.hoverId === id) el.setAttribute('data-hover', 'true');
        else el.removeAttribute('data-hover');
        if (activeId === id) el.setAttribute('data-active', 'true');
        else el.removeAttribute('data-active');
      }
      listEl.setAttribute('aria-activedescendant', activeId ? 'atlas-opt-' + activeId : '');
    }

    // `block: 'nearest'` — csak akkor gördül, ha a sor tényleg kilóg a nézetből,
    // és akkor is a lehető legkevesebbet: a lista nem ugrik feleslegesen.
    function scrollRowIntoView(id) {
      var el = rowsById[id];
      if (!el) return false;
      if (reduced) { el.scrollIntoView({ block: 'nearest' }); return true; }
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return true;
    }

    // A KIJELÖLÉSHEZ való odagördülés nem lehet egyszeri kísérlet: a kijelölés
    // ugyanabban a körben újraépítheti a listát (a nézet `recompute`-ol, a sorok
    // kicserélődnek), és akkor egy már megtörtént gördülés elveszik. Ezért a
    // szándékot MEGJEGYEZZÜK, és minden újrarajzolás után újrapróbáljuk, amíg a
    // sor tényleg létezik.
    var pendingScrollId = null;

    function requestScrollTo(id) {
      pendingScrollId = id || null;
      flushPendingScroll();
    }

    function flushPendingScroll() {
      if (!pendingScrollId) return;
      var id = pendingScrollId;
      if (scrollRowIntoView(id)) { pendingScrollId = null; return; }
      // A sor nincs a DOM-ban. Ha egyáltalán nincs a listában, nincs mit várni.
      var idx = findIndex(id) - 1;
      if (idx < 0) { pendingScrollId = null; return; }
      // Ablakozott listában (200 tétel felett) a sor létezik, csak nincs
      // kirenderelve: a becsült pozícióra ugrunk, mire a következő festés
      // kirendereli, és a `paint()` újrahívja ezt a pontos igazításhoz.
      if (windowed) {
        var target = idx * ROW_ESTIMATE - (listEl.clientHeight || 0) / 2 + ROW_ESTIMATE / 2;
        listEl.scrollTop = target > 0 ? target : 0;
      }
    }

    // A LISTÁBÓL induló hover nem gördíthet: a sorok elcsúsznának a kurzor alól,
    // az új sor `pointerover`-t kapna, az újabb hovert állítana → önmagát hajtó
    // hurok. A `store.setHover` emitje szinkron, ezért egy egyszerű zászló elég:
    // a feliratkozó még ezen az ablakon belül fut le.
    var selfHover = false;
    function setHoverFromList(id) {
      selfHover = true;
      try { store.setHover(id); } finally { selfHover = false; }
    }

    // A TÉRKÉPRŐL jövő hover odagördíti a listát. Rövid debounce, hogy a
    // csomópontok közti gyors kurzor-söprés a végállapotra álljon be, ne
    // gördüljön minden érintett dokumentumhoz külön.
    var HOVER_SCROLL_DELAY = 90;
    var hoverScrollTimer = 0;
    function scheduleHoverScroll(id) {
      if (hoverScrollTimer) global.clearTimeout(hoverScrollTimer);
      hoverScrollTimer = global.setTimeout(function () {
        hoverScrollTimer = 0;
        // a hover időközben elmozdulhatott — mindig az ÉPP érvényes sorhoz igazítunk
        if (store.state.hoverId === id) scrollRowIntoView(id);
      }, HOVER_SCROLL_DELAY);
    }

    // ---------- interakció ----------
    function rowFromEvent(e) {
      var n = e.target;
      while (n && n !== listEl) {
        if (n.classList && n.classList.contains('atlas__row')) return n;
        n = n.parentNode;
      }
      return null;
    }

    function onClick(e) {
      var row = rowFromEvent(e);
      if (!row) return;
      var id = row.getAttribute('data-id');
      var actEl = e.target.closest ? e.target.closest('[data-act]') : null;
      var act = actEl && row.contains(actEl) ? actEl.getAttribute('data-act') : null;
      if (act === 'fav') { e.stopPropagation(); onToggleFav(id); return; }
      if (act === 'open') { e.stopPropagation(); onOpen(id); return; }
      activeId = id;
      store.select(id);
    }

    function onDblClick(e) {
      var row = rowFromEvent(e);
      if (row) onOpen(row.getAttribute('data-id'));
    }

    function onOver(e) {
      var row = rowFromEvent(e);
      setHoverFromList(row ? row.getAttribute('data-id') : null);
    }
    function onLeave() { setHoverFromList(null); }

    // Home/End: ugyanaz az út, mint a nyilaknál — aktív sor + hover-előnézet a
    // térképen + odagördülés. (Korábban a Home/End nem gördült a sorhoz.)
    function jumpTo(idx) {
      if (!items.length) return;
      activeId = items[idx].id;
      applyHighlight(store.state);
      setHoverFromList(activeId);
      var el = rowsById[activeId];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    function move(delta) {
      if (!items.length) return;
      var idx = activeId ? findIndex(activeId) - 1 : -1;
      idx = idx + delta;
      if (idx < 0) idx = 0;
      if (idx > items.length - 1) idx = items.length - 1;
      activeId = items[idx].id;
      applyHighlight(store.state);
      setHoverFromList(activeId);            // a térképen pulzál — előnézet kamera nélkül
      // billentyűzetnél azonnal (nem smooth): tartott nyílra ne fusson be tween-sor
      var el = rowsById[activeId];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }

    function onKeyDown(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(activeId ? 1 : 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Home') { e.preventDefault(); jumpTo(0); }
      else if (e.key === 'End') { e.preventDefault(); jumpTo(items.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') {
        if (!activeId) return;
        e.preventDefault();
        // első Enter: kiválasztás (kamera ráközelít) · újabb Enter: megnyitás
        if (store.state.selectedId === activeId) onOpen(activeId);
        else store.select(activeId);
      }
    }

    function onScroll() {
      if (!windowed || scrollRaf) return;
      scrollRaf = global.requestAnimationFrame(function () { scrollRaf = 0; paint(null); });
    }

    listEl.addEventListener('click', onClick);
    listEl.addEventListener('dblclick', onDblClick);
    listEl.addEventListener('pointerover', onOver);
    listEl.addEventListener('pointerleave', onLeave);
    listEl.addEventListener('keydown', onKeyDown);
    listEl.addEventListener('scroll', onScroll);

    // a store minden változására tükrözünk
    var unsubscribe = store.subscribe(function (s, prev) {
      applyHighlight(s);
      if (s.selectedId && s.selectedId !== prev.selectedId) {
        activeId = s.selectedId;
        applyHighlight(s);
        // Nem közvetlen gördülés: a kijelölés a nézetben újraépítheti a sorokat,
        // ezért a szándékot jegyezzük meg, és a festés után is érvényesítjük.
        requestScrollTo(s.selectedId);
      }
      // Térkép-hover → a lista odagördül, hogy a kiemelt sor LÁTHATÓ legyen (eddig
      // csak a kiemelés cserélődött, néma maradt, ha a sor kilógott a nézetből).
      // A kijelölés-váltás fentebb már gördült, azt nem duplázzuk.
      if (s.hoverId && s.hoverId !== prev.hoverId && !selfHover &&
          s.hoverId !== s.selectedId) {
        scheduleHoverScroll(s.hoverId);
      }
    });

    function destroy() {
      unsubscribe();
      if (scrollRaf) global.cancelAnimationFrame(scrollRaf);
      if (hoverScrollTimer) global.clearTimeout(hoverScrollTimer);
      listEl.removeEventListener('click', onClick);
      listEl.removeEventListener('dblclick', onDblClick);
      listEl.removeEventListener('pointerover', onOver);
      listEl.removeEventListener('pointerleave', onLeave);
      listEl.removeEventListener('keydown', onKeyDown);
      listEl.removeEventListener('scroll', onScroll);
      listEl.innerHTML = '';
      rowsById = {};
    }

    return {
      setItems: setItems,
      destroy: destroy,
      focusList: function () { listEl.focus(); },
      get count() { return items.length; }
    };
  }

  global.createResultsList = createResultsList;
})(window);
