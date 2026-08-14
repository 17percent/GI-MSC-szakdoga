/* authMachine.js — explicit állapotgép (FSM). A DETERMINIZMUS forrása.
 *
 * Nem animál, nem rajzol, nem ismer DOM-ot: csak állapotot vált és eseményt közöl
 * (`onTransition`). Ismeretlen / kései esemény = no-op (nincs illegális ugrás),
 * ez zárja ki a „random snap"-et is.
 *
 * Állapotok: loading · idle · connecting · redirecting · error
 * Kontextus:  { provider: "google"|"microsoft"|null, error: string|null }
 *
 * Klasszikus script → globális gyár (nincs ES-module a prototípusban).
 */
(function (global) {
  'use strict';

  function createAuthMachine(opts) {
    var onTransition = (opts && opts.onTransition) || function () {};
    var state = 'loading';
    var context = { provider: null, error: null };

    // Átmeneti tábla: aktuális állapot → esemény → (payload) => következő állapot.
    var transitions = {
      loading: {
        READY: function () { return 'idle'; }
      },
      idle: {
        SELECT: function (p) { context.provider = p; return 'connecting'; }
      },
      connecting: {
        CONNECT_OK:  function () { return 'redirecting'; },
        CONNECT_ERR: function (m) { context.error = m; return 'error'; },
        CANCEL:      function () { context.provider = null; return 'idle'; }
      },
      // redirecting: elnavigál (valódi OAuth redirect) — nincs kimenő esemény.
      error: {
        RETRY: function () { context.error = null; context.provider = null; return 'idle'; }
      }
    };

    function send(event, payload) {
      var table = transitions[state];
      var fn = table && table[event];
      if (!fn) return;                         // ismeretlen esemény ebben az állapotban → no-op
      var next = fn(payload);
      if (!next || next === state) return;     // önmagára / érvénytelen → no-op
      var prev = state;
      state = next;
      onTransition(state, prev, { provider: context.provider, error: context.error });
    }

    return {
      send: send,
      get state() { return state; },
      get context() { return { provider: context.provider, error: context.error }; }
    };
  }

  global.createAuthMachine = createAuthMachine;
})(window);
