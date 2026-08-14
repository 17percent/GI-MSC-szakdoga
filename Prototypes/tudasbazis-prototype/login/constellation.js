/* constellation.js — élő tudásgráf-háttér (Canvas 2D). Önálló modul.
 *
 * Csomópontok lassan sodródnak, közeli párokat halvány él köt össze, időnként
 * fényimpulzus fut végig egy élen. A kurzor közelében a pontok felragyognak és
 * vékony vonal húzódik hozzájuk. `converge` módban a mező a canvas közepe (kártya)
 * felé húz; `ascend` felfelé söpör; `settle` elcsendesedik.
 *
 * Nem tud az authról; a saját <canvas>-án kívül nem módosít DOM-ot. A színeket a
 * design tokenekből olvassa (getComputedStyle), így témával EGYÜTT vált.
 *
 * Publikus API (a kézirat 4. pontja szerint):
 *   createConstellation(canvasEl, { intensity, reducedMotion })
 *     .start() .stop() .setMode(m) .setPointer(x,y) .setParallaxTarget(nx,ny)
 *     .resize() .refreshColors() .pulseToward(x,y) .destroy()
 *
 * Teljesítmény: egyetlen rAF, particle-pool (nincs per-frame allokáció), DPR sapka 2,
 * `visibilitychange`-re megáll.
 */
(function (global) {
  'use strict';

  var INTENSITY = {
    calm:     { edge: 120, cursor: 130, maxEdges: 4, cursorLines: 3, pulseMin: 3.5, pulseMax: 5.5, alpha: 0.55 },
    balanced: { edge: 130, cursor: 160, maxEdges: 5, cursorLines: 4, pulseMin: 2.5, pulseMax: 4.0, alpha: 0.70 },
    vivid:    { edge: 150, cursor: 190, maxEdges: 6, cursorLines: 5, pulseMin: 1.6, pulseMax: 2.8, alpha: 0.85 }
  };

  function createConstellation(canvas, options) {
    options = options || {};
    var cfg = INTENSITY[options.intensity] || INTENSITY.balanced;
    var reduced = !!options.reducedMotion;

    var ctx = canvas.getContext('2d');
    var dpr = 1, W = 0, H = 0;                 // CSS-pixel méret (W,H), a ctx DPR-re skálázva

    // --- particle-pool: előre lefoglalt párhuzamos tömbök (nincs frame-allokáció) ---
    var MAX = 96;
    var px = new Float32Array(MAX), py = new Float32Array(MAX);
    var vx = new Float32Array(MAX), vy = new Float32Array(MAX);
    var bucket = new Uint8Array(MAX);          // 0=primary,1=secondary,2=accent
    var nAlpha = new Float32Array(MAX);        // csomópont-alfa 0.5–0.85
    var count = 0;

    // szomszéd-cache a kurzorvonalakhoz (előre lefoglalt)
    var nearIdx = new Int16Array(16);
    var nearDist = new Float32Array(16);
    var degCount = new Uint8Array(MAX);        // él-fokszám élenként (per-frame újrahasznált, nincs allokáció)

    // impulzusok (fény egy élen végig): kis fix méretű pool
    var PULSE_MAX = 4;
    var pulses = [];
    for (var i = 0; i < PULSE_MAX; i++) pulses.push({ active: false, a: 0, b: 0, t: 0, dur: 0, toward: false, tx: 0, ty: 0 });
    var nextPulseIn = rand(cfg.pulseMin, cfg.pulseMax);

    // színek (tokenekből olvasva)
    var col = { primary: '#1F5C4C', secondary: '#29528C', accent: '#C9861A', edge: 'rgba(0,0,0,.1)', edgeRGB: [120, 120, 120] };

    // állapot
    var mode = 'idle';                         // idle | converge | ascend | settle
    var brightness = 1;                        // cél-fényerő (mód szerint), simítva
    var brightNow = 1;
    var pointer = { x: null, y: null };
    var parallax = { x: 0, y: 0, cx: 0, cy: 0 }; // cél (x,y) és simított (cx,cy) −1..1
    var ascendY = 0;                           // felfelé söprő fénysáv pozíciója (0..1), −1 = inaktív
    var raf = 0, running = false, lastT = 0;

    // ---------- segédek ----------
    function rand(a, b) { return a + Math.random() * (b - a); }
    function readVar(name, fallback) {
      var v = getComputedStyle(canvas).getPropertyValue(name).trim();
      return v || fallback;
    }
    // "#rrggbb" vagy "rgb()/rgba()" → [r,g,b]
    function toRGB(str) {
      str = (str || '').trim();
      if (str.charAt(0) === '#') {
        if (str.length === 4) {
          return [parseInt(str[1] + str[1], 16), parseInt(str[2] + str[2], 16), parseInt(str[3] + str[3], 16)];
        }
        return [parseInt(str.slice(1, 3), 16), parseInt(str.slice(3, 5), 16), parseInt(str.slice(5, 7), 16)];
      }
      var m = str.match(/(\d+(?:\.\d+)?)/g);
      if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
      return [128, 128, 128];
    }

    function refreshColors() {
      col.primary = readVar('--primary', '#1F5C4C');
      col.secondary = readVar('--secondary', '#29528C');
      col.accent = readVar('--accent', '#C9861A');
      col.edgeRGB = toRGB(readVar('--border-strong', '#BFB7A6'));
      col.primaryRGB = toRGB(col.primary);
      col.secondaryRGB = toRGB(col.secondary);
      col.accentRGB = toRGB(col.accent);
      if (reduced && !running) drawStatic();
    }

    function bucketRGB(b) {
      return b === 0 ? col.primaryRGB : b === 1 ? col.secondaryRGB : col.accentRGB;
    }

    // ---------- méret + populáció ----------
    function resize() {
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      var r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var isMobile = W < 640;
      var target = Math.min(isMobile ? 40 : 90, Math.floor((W * H) / 15000));
      target = Math.max(12, Math.min(MAX, target));
      populate(target);
      if (reduced) drawStatic();
    }

    function populate(target) {
      // meglévő pontokat megtartjuk, csak a különbséget rendezzük
      if (target > count) {
        for (var i = count; i < target; i++) {
          px[i] = Math.random() * W;
          py[i] = Math.random() * H;
          var ang = Math.random() * Math.PI * 2;
          var sp = rand(8, 14);                // px/s
          vx[i] = Math.cos(ang) * sp;
          vy[i] = Math.sin(ang) * sp;
          var r = Math.random();
          bucket[i] = r < 0.6 ? 0 : r < 0.9 ? 1 : 2;   // 60% primary, 30% secondary, 10% accent
          nAlpha[i] = rand(0.5, 0.85);
        }
      }
      count = target;
    }

    // ---------- fizika + rajz ----------
    function step(dtMs) {
      var dt = Math.min(dtMs, 50) / 1000;      // s; nagy ugrás (háttérfül) sapkázva

      // mód-célok
      var attract = 0, edgeBoost = 1, drift = 1;
      if (mode === 'converge') { attract = 26; edgeBoost = 1.4; }
      else if (mode === 'ascend') { attract = 0; drift = 1; }
      else if (mode === 'settle') { attract = 0; edgeBoost = 0.85; }
      var targetBright = mode === 'settle' ? 0.55 : mode === 'converge' ? 1.12 : 1;
      brightness = targetBright;
      brightNow += (brightness - brightNow) * Math.min(1, dt * 6);

      // parallax simítás
      parallax.cx += (parallax.x - parallax.cx) * Math.min(1, dt * 4);
      parallax.cy += (parallax.y - parallax.cy) * Math.min(1, dt * 4);
      var offX = parallax.cx * 6, offY = parallax.cy * 6;   // csomópont-eltolás ±6 px

      var cx = W / 2, cy = H / 2;

      for (var i = 0; i < count; i++) {
        // sodródás
        px[i] += vx[i] * dt;
        py[i] += vy[i] * dt;

        // converge: gyenge vonzás a közép felé
        if (attract) {
          var dxc = cx - px[i], dyc = cy - py[i];
          var dc = Math.sqrt(dxc * dxc + dyc * dyc) || 1;
          vx[i] += (dxc / dc) * attract * dt;
          vy[i] += (dyc / dc) * attract * dt;
        }
        // ascend: enyhe felfelé drift
        if (mode === 'ascend') vy[i] -= 10 * dt;

        // sebesség-csillapítás, hogy ne szaladjon el converge/ascend alatt
        if (attract || mode === 'ascend') { vx[i] *= 0.985; vy[i] *= 0.985; }

        // pattanó szélek (tórusz helyett visszafordítás, hogy ne „villódzzon" be/ki)
        if (px[i] < 0) { px[i] = 0; vx[i] = Math.abs(vx[i]); }
        else if (px[i] > W) { px[i] = W; vx[i] = -Math.abs(vx[i]); }
        if (py[i] < 0) { py[i] = 0; vy[i] = Math.abs(vy[i]); }
        else if (py[i] > H) { py[i] = H; vy[i] = -Math.abs(vy[i]); }
      }

      // impulzus-ütemezés
      nextPulseIn -= dt;
      if (nextPulseIn <= 0 && count > 1) {
        spawnPulse();
        nextPulseIn = rand(cfg.pulseMin, cfg.pulseMax);
      }
      for (var p = 0; p < pulses.length; p++) {
        if (pulses[p].active) {
          pulses[p].t += dt / pulses[p].dur;
          if (pulses[p].t >= 1) pulses[p].active = false;
        }
      }

      // ascend fénysáv
      if (mode === 'ascend') {
        if (ascendY < 0) ascendY = 1;
        ascendY -= dt * 0.9;                   // alulról fölfelé
        if (ascendY < -0.2) ascendY = 1;
      } else {
        ascendY = -1;
      }

      draw(offX, offY);
    }

    function spawnPulse() {
      var slot = null;
      for (var i = 0; i < pulses.length; i++) if (!pulses[i].active) { slot = pulses[i]; break; }
      if (!slot) return;
      var a = (Math.random() * count) | 0;
      // válasszunk egy közeli b-t
      var best = -1, bestD = cfg.edge * cfg.edge;
      for (var j = 0; j < count; j++) {
        if (j === a) continue;
        var dx = px[a] - px[j], dy = py[a] - py[j];
        var d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = j; }
      }
      if (best < 0) return;
      slot.active = true; slot.a = a; slot.b = best; slot.t = 0;
      slot.dur = rand(0.7, 1.2);
      slot.toward = false;
    }

    // opcionális: fényhullám egy pont felé (a gomb közeli élein) — a view hívhatja
    function pulseToward(x, y) {
      var slot = null;
      for (var i = 0; i < pulses.length; i++) if (!pulses[i].active) { slot = pulses[i]; break; }
      if (!slot) return;
      // legközelebbi csomópont a célhoz
      var best = -1, bestD = Infinity;
      for (var j = 0; j < count; j++) {
        var dx = px[j] - x, dy = py[j] - y, d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = j; }
      }
      if (best < 0) return;
      slot.active = true; slot.a = best; slot.b = best; slot.t = 0; slot.dur = 0.6;
      slot.toward = true; slot.tx = x; slot.ty = y;
    }

    function draw(offX, offY) {
      ctx.clearRect(0, 0, W, H);
      var edge2 = cfg.edge * cfg.edge;
      var er = col.edgeRGB[0], eg = col.edgeRGB[1], eb = col.edgeRGB[2];
      for (var z = 0; z < count; z++) degCount[z] = 0;   // újrahasznált puffer nullázása

      // --- élek ---
      ctx.lineWidth = 1;
      for (var i = 0; i < count; i++) {
        if (degCount[i] >= cfg.maxEdges) continue;
        var xi = px[i] + offX, yi = py[i] + offY;
        for (var j = i + 1; j < count; j++) {
          if (degCount[j] >= cfg.maxEdges) continue;
          var dx = px[i] - px[j], dy = py[i] - py[j];
          var d2 = dx * dx + dy * dy;
          if (d2 > edge2) continue;
          var t = 1 - Math.sqrt(d2) / cfg.edge;            // 0..1 közelség
          var a = 0.05 + t * 0.22 * brightNow;
          ctx.strokeStyle = 'rgba(' + er + ',' + eg + ',' + eb + ',' + a.toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(xi, yi);
          ctx.lineTo(px[j] + offX, py[j] + offY);
          ctx.stroke();
          degCount[i]++; degCount[j]++;
          if (degCount[i] >= cfg.maxEdges) break;
        }
      }

      // --- kurzor-reakció ---
      if (pointer.x != null && !reduced) {
        var cr = cfg.cursor, cr2 = cr * cr, nn = 0;
        for (var k = 0; k < count; k++) {
          var ddx = px[k] + offX - pointer.x, ddy = py[k] + offY - pointer.y;
          var dd2 = ddx * ddx + ddy * ddy;
          if (dd2 <= cr2 && nn < nearIdx.length) { nearIdx[nn] = k; nearDist[nn] = dd2; nn++; }
        }
        // legközelebbi néhányhoz vonal
        for (var s = 0; s < nn; s++) {
          var lim = Math.min(cfg.cursorLines, nn);
          // egyszerű részleges kiválasztás: ha ez a pont a legközelebbi `lim` egyike
          var rank = 0;
          for (var q = 0; q < nn; q++) if (nearDist[q] < nearDist[s]) rank++;
          if (rank < lim) {
            var prox = 1 - Math.sqrt(nearDist[s]) / cr;
            ctx.strokeStyle = 'rgba(' + col.accentRGB[0] + ',' + col.accentRGB[1] + ',' + col.accentRGB[2] + ',' + (prox * 0.5).toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(pointer.x, pointer.y);
            ctx.lineTo(px[nearIdx[s]] + offX, py[nearIdx[s]] + offY);
            ctx.stroke();
          }
        }
      }

      // --- csomópontok ---
      for (var n = 0; n < count; n++) {
        var rgb = bucketRGB(bucket[n]);
        var glow = 1;
        if (pointer.x != null && !reduced) {
          var gx = px[n] + offX - pointer.x, gy = py[n] + offY - pointer.y;
          var gd = Math.sqrt(gx * gx + gy * gy);
          if (gd < cfg.cursor) glow = 1 + (1 - gd / cfg.cursor) * 1.6;
        }
        var alpha = Math.min(1, nAlpha[n] * brightNow * glow * (cfg.alpha / 0.7));
        var rr = 1.4 * (glow > 1.2 ? 1.5 : 1);
        ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(px[n] + offX, py[n] + offY, rr, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- impulzusok (fény az élen) ---
      for (var pp = 0; pp < pulses.length; pp++) {
        var P = pulses[pp];
        if (!P.active) continue;
        var ax = px[P.a] + offX, ay = py[P.a] + offY;
        var bx, by;
        if (P.toward) { bx = P.tx; by = P.ty; } else { bx = px[P.b] + offX; by = py[P.b] + offY; }
        var t = P.t;
        var lx = ax + (bx - ax) * t, ly = ay + (by - ay) * t;
        var fade = Math.sin(t * Math.PI);      // be-ki halványulás
        var ar = col.accentRGB;
        ctx.fillStyle = 'rgba(' + ar[0] + ',' + ar[1] + ',' + ar[2] + ',' + (fade * 0.9).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      // --- ascend fénysáv ---
      if (mode === 'ascend' && ascendY >= 0) {
        var bandY = ascendY * H;
        var grad = ctx.createLinearGradient(0, bandY - 40, 0, bandY + 40);
        var ar2 = col.accentRGB;
        grad.addColorStop(0, 'rgba(' + ar2[0] + ',' + ar2[1] + ',' + ar2[2] + ',0)');
        grad.addColorStop(0.5, 'rgba(' + ar2[0] + ',' + ar2[1] + ',' + ar2[2] + ',0.14)');
        grad.addColorStop(1, 'rgba(' + ar2[0] + ',' + ar2[1] + ',' + ar2[2] + ',0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, bandY - 40, W, 80);
      }
    }

    // egyetlen statikus képkocka (reduced-motion): sodródás/impulzus/kurzor nélkül
    function drawStatic() {
      brightNow = mode === 'settle' ? 0.55 : 1;
      draw(0, 0);
    }

    // ---------- rAF ciklus ----------
    function frame(ts) {
      if (!running) return;
      if (!lastT) lastT = ts;
      var dt = ts - lastT;
      lastT = ts;
      step(dt);
      raf = global.requestAnimationFrame(frame);
    }

    function start() {
      if (reduced) { drawStatic(); return; }   // reduced: nincs ciklus, egy statikus kép
      if (running) return;
      running = true; lastT = 0;
      raf = global.requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      if (raf) global.cancelAnimationFrame(raf);
      raf = 0;
    }

    function setMode(m) {
      mode = m;
      if (reduced) drawStatic();               // azonnali újrarajzolás, animáció nélkül
    }
    function setPointer(x, y) {
      if (x == null) { pointer.x = pointer.y = null; return; }
      pointer.x = x; pointer.y = y;
    }
    function setParallaxTarget(nx, ny) {
      if (reduced) return;
      parallax.x = Math.max(-1, Math.min(1, nx));
      parallax.y = Math.max(-1, Math.min(1, ny));
    }

    // ---------- életciklus ----------
    function onVisibility() {
      if (document.hidden) stop();
      else if (!reduced) start();
    }
    document.addEventListener('visibilitychange', onVisibility);

    function destroy() {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    }

    // ---------- állapot-átadás (bejelentkező → kezdőoldal folytonosság) ----------
    // A pontokat NORMALIZÁLT (0..1) koordinátában adjuk át, hogy más méretű
    // canvasre is átvihető legyen: így a csillagkép az átmenetnél nem
    // „újrakeveredik", hanem folytatódik ott, ahol a bejelentkezőn abbahagyta.
    function getSnapshot() {
      var out = [];
      for (var i = 0; i < count; i++) {
        out.push({
          nx: W ? px[i] / W : 0, ny: H ? py[i] / H : 0,
          vx: vx[i], vy: vy[i], b: bucket[i], a: nAlpha[i]
        });
      }
      return { nodes: out, mode: mode };
    }

    function applySnapshot(snap) {
      if (!snap || !snap.nodes || !snap.nodes.length) return;
      resize();                              // W/H és a célszám legyen aktuális
      var n = Math.min(snap.nodes.length, count);
      for (var i = 0; i < n; i++) {
        var s = snap.nodes[i];
        px[i] = s.nx * W; py[i] = s.ny * H;
        vx[i] = s.vx; vy[i] = s.vy;
        bucket[i] = s.b; nAlpha[i] = s.a;
      }
      // a maradék (ha a új canvas több pontot bír) marad a resize-ból származó
      // véletlen kitöltés — a szem a folytonos magot látja
      if (reduced) drawStatic();
    }

    // init
    refreshColors();
    resize();

    return {
      start: start, stop: stop, setMode: setMode, setPointer: setPointer,
      setParallaxTarget: setParallaxTarget, resize: resize, refreshColors: refreshColors,
      pulseToward: pulseToward, getSnapshot: getSnapshot, applySnapshot: applySnapshot,
      destroy: destroy
    };
  }

  global.createConstellation = createConstellation;
})(window);
