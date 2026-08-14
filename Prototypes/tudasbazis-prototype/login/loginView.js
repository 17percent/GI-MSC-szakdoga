/* loginView.js — a DOM felépítése/összekötése + a koreográfia.
 *
 * Minden állapotátmenetnél lejátssza a WAAPI/CSS animációt és vezérli a
 * constellation módját. Üzleti logikát NEM tartalmaz: „mi a következő állapot?" —
 * azt az authMachine dönti el. Csak `opacity`/`transform` animál; a hely mindig
 * fenntartva (nincs layout-snap).
 *
 * Publikus: window.mountLogin(container, opts) → { destroy() }
 *   opts.onComplete(userId)  — a (mock) redirect befejeztével hívjuk
 *   opts.reducedMotion       — a hívó adja át a media-query eredményét
 *   opts.defaultUserId       — fallback, ha a config nem ad mockUserId-t
 */
(function (global) {
  'use strict';

  // ---- világfa jel (visszafogott vonalas glyph, tudásgráf-érzet) ----
  var MARK_SVG =
    '<svg viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<g class="mark__stroke" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M24 54v-8"/>' +                                  // törzs alja
    '<path d="M24 46c-4 0-6-2-9-4M24 46c4 0 6-2 9-4"/>' +      // gyökér
    '<path d="M24 46V26"/>' +                                   // fő törzs
    '<path d="M24 30c-4-2-7-4-9-8M24 30c4-2 7-4 9-8"/>' +       // alsó ágak
    '<path d="M24 24c-3-3-4-6-4-10M24 24c3-3 4-6 4-10"/>' +     // felső ágak
    '</g>' +
    '<g class="mark__nodes" fill="currentColor">' +             // csomópontok (tudáspontok)
    '<circle cx="24" cy="10" r="2.4"/>' +
    '<circle cx="14" cy="14" r="2"/>' +
    '<circle cx="34" cy="14" r="2"/>' +
    '<circle cx="15" cy="22" r="1.8"/>' +
    '<circle cx="33" cy="22" r="1.8"/>' +
    '</g></svg>';

  // ---- hivatalos provider-jelek (brand-eszközök: a márkaszínek szándékosan nem
  //      tokenizáltak — ezek nem a rendszer felületei, hanem a Google/Microsoft
  //      hivatalos logói; így ismeri fel a felhasználó) ----
  var GOOGLE_SVG =
    '<svg viewBox="0 0 48 48" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    '</svg>';
  var MS_SVG =
    '<svg viewBox="0 0 21 21" width="18" height="18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<rect x="1" y="1" width="9" height="9" fill="#F25022"/>' +
    '<rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>' +
    '<rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>' +
    '<rect x="11" y="11" width="9" height="9" fill="#FFB900"/>' +
    '</svg>';

  // determinált „töltő ív" a connecting gombra
  var SPINNER_SVG =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
    '<circle class="login__spin-track" cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/>' +
    '<circle class="login__spin-arc" cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4" ' +
    'stroke-linecap="round" transform="rotate(-90 12 12)"/></svg>';

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function mountLogin(container, opts) {
    opts = opts || {};
    var reduced = !!opts.reducedMotion;
    var cfgAuth = global.TALTOS_AUTH || {};
    var providerLabels = cfgAuth.labels || { google: 'Google', microsoft: 'Microsoft' };
    var mockUserId = cfgAuth.mockUserId || opts.defaultUserId || null;

    // ---- markup (kézirat 2. pont) ----
    var root = el(
      '<section class="login" data-state="loading" aria-label="Bejelentkezés">' +
        '<canvas class="login__field" aria-hidden="true"></canvas>' +
        '<div class="login__card" role="group" aria-labelledby="login-title">' +
          '<button class="login__theme" type="button" aria-label="Téma váltása"></button>' +
          '<div class="login__mark" data-mark aria-hidden="true">' + MARK_SVG + '</div>' +
          '<p class="login__eyebrow">Kollektív emlékezet</p>' +
          '<h1 class="login__title" id="login-title">Lépj a küszöbön át</h1>' +
          '<p class="login__lead">A szervezet emlékezete vár. Válaszd a belépés módját.</p>' +
          '<div class="login__actions">' +
            providerButton('google', GOOGLE_SVG, 'Folytatás Google-fiókkal') +
            providerButton('microsoft', MS_SVG, 'Bejelentkezés Microsoft-fiókkal') +
          '</div>' +
          '<div class="login__status" role="status" aria-live="polite"></div>' +
        '</div>' +
      '</section>'
    );
    container.appendChild(root);

    var canvas = root.querySelector('.login__field');
    var card = root.querySelector('.login__card');
    var mark = root.querySelector('[data-mark]');
    var eyebrow = root.querySelector('.login__eyebrow');
    var title = root.querySelector('.login__title');
    var lead = root.querySelector('.login__lead');
    var actions = root.querySelector('.login__actions');
    var statusEl = root.querySelector('.login__status');
    var themeBtn = root.querySelector('.login__theme');
    var buttons = Array.prototype.slice.call(root.querySelectorAll('.login__provider'));

    // ---- token-vezérelt időzítés/görbe ----
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
    var EASE = {
      grow: cs.getPropertyValue('--ease-grow').trim() || 'cubic-bezier(.22,1,.36,1)',
      standard: cs.getPropertyValue('--ease-standard').trim() || 'cubic-bezier(.4,0,.2,1)',
      exit: cs.getPropertyValue('--ease-exit').trim() || 'cubic-bezier(.4,0,1,1)'
    };

    // ---- constellation ----
    var field = global.createConstellation(canvas, { intensity: 'balanced', reducedMotion: reduced });
    field.start();
    // A kezdő méret néha egy korai (layout előtti) képkockán mérődik → biztos, ami
    // biztos: néhány deferred újramérés a ResizeObserver mellett, setTimeout-tal
    // (ez rejtett fülön/kompozit nélkül is lefut, ellentétben a rAF-fal).
    var resizeTimers = [setTimeout(field.resize, 0), setTimeout(field.resize, 200)];

    // ---- FSM ----
    var machine = global.createAuthMachine({ onTransition: onTransition });

    // reduced-motion figyelése futás közben (téma nem, de a mozgás igen)
    var rm = global.matchMedia('(prefers-reduced-motion: reduce)');

    // ---------- theme toggle (helyi: nem indít teljes app-render) ----------
    function isDark() { return document.documentElement.dataset.theme === 'dark'; }
    function paintThemeBtn() {
      themeBtn.textContent = isDark() ? '☀' : '☾';
      themeBtn.title = isDark() ? 'Váltás világos módra' : 'Váltás sötét módra';
    }
    paintThemeBtn();
    themeBtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      document.documentElement.classList.add('theme-anim');
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('tb-theme', next); } catch (e) {}
      setTimeout(function () { document.documentElement.classList.remove('theme-anim'); }, 300);
      paintThemeBtn();
      field.refreshColors();                    // a canvas témával együtt vált
    });

    // ---------- WAAPI segéd (reduced-motion: rövid crossfade, nincs transzform) ----------
    function play(node, frames, options) {
      if (reduced) {
        // csak opacitás, rövid; a végállapotot azonnal fixáljuk
        var last = frames[frames.length - 1] || {};
        if ('opacity' in last) node.style.opacity = last.opacity;
        if (last.transform) node.style.transform = 'none';
        return { finished: Promise.resolve(), cancel: function () {} };
      }
      var anim = node.animate(frames, options);
      return { finished: anim.finished.catch(function () {}), cancel: function () { anim.cancel(); } };
    }
    function wait(t) { return new Promise(function (r) { setTimeout(r, reduced ? Math.min(t, 60) : t); }); }

    // ---------- belépő koreográfia (loading → idle) ----------
    function playEntrance() {
      // kezdő rejtett állapot (a hely fenntartva marad, csak opacitás/eltolás)
      var staged = [mark, eyebrow, title, lead, actions, statusEl];
      staged.forEach(function (n) { n.style.opacity = '0'; });

      if (reduced) {
        staged.forEach(function (n) { n.style.opacity = '1'; });
        machine.send('READY');
        return;
      }

      // kártya finoman beúszik
      play(card, [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: DUR.slow, easing: EASE.grow, fill: 'both' });

      // jel „kinő"
      play(mark, [
        { opacity: 0, transform: 'scale(.7)' },
        { opacity: 1, transform: 'scale(1)' }
      ], { duration: DUR.slower, easing: EASE.grow, fill: 'both', delay: 80 });

      // szövegek/gombok egymás után (stagger ~60ms)
      var seq = [eyebrow, title, lead, actions, statusEl];
      seq.forEach(function (n, i) {
        play(n, [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: DUR.base, easing: EASE.grow, fill: 'both', delay: 220 + i * 60 });
      });

      // a végén READY
      setTimeout(function () { machine.send('READY'); }, 220 + seq.length * 60 + DUR.base);
    }

    // ---------- provider választás ----------
    function selectProvider(provider) {
      if (machine.state !== 'idle') return;     // FSM úgyis elnyelné; korai kilépés
      machine.send('SELECT', provider);
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () { selectProvider(btn.dataset.provider); });
    });

    // ---------- FSM → koreográfia ----------
    function onTransition(stateNow, prev, ctx) {
      root.dataset.state = stateNow;
      if (stateNow === 'idle' && prev === 'loading') enterIdle();
      else if (stateNow === 'connecting') enterConnecting(ctx.provider);
      else if (stateNow === 'redirecting') enterRedirecting();
      else if (stateNow === 'error') enterError(ctx.error);
      else if (stateNow === 'idle') resetToIdle();
    }

    function enterIdle() {
      field.setMode('idle');
      buttons.forEach(function (b) { b.disabled = false; });
    }

    function enterConnecting(provider) {
      field.setMode('converge');
      var name = providerLabels[provider] || provider;
      var active = buttons.filter(function (b) { return b.dataset.provider === provider; })[0];
      var other = buttons.filter(function (b) { return b.dataset.provider !== provider; })[0];

      // másik gomb halványul + tiltott
      if (other) { other.disabled = true; play(other, [{ opacity: 1 }, { opacity: 0.5 }], { duration: DUR.base, easing: EASE.standard, fill: 'both' }); }
      active.disabled = true;
      active.classList.add('is-connecting');

      // felirat crossfade „Kapcsolódás a(z) …-hoz/hez…"-re
      var label = active.querySelector('.login__provider-label');
      crossfadeText(label, 'Kapcsolódás — ' + name + '…');

      // logó helyére determinált töltő-ív
      var logo = active.querySelector('.login__logo');
      logo.innerHTML = SPINNER_SVG;
      var arc = logo.querySelector('.login__spin-arc');
      var C = 2 * Math.PI * 9;
      arc.style.strokeDasharray = C;
      arc.style.strokeDashoffset = C;

      // élő régió kimondja
      statusEl.textContent = 'Kapcsolódás a(z) ' + name + '-fiókhoz…';

      // a mező felé egy fényhullám a gomb irányából (ha van pulseToward)
      if (field.pulseToward) {
        var r = active.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
        field.pulseToward(r.left + r.width / 2 - cr.left, r.top + r.height / 2 - cr.top);
      }

      // ív feltöltése a min. megjelenítési idő alatt
      var connectMs = Math.max(DUR.slow, 700);
      if (!reduced) {
        arc.animate([{ strokeDashoffset: C }, { strokeDashoffset: 0 }],
          { duration: connectMs, easing: EASE.grow, fill: 'both' });
      } else {
        arc.style.strokeDashoffset = 0;
      }

      // MOCK provider-előkészítés + minimum megjelenítési idő (nincs villanás)
      var providerReady = wait(750);            // valódi flow: MSAL/GIS init + redirect előkészítés
      var minDelay = wait(DUR.slow);
      Promise.all([providerReady, minDelay]).then(function () {
        if (machine.state !== 'connecting') return;   // időközben megszakadt
        // Itt dőlne el valódi hiba: sikertelen provider → machine.send('CONNECT_ERR', üzenet)
        machine.send('CONNECT_OK');
      });
    }

    function enterRedirecting() {
      field.setMode('ascend');
      statusEl.textContent = 'Belépés folyamatban — átirányítás…';

      // ── SHARED ELEMENT ────────────────────────────────────────────────────
      // A világfa-jel túléli a bejelentkezőt: kimásoljuk egy fix pozíciós klónba,
      // az eredetit elrejtjük. Így a kártya szétoszlik KÖRÜLÖTTE, a jel pedig
      // marad, és onnan úszik tovább az alkalmazás fejlécébe (app.js repíti).
      var r = mark.getBoundingClientRect();
      var flying = null;
      if (!reduced) {
        flying = document.createElement('div');
        flying.className = 'login__mark login__mark--flying';
        flying.setAttribute('aria-hidden', 'true');
        flying.innerHTML = MARK_SVG;
        flying.style.left = r.left + 'px';
        flying.style.top = r.top + 'px';
        flying.style.width = r.width + 'px';
        flying.style.height = r.height + 'px';
        document.body.appendChild(flying);
        mark.style.visibility = 'hidden';
      }

      // A kezdőoldalnak átadott folytonosság-csomag: a jel klónja + a
      // részecskemező pillanatképe (hogy a csillagkép ne kezdődjön újra).
      var handoff = {
        markEl: flying,
        markRect: { left: r.left, top: r.top, width: r.width, height: r.height },
        ambient: field.getSnapshot(),
        reducedMotion: reduced
      };

      // A kártya felúszik + halványul (csak vizuális).
      play(card, [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-16px)' }
      ], { duration: DUR.slow, easing: EASE.exit, fill: 'both' });

      // A befejezést IDŐZÍTŐRŐL indítjuk, nem a WAAPI `finished`-ről: a document-
      // timeline háttérfülön befagy, így a `.finished` sosem oldódna fel (és egy
      // valódi redirect is beragadna). A setTimeout rejtett fülön is lefut.
      wait(DUR.slow).then(function () {
        if (machine.state !== 'redirecting') return;
        // ── VALÓDI OAUTH REDIRECT HELYE ─────────────────────────────────────
        //   Éles integrációban itt hívnád a provider redirectjét, pl.:
        //     msalInstance.loginRedirect(...)  /  google.accounts.oauth2 redirect
        //   A böngésző elnavigálna; a felúszó animáció a navigáció előtti utolsó
        //   képkocka. A callback-oldal (/auth/callback) a belépő koreográfiát
        //   fordítva játszaná, shared-element folytonossággal vinné a jelet.
        // ── PROTOTÍPUS-MOCK: nincs backend → sikeres belépés helyben ─────────
        if (typeof opts.onComplete === 'function') opts.onComplete(mockUserId, handoff);
      });
    }

    function enterError(message) {
      field.setMode('settle');
      var active = buttons.filter(function (b) { return b.classList.contains('is-connecting'); })[0];
      // gombok visszaállítása
      buttons.forEach(function (b) {
        b.disabled = false; b.classList.remove('is-connecting'); b.style.opacity = '';
      });
      restoreButtonLabels();

      // --danger alert (ikon + szöveg, nem csak szín), a helye fenntartva
      statusEl.innerHTML =
        '<div class="login__alert" role="alert">' +
          '<svg class="login__alert-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" ' +
          'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>' +
          '<div class="login__alert-body">' +
            '<span>' + (message || 'Nem sikerült kapcsolódni a fiókhoz. Próbáld újra, vagy válassz másik belépést.') + '</span>' +
            '<button class="login__retry" type="button">Próbáld újra</button>' +
          '</div>' +
        '</div>';
      var alert = statusEl.querySelector('.login__alert');
      play(alert, [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: DUR.base, easing: EASE.grow, fill: 'both' });

      var retry = statusEl.querySelector('.login__retry');
      retry.addEventListener('click', function () { machine.send('RETRY'); });
      retry.focus();
    }

    function resetToIdle() {
      // error → idle (RETRY): alert kicsúszik, gombok/feliratok visszaállnak
      field.setMode('idle');
      var alert = statusEl.querySelector('.login__alert');
      if (alert && !reduced) {
        play(alert, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(8px)' }],
          { duration: DUR.base, easing: EASE.exit, fill: 'both' }).finished.then(function () { statusEl.innerHTML = ''; });
      } else {
        statusEl.innerHTML = '';
      }
      buttons.forEach(function (b) { b.disabled = false; b.style.opacity = ''; b.classList.remove('is-connecting'); });
      restoreButtonLabels();
    }

    // ---------- feliratok / crossfade ----------
    var originalLabels = {};
    buttons.forEach(function (b) {
      originalLabels[b.dataset.provider] = b.querySelector('.login__provider-label').textContent;
    });
    function restoreButtonLabels() {
      buttons.forEach(function (b) {
        b.querySelector('.login__provider-label').textContent = originalLabels[b.dataset.provider];
        var logo = b.querySelector('.login__logo');
        logo.innerHTML = b.dataset.provider === 'google' ? GOOGLE_SVG : MS_SVG;
      });
    }
    function crossfadeText(node, text) {
      if (reduced) { node.textContent = text; return; }
      var a = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DUR.fast, easing: EASE.standard });
      a.finished.then(function () {
        node.textContent = text;
        node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.base, easing: EASE.grow });
      }).catch(function () { node.textContent = text; });
    }

    // ---------- parallax (kurzor) ----------
    // Mozgáscsökkentésnél és érintős/kicsi kijelzőn nincs parallax (kézirat 10.).
    var noParallax = reduced || global.matchMedia('(hover: none), (max-width: 640px)').matches;
    function onPointerMove(e) {
      if (reduced) return;
      // kurzor-fénylés mindig (nem-érintős); a parallax-eltolás csak asztali/hover-en
      var cr = canvas.getBoundingClientRect();
      field.setPointer(e.clientX - cr.left, e.clientY - cr.top);
      if (noParallax) return;
      var r = root.getBoundingClientRect();
      var nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      var ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      card.style.setProperty('--px', (nx * 10).toFixed(1) + 'px');   // kártya ±10px
      card.style.setProperty('--py', (ny * 10).toFixed(1) + 'px');
      field.setParallaxTarget(nx, ny);
    }
    function onPointerLeave() {
      field.setPointer(null);
      card.style.setProperty('--px', '0px');
      card.style.setProperty('--py', '0px');
      field.setParallaxTarget(0, 0);
    }
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerleave', onPointerLeave);

    // ---------- resize ----------
    var ro = null;
    if (global.ResizeObserver) {
      ro = new ResizeObserver(function () { field.resize(); });
      ro.observe(root);
    } else {
      global.addEventListener('resize', field.resize);
    }

    // ---------- indítás ----------
    playEntrance();

    // ---------- teardown ----------
    function destroy() {
      resizeTimers.forEach(clearTimeout);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
      if (ro) ro.disconnect(); else global.removeEventListener('resize', field.resize);
      field.destroy();
      if (root.parentNode) root.parentNode.removeChild(root);
    }

    return { destroy: destroy, machine: machine, field: field };
  }

  function providerButton(provider, logoSvg, label) {
    return '<button class="btn btn--outline login__provider" data-provider="' + provider + '" type="button">' +
      '<span class="login__logo" data-logo="' + provider + '" aria-hidden="true">' + logoSvg + '</span>' +
      '<span class="login__provider-label">' + label + '</span>' +
    '</button>';
  }

  global.mountLogin = mountLogin;
  // A világfa-jel glyphje kívülről is elérhető: az app fejléce UGYANEZT rajzolja,
  // ezért hihető a belépés utáni shared-element átúszás (app.js `runHandoff`).
  global.TALTOS_MARK_SVG = MARK_SVG;
})(window);
