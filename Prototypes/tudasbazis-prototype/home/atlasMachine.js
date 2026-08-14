/* atlasMachine.js — a kezdőoldal nézet-állapotgépe (FSM). A determinizmus forrása.
 *
 * Nem rajzol, nem animál: csak állapotot vált és eseményt közöl (`onTransition`).
 * Ismeretlen / kései esemény = no-op → nincs illegális állapot és nincs „random snap".
 *
 * Állapotok: loading · overview · focused · searching · empty · error
 * Kontextus:  { selectedId, query, filters, resultCount }
 */
(function (global) {
  'use strict';

  function createAtlasMachine(opts) {
    var onTransition = (opts && opts.onTransition) || function () {};
    var state = 'loading';
    var ctx = { selectedId: null, query: '', filters: {}, resultCount: null };

    var t = {
      loading: {
        READY: function () { return 'overview'; },
        DATA_ERR: function () { return 'error'; }
      },
      overview: {
        SELECT:   function (id) { ctx.selectedId = id; return 'focused'; },
        SEARCH:   function (q) { ctx.query = q; return 'searching'; },
        FILTER:   function (f) { ctx.filters = f; return 'overview'; },
        DATA_ERR: function () { return 'error'; }
      },
      focused: {
        SELECT:   function (id) { ctx.selectedId = id; return 'focused'; },
        ZOOM_OUT: function () { ctx.selectedId = null; return 'overview'; },
        CLEAR:    function () { ctx.selectedId = null; return 'overview'; },
        SEARCH:   function (q) { ctx.query = q; return 'searching'; },
        DATA_ERR: function () { return 'error'; }
      },
      searching: {
        RESULTS_OK: function (n) { ctx.resultCount = n; return n > 0 ? 'searching' : 'empty'; },
        SELECT:     function (id) { ctx.selectedId = id; return 'focused'; },
        SEARCH:     function (q) { ctx.query = q; return 'searching'; },
        CLEAR:      function () { ctx.query = ''; ctx.selectedId = null; return 'overview'; },
        DATA_ERR:   function () { return 'error'; }
      },
      empty: {
        SEARCH: function (q) { ctx.query = q; return 'searching'; },
        CLEAR:  function () { ctx.query = ''; return 'overview'; },
        DATA_ERR: function () { return 'error'; }
      },
      error: {
        RETRY: function () { return 'loading'; }
      }
    };

    function send(event, payload) {
      var table = t[state];
      var fn = table && table[event];
      if (!fn) return;                                     // ismeretlen esemény → no-op
      var next = fn(payload);
      // Önmagára visszatérő átmenet csak akkor közlődik, ha tényleg új dolog
      // történt: másik csomópont kiválasztása, új keresőkifejezés, új facet.
      if (!next) return;
      if (next === state && event !== 'SELECT' && event !== 'SEARCH' && event !== 'FILTER') return;
      var prev = state;
      state = next;
      onTransition(state, prev, {
        selectedId: ctx.selectedId, query: ctx.query,
        filters: ctx.filters, resultCount: ctx.resultCount
      }, event);
    }

    return {
      send: send,
      get state() { return state; },
      get context() {
        return {
          selectedId: ctx.selectedId, query: ctx.query,
          filters: ctx.filters, resultCount: ctx.resultCount
        };
      }
    };
  }

  global.createAtlasMachine = createAtlasMachine;
})(window);
