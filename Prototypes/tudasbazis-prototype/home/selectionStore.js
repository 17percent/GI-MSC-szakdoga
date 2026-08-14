/* selectionStore.js — EGYETLEN IGAZSÁGFORRÁS a térkép és a lista között.
 *
 * `{ hoverId, selectedId, query, filters }` + feliratkozás. Nem animál, nem hív
 * adatot, nem tud DOM-ról. Ez teszi lehetetlenné, hogy a két panel elcsússzon
 * egymástól: mindkettő ugyanezt az egy állapotot tükrözi.
 *
 * A setterek NO-OP-ok, ha az érték nem változott — ez zárja ki a panelek közti
 * visszacsatolási hurkot (térkép hover → store → lista → térkép → …).
 */
(function (global) {
  'use strict';

  function copyFilters(f) {
    return {
      today: !!f.today, mine: !!f.mine, team: !!f.team,
      status: f.status || '', categories: (f.categories || []).slice(),
      onlyFav: !!f.onlyFav, onlyTpl: !!f.onlyTpl
    };
  }

  function sameArray(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function sameFilters(a, b) {
    return a.today === b.today && a.mine === b.mine && a.team === b.team &&
           a.status === b.status && sameArray(a.categories, b.categories) &&
           a.onlyFav === b.onlyFav && a.onlyTpl === b.onlyTpl;
  }

  function createSelectionStore(initial) {
    var state = {
      hoverId: null,
      selectedId: null,
      query: '',
      filters: copyFilters(initial && initial.filters ? initial.filters : {})
    };
    var subs = [];

    function snapshot() {
      return {
        hoverId: state.hoverId,
        selectedId: state.selectedId,
        query: state.query,
        filters: copyFilters(state.filters)
      };
    }

    function emit(prev) {
      var now = snapshot();
      for (var i = 0; i < subs.length; i++) {
        try { subs[i](now, prev); } catch (e) { /* egy feliratkozó hibája ne állítsa meg a többit */ }
      }
    }

    function subscribe(fn) {
      subs.push(fn);
      return function unsubscribe() {
        var i = subs.indexOf(fn);
        if (i > -1) subs.splice(i, 1);
      };
    }

    function setHover(id) {
      if (id === undefined) id = null;
      if (state.hoverId === id) return;              // no-op → nincs hurok
      var prev = snapshot();
      state.hoverId = id;
      emit(prev);
    }

    function select(id) {
      if (id === undefined) id = null;
      if (state.selectedId === id) return;
      var prev = snapshot();
      state.selectedId = id;
      emit(prev);
    }

    function setQuery(text) {
      text = text == null ? '' : String(text);
      if (state.query === text) return;
      var prev = snapshot();
      state.query = text;
      emit(prev);
    }

    function setFilters(patch) {
      var next = copyFilters(state.filters);
      for (var k in patch) { if (Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k]; }
      next = copyFilters(next);
      if (sameFilters(state.filters, next)) return;
      var prev = snapshot();
      state.filters = next;
      emit(prev);
    }

    function clear() {
      var prev = snapshot();
      var changed = state.selectedId !== null || state.query !== '' || state.hoverId !== null;
      state.selectedId = null; state.hoverId = null; state.query = '';
      if (changed) emit(prev);
    }

    return {
      subscribe: subscribe,
      setHover: setHover,
      select: select,
      setQuery: setQuery,
      setFilters: setFilters,
      clear: clear,
      get state() { return snapshot(); }
    };
  }

  global.createSelectionStore = createSelectionStore;
})(window);
