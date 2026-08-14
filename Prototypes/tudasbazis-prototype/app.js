// PROTOTÍPUS — tudásbázis mock, vanilla JS, hash-routing, memóriában tartott állapot.
// A "backend" (Git commit, queue, index) itt csak szimuláció: mentés = új verzió a
// versions tömbben + esemény a naplóban.

'use strict';

// ================= Állapot =================

const state = {
  currentUser: null,
  users: SEED_USERS.map(u => ({ ...u })),
  allowlist: [...SEED_ALLOWLIST],
  docs: SEED_DOCS.map(d => ({ ...d, categories: [...d.categories], versions: d.versions.map(x => ({ ...x })) })),
  categories: SEED_CATEGORIES.map(c => ({ ...c })),
  comments: SEED_COMMENTS.map(c => ({ ...c })),
  events: SEED_EVENTS.map(e => ({ ...e })),
  favorites: Object.fromEntries(Object.entries(SEED_FAVORITES).map(([k, v]) => [k, new Set(v)])),
  locks: {},          // docId -> { userId, acquiredAt, lastHeartbeat }
  docTab: {},         // docId -> 'tartalom' | 'feed' | 'verziok'
  sort: { feed: 'asc', versions: 'desc' }, // rendezési irány fülönként
  diffSelection: {},  // docId -> [hash, hash]
  loginError: null,
};

const LOCK_TTL = 2 * MIN; // heartbeat nélkül 2 perc után lejár (D7)
const STATUSES = ['draft', 'review', 'tesztelt', 'publikált'];

// ================= Segédek =================

const $ = sel => document.querySelector(sel);

function uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2)); }
function shortHash() { return Math.random().toString(16).slice(2, 9); }

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function user(id) { return state.users.find(u => u.id === id) || { name: '?', initials: '?', avatar: 4 }; }
function doc(id) { return state.docs.find(d => d.id === id); }
function head(d) { return d.versions[d.versions.length - 1]; }

function fmtDate(ts) {
  const diff = Date.now() - ts;
  if (diff < HOUR) return Math.max(1, Math.round(diff / MIN)) + ' perce';
  if (diff < DAY) return Math.round(diff / HOUR) + ' órája';
  if (diff < 14 * DAY) return Math.round(diff / DAY) + ' napja';
  return new Date(ts).toLocaleDateString('hu-HU');
}

function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Avatár: a háttérszín a design system avatár-palettájából jön (tokens.css
// --avatar-1..4), nem inline hexből — így a téma és a rendszer kézben tartja.
function avatarHtml(u, small) {
  return `<span class="avatar avatar--${u.avatar || 4}${small ? ' avatar--sm' : ''}">${esc(u.initials)}</span>`;
}

function isFav(docId) {
  const set = state.favorites[state.currentUser.id];
  return set ? set.has(docId) : false;
}

function logEvent(docId, type, details) {
  state.events.push({ id: uid(), docId, type, userId: state.currentUser.id, ts: Date.now(), details: details || {} });
}

// ================= Toast + modal =================

// ================= Téma (dark mode) =================
// Alapértelmezés: rendszer-preferencia; a kézi váltást localStorage őrzi.
// (Ez az egyetlen perzisztált állapot — a tartalmi adat memóriában marad.)

function currentTheme() { return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  // rövid, komponált áttűnés a két paletta között
  document.documentElement.classList.add('theme-anim');
  document.documentElement.dataset.theme = next;
  localStorage.setItem('tb-theme', next);
  setTimeout(() => document.documentElement.classList.remove('theme-anim'), 300);
  render();
  // A Canvas nem CSS: a térkép és az ambient mező újraolvassa a token-színeket,
  // így a háttér is témával együtt vált.
  if (atlasHandle) atlasHandle.refreshColors();
}

function themeToggleHtml() {
  const dark = currentTheme() === 'dark';
  return `<button class="btn icon-btn" onclick="toggleTheme()"
    title="${dark ? 'Váltás világos módra' : 'Váltás sötét módra'}"
    aria-label="${dark ? 'Váltás világos módra' : 'Váltás sötét módra'}">${dark ? '☀️' : '🌙'}</button>`;
}

function toast(msg, isError) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  // kilépés: fade+slide lefelé, az eltávolítás csak az animáció után
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

function openModal(html) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`;
  upgradeTitles();
}
function closeModal() {
  const bd = document.querySelector('#modal-root .modal-backdrop');
  if (!bd || bd.classList.contains('closing')) return;
  bd.classList.add('closing');
  setTimeout(() => { $('#modal-root').innerHTML = ''; }, 190);
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); hideTip(); } });

// ================= Tooltip (fade+slide; hover: 700 ms késleltetés, fókusz: azonnal) =================
// A natív title-attribútumok minden render után data-tip-re konvertálódnak,
// így egyetlen lebegő, animált tooltip-elem szolgál ki mindent.

let tipTimer = null, tipTarget = null;

function upgradeTitles() {
  document.querySelectorAll('[title]').forEach(el => {
    el.dataset.tip = el.getAttribute('title');
    el.removeAttribute('title');
  });
}

function tipEl() {
  let t = document.getElementById('tooltip');
  if (!t) { t = document.createElement('div'); t.id = 'tooltip'; document.body.appendChild(t); }
  return t;
}

function showTip(target) {
  const t = tipEl();
  t.textContent = target.dataset.tip;
  const r = target.getBoundingClientRect();
  t.style.left = '0px'; t.style.top = '0px'; // mérés előtt alaphelyzet
  const tw = t.offsetWidth, th = t.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  x = Math.max(8, Math.min(x, window.innerWidth - tw - 8));
  let y = r.top - th - 8;
  if (y < 8) y = r.bottom + 8; // ha fent nem fér el, alá kerül
  t.style.left = x + 'px'; t.style.top = y + 'px';
  t.classList.add('show');
  tipTarget = target;
}

function hideTip() {
  clearTimeout(tipTimer);
  tipTarget = null;
  const t = document.getElementById('tooltip');
  if (t) t.classList.remove('show');
}

document.addEventListener('mouseover', e => {
  const tgt = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (!tgt || tgt === tipTarget) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => showTip(tgt), 700);
});
document.addEventListener('mouseout', e => {
  const tgt = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (tgt && !(e.relatedTarget && tgt.contains(e.relatedTarget))) hideTip();
});
document.addEventListener('focusin', e => {
  const tgt = e.target.closest ? e.target.closest('[data-tip]') : null;
  if (tgt) { clearTimeout(tipTimer); showTip(tgt); } // fókusznál nincs késleltetés
});
document.addEventListener('focusout', hideTip);
document.addEventListener('click', hideTip, true);

// ================= Markdown renderelő (leegyszerűsített, sanitize-elvű) =================
// D16 szellemében: a nyers HTML escape-elve kerül be, kép csak /assets/ útvonalról.

function mdInline(s) {
  let out = esc(s);
  // kép: csak belső assets-útvonal engedélyezett (D16) — külső URL blokkolva
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, src) =>
    src.startsWith('/assets/')
      ? `<img src="${src}" alt="${alt}">`
      : `<span class="img-blocked-note">🚫 külső kép blokkolva: ${esc(src)}</span>`);
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" onclick="return false">$1</a>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

function renderMarkdown(md) {
  const lines = md.split('\n');
  const out = [];
  let i = 0, listBuf = null, listOrdered = false, tableBuf = null;

  const flushList = () => {
    if (listBuf) { out.push(`<${listOrdered ? 'ol' : 'ul'}>${listBuf.map(li => `<li>${mdInline(li)}</li>`).join('')}</${listOrdered ? 'ol' : 'ul'}>`); listBuf = null; }
  };
  const flushTable = () => {
    if (tableBuf && tableBuf.length) {
      const rows = tableBuf.filter(r => !/^\s*\|?[\s:|-]+\|?\s*$/.test(r));
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      let html = '<table>';
      rows.forEach((r, idx) => {
        const tag = idx === 0 ? 'th' : 'td';
        html += '<tr>' + cells(r).map(c => `<${tag}>${mdInline(c)}</${tag}>`).join('') + '</tr>';
      });
      out.push(html + '</table>');
      tableBuf = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      flushList(); flushTable();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      i++; continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) { flushList(); flushTable(); out.push(`<h${h[1].length}>${mdInline(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {
      flushTable();
      if (!listBuf || listOrdered) { flushList(); listBuf = []; listOrdered = false; }
      listBuf.push(line.replace(/^\s*[-*]\s+/, '')); i++; continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushTable();
      if (!listBuf || !listOrdered) { flushList(); listBuf = []; listOrdered = true; }
      listBuf.push(line.replace(/^\s*\d+\.\s+/, '')); i++; continue;
    }

    if (/^\s*\|/.test(line)) { flushList(); if (!tableBuf) tableBuf = []; tableBuf.push(line); i++; continue; }

    if (/^\s*>\s?/.test(line)) {
      flushList(); flushTable();
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${buf.map(mdInline).join('<br>')}</blockquote>`);
      continue;
    }

    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushList(); flushTable(); out.push('<hr>'); i++; continue; }
    if (line.trim() === '') { flushList(); flushTable(); i++; continue; }

    flushList(); flushTable();
    out.push(`<p>${mdInline(line)}</p>`);
    i++;
  }
  flushList(); flushTable();
  return out.join('\n');
}

// ================= Sor-alapú diff (LCS) =================

function diffLines(aText, bText) {
  const a = aText.split('\n'), b = bText.split('\n');
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const res = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { res.push({ t: 'ctx', s: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { res.push({ t: 'del', s: a[i] }); i++; }
    else { res.push({ t: 'add', s: b[j] }); j++; }
  }
  while (i < n) { res.push({ t: 'del', s: a[i++] }); }
  while (j < m) { res.push({ t: 'add', s: b[j++] }); }
  return res;
}

// ================= Lock (D7 — leegyszerűsítve) =================

function lockOf(docId) {
  const l = state.locks[docId];
  if (!l) return null;
  if (Date.now() - l.lastHeartbeat > LOCK_TTL) {
    delete state.locks[docId];
    logEvent(docId, 'lock_expired', { user: user(l.userId).name });
    return null;
  }
  return l;
}

function acquireLock(docId) {
  const l = lockOf(docId);
  if (l && l.userId !== state.currentUser.id) return l; // foglalt — a birtokost adjuk vissza
  state.locks[docId] = { userId: state.currentUser.id, acquiredAt: Date.now(), lastHeartbeat: Date.now() };
  return null;
}

function releaseLock(docId) {
  const l = state.locks[docId];
  if (l && l.userId === state.currentUser.id) delete state.locks[docId];
}

// Szerkesztés közben "heartbeat" — a prototípusban egy interval frissíti
let heartbeatTimer = null;
function startHeartbeat(docId) {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    const l = state.locks[docId];
    if (l && l.userId === state.currentUser.id) l.lastHeartbeat = Date.now();
  }, 30 * 1000);
}
function stopHeartbeat() { if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; } }

// ================= Frontmatter (nyers .md-hez) =================

function frontmatter(d) {
  return [
    '---',
    `id: ${d.id}`,
    `status: ${d.status}`,
    `owner: ${user(d.ownerId).email}`,
    `iteration: ${d.iteration}`,
    `categories: [${d.categories.join(', ')}]`,
    `is_template: ${d.isTemplate}`,
    '---',
  ].join('\n');
}

// ================= Router =================

function navigate(hash) { location.hash = hash; }
window.addEventListener('hashchange', render);

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  return { name: parts[0] || 'docs', arg: parts[1] || null, sub: parts[2] || null };
}

// ================= Fő render =================

// Az app-váz EGYSZER épül fel és utána megmarad: így a kezdőoldal élő térképe
// nem indul újra minden állapotváltásnál (kedvencezés, userváltás, témaváltás).
// A route-tartalom a topbar utáni testben cserélődik.

function render() {
  stopHeartbeat();
  if (!state.currentUser) { renderLogin(); return; }
  if (!handoffActive) teardownLogin();       // handoff közben a login még átúszik

  const r = route();
  ensureShell();
  updateChrome(r);

  // Kezdőoldal = „Élő Atlasz": saját életciklusa van, nem innerHTML-ből él
  if (r.name === 'docs') {
    const h = pendingHandoff; pendingHandoff = null;
    mountOrRefreshAtlas(h);
    afterRender('docs');
    return;
  }

  teardownAtlas();

  let bodyHtml = '';
  switch (r.name) {
    case 'doc':        { const d = doc(r.arg); if (!d) { navigate('docs'); return; } bodyHtml = viewDoc(d); break; }
    case 'edit':       { const d = doc(r.arg); if (!d) { navigate('docs'); return; } bodyHtml = viewEdit(d); break; }
    case 'new':        bodyHtml = viewNew(); break;
    case 'categories': bodyHtml = viewCategories(); break;
    case 'archive':    bodyHtml = viewArchive(); break;
    case 'audit':      bodyHtml = viewAudit(); break;
    default:           navigate('docs'); return;
  }
  setRouteBody(bodyHtml);
  afterRender(r.name + '/' + (r.arg || '') + '/' + (r.arg ? state.docTab[r.arg] || '' : ''));
}

const ROUTE_TITLES = {
  docs: 'Tudástár', new: 'Új dokumentum', categories: 'Kategóriák',
  archive: 'Archívum', audit: 'Audit-napló', doc: '', edit: ''
};

function ensureShell() {
  if ($('.layout')) return;
  $('#app').innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><span class="logo" data-mark></span> Táltos</div>
        <nav id="nav-slot" aria-label="Fő navigáció"></nav>
        <div class="spacer"></div>
        <div class="git-status">
          <span class="dot">●</span> Git szinkron: naprakész<br>
          push-lemaradás: 0 commit<br>
          (szimulált /status — D12)
        </div>
      </aside>
      <main class="main">
        <div class="topbar">
          <h1 id="route-title"></h1>
          <div class="userchip" id="userchip" title="Felhasználóváltás — a lock és a privát kedvencek demójához"></div>
          <span id="theme-slot"></span>
          <button class="btn sm" onclick="logout()">Kijelentkezés</button>
        </div>
      </main>
    </div>`;
  // A világfa-jel UGYANAZ a glyph, mint a bejelentkezőn — ez teszi hihetővé a
  // shared-element átúszást a belépés után.
  const logo = $('.brand .logo');
  if (logo) logo.innerHTML = window.TALTOS_MARK_SVG || '';
}

function updateChrome(r) {
  const cu = state.currentUser;
  const titleEl = $('#route-title');
  if (titleEl) titleEl.textContent = ROUTE_TITLES[r.name] || '';

  const docsActive = r.name === 'docs' || r.name === 'doc' || r.name === 'edit';
  $('#nav-slot').innerHTML =
    navItem('docs', '📄', 'Tudástár', docsActive) +
    navItem('new', '＋', 'Új dokumentum', r.name === 'new') +
    navItem('categories', '🏷️', 'Kategóriák', r.name === 'categories') +
    navItem('archive', '🗄️', 'Archívum', r.name === 'archive') +
    navItem('audit', '📜', 'Audit-napló', r.name === 'audit');

  $('#userchip').innerHTML = `
    ${avatarHtml(cu)}
    <select onchange="switchUser(this.value)" aria-label="Aktív felhasználó">
      ${state.users.map(u => `<option value="${u.id}" ${u.id === cu.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
    </select>`;
  $('#theme-slot').innerHTML = themeToggleHtml();
}

// A route-test = a `.main` topbar utáni gyermekei (így a meglévő `.scroll-area`
// szerződés — csak a tartalom görget — érvényben marad).
function setRouteBody(html) {
  const main = $('.main');
  if (!main) return;
  while (main.children.length > 1) main.removeChild(main.lastChild);
  if (html) main.insertAdjacentHTML('beforeend', html);
}

// Nézet-belépő animáció: csak route- vagy fülváltáskor fut, szűrés/gépelés közben nem.
let lastViewKey = null;
function afterRender(viewKey) {
  if (viewKey !== lastViewKey) {
    lastViewKey = viewKey;
    const target = $('.scroll-area');
    if (target) target.classList.add('view-enter');
  }
  upgradeTitles();
  hideTip();
}

function navItem(hash, ico, label, active) {
  return `<a class="nav-item ${active ? 'active' : ''}" href="#/${hash}"><span class="ico">${ico}</span>${label}</a>`;
}

// ================= Kezdőoldal — „Élő Atlasz" =================

let atlasHandle = null;

function atlasData() {
  const favSet = state.favorites[state.currentUser.id] || new Set();
  return {
    docs: activeDocs().map(d => {
      const h = head(d);
      const authorIds = [];
      d.versions.forEach(v => { if (authorIds.indexOf(v.authorId) < 0) authorIds.push(v.authorId); });
      return {
        id: d.id, title: d.title, status: d.status, isTemplate: !!d.isTemplate,
        categories: d.categories.slice(), ownerId: d.ownerId, authorIds,
        iteration: d.iteration, updatedAt: h.ts,
        text: h.content                     // a keresés címben ÉS tartalomban is találjon
      };
    }),
    categories: state.categories.map(c => ({ id: c.id, name: c.name, description: c.description })),
    users: state.users.map(u => ({ id: u.id, name: u.name })),
    currentUserId: state.currentUser.id,
    favoriteIds: Array.from(favSet),
    statuses: STATUSES
  };
}

function atlasHelpers() {
  return {
    esc,
    fmtDate,
    userName: (id) => user(id).name,
    isFav: (docId) => isFav(docId),
    lockedByName: (docId) => { const l = lockOf(docId); return l ? esc(user(l.userId).name) : ''; },
    snippetHtml: (docId, q) => { const d = doc(docId); return d ? snippet(d, q) : ''; }
  };
}

function mountOrRefreshAtlas(handoff) {
  const main = $('.main');
  main.classList.add('main--atlas');
  if (atlasHandle) { atlasHandle.refresh(atlasData()); return; }
  setRouteBody('');
  atlasHandle = mountAtlas(main, {
    data: atlasData(),
    helpers: atlasHelpers(),
    handoff: handoff || null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    callbacks: {
      onOpenDoc: (id) => navigate('doc/' + id),
      onToggleFav: (id) => toggleFav(id),
      onNew: () => navigate('new')
    }
  });
}

function teardownAtlas() {
  if (atlasHandle) { atlasHandle.destroy(); atlasHandle = null; }
  const main = $('.main');
  if (main) main.classList.remove('main--atlas');
}

// ================= Login (Táltos reaktív bejelentkező) =================
// A régi mock-identitásválasztót a login/ modulok (constellation + FSM + view)
// váltják fel. A „pure to handoff" döntés miatt itt két provider-gomb van
// (Google + Microsoft); mindkettő a config mockUserId identitására lép be. A
// több-userességet és a userváltást az app fejléce fedi (switchUser). A valódi
// OAuth-redirect helye a loginView.js `enterRedirecting()`-jében meg van jelölve.

let loginHandle = null;
let pendingHandoff = null;      // a bejelentkezőtől kapott folytonosság-csomag
let handoffActive = false;      // igaz, amíg a login átúszik az appba

// Időzítés/görbe a TOKENEKBŐL — a design-értékeket JS-be sem égetjük be.
function tokenMs(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v) return fallback;
  return v.indexOf('ms') > -1 ? parseFloat(v) : parseFloat(v) * 1000;
}
function tokenEase(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function renderLogin() {
  if (loginHandle) return;                 // már mountolva — ne indítsuk újra a koreográfiát
  stopHeartbeat();
  teardownAtlas();
  const app = $('#app');
  app.innerHTML = '';
  loginHandle = mountLogin(app, {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    defaultUserId: state.users[0] ? state.users[0].id : null,
    onComplete: finishLogin
  });
}

// A belépés befejezése: az app a bejelentkező ALATT épül fel, majd a kettő
// átúszik egymásba (crossfade), és a világfa-jel átrepül a fejléc márkajelébe.
// Így a login és a kezdőoldal között nincs vágás — egy folyamatos mozdulat.
function finishLogin(userId, handoff) {
  const u = state.users.find(x => x.id === userId) || state.users[0];
  state.currentUser = u;
  state.loginError = null;

  const loginEl = document.querySelector('.login');
  if (loginEl) {
    document.body.appendChild(loginEl);      // ki az #app-ból, hogy a render ne törölje
    loginEl.classList.add('login--handoff');
  }

  handoffActive = true;
  pendingHandoff = handoff || null;
  if (location.hash.replace(/^#\/?/, '').split('/')[0] !== 'docs') location.hash = '#/docs';
  render();                                  // az app felépül a bejelentkező alatt
  runHandoff(handoff, loginEl);
}

function runHandoff(handoff, loginEl) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slow = tokenMs('--duration-slow', 400);
  const slower = tokenMs('--duration-slower', 600);
  const grow = tokenEase('--ease-grow', 'cubic-bezier(.22,1,.36,1)');
  const exit = tokenEase('--ease-exit', 'cubic-bezier(.4,0,1,1)');

  const layout = $('.layout');
  if (layout && !reduced) {
    layout.animate([{ opacity: 0 }, { opacity: 1 }], { duration: slow, easing: grow, fill: 'both' });
  }

  const finish = () => { handoffActive = false; teardownLogin(); };
  if (loginEl && !reduced) {
    loginEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: slow, easing: exit, fill: 'both' });
    // setTimeout, nem a WAAPI `finished`: a document-idővonal rejtett fülön befagy
    setTimeout(finish, slow + 40);
  } else {
    finish();
  }

  // SHARED ELEMENT: a jel klónja átrepül a fejléc márkajelébe
  const flying = handoff && handoff.markEl;
  const target = $('.brand .logo');
  if (flying && target && !reduced) {
    const from = flying.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
    const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
    const scale = from.width ? to.width / from.width : 1;
    target.style.opacity = '0';
    const land = () => {
      target.style.opacity = '';
      if (flying.parentNode) flying.parentNode.removeChild(flying);
    };
    flying.animate([
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` }
    ], { duration: slower, easing: grow, fill: 'both' });
    setTimeout(land, slower + 40);
  } else if (flying && flying.parentNode) {
    flying.parentNode.removeChild(flying);
  }
}

function teardownLogin() {
  if (loginHandle) { loginHandle.destroy(); loginHandle = null; }
  const stray = document.querySelector('.login--handoff');
  if (stray && stray.parentNode) stray.parentNode.removeChild(stray);
}

function logout() {
  teardownAtlas();
  state.currentUser = null;
  render();
}

function switchUser(userId) {
  state.currentUser = state.users.find(u => u.id === userId);
  toast(`Aktív felhasználó: ${state.currentUser.name}`);
  render();
}

// ================= Dokumentumlista + keresés (WP5) =================

function activeDocs() { return state.docs.filter(d => !d.deletedAt); }

function snippet(d, q) {
  if (!q) return '';
  const content = head(d).content;
  const idx = norm(content).indexOf(norm(q));
  if (idx < 0) return '';
  const start = Math.max(0, idx - 40);
  const raw = content.slice(start, idx + q.length + 60).replace(/\n/g, ' ');
  const rel = idx - start;
  return `${start > 0 ? '…' : ''}${esc(raw.slice(0, rel))}<mark>${esc(raw.slice(rel, rel + q.length))}</mark>${esc(raw.slice(rel + q.length))}…`;
}

// A korábbi szűrős dokumentumlista helyét az „Élő Atlasz" kezdőoldal vette át
// (home/ modulok). A `snippet()` segéd megmaradt: a keresés snippetjét az
// atlasz is ezzel állítja elő.

function toggleFav(docId) {
  const set = state.favorites[state.currentUser.id] || (state.favorites[state.currentUser.id] = new Set());
  if (set.has(docId)) { set.delete(docId); toast('Eltávolítva a kedvencekből'); }
  else { set.add(docId); toast('Kedvencekhez adva (privát — D18: esemény nem naplózódik)'); }
  render();
}

// ================= Dokumentum nézet (tartalom / feed / verziók) =================

function viewDoc(d) {
  const tab = state.docTab[d.id] || 'tartalom';
  const h = head(d);
  const lock = lockOf(d.id);
  const lockedByOther = lock && lock.userId !== state.currentUser.id;

  let tabContent = '';
  if (tab === 'tartalom') tabContent = viewDocContent(d);
  else if (tab === 'feed') tabContent = viewFeed(d);
  else tabContent = viewVersions(d);

  return `
    <div class="doc-header">
      <div class="titleline">
        <button class="fav-star fav-star--lg ${isFav(d.id) ? 'on' : ''}" title="Kedvenc (privát)"
                aria-pressed="${isFav(d.id) ? 'true' : 'false'}" onclick="toggleFav('${d.id}')">${isFav(d.id) ? '★' : '☆'}</button>
        <h1>${esc(d.title)}</h1>
        <span class="badge st-${d.status}">${d.status}</span>
        ${d.isTemplate ? '<span class="badge tpl">sablon</span>' : ''}
      </div>
      <div class="pathline">${esc(d.repoPath)} · HEAD: ${h.hash}</div>
    </div>

    ${lockedByOther ? `<div class="lock-note">🔒 <strong>${esc(user(lock.userId).name)}</strong> éppen szerkeszti ezt a dokumentumot
      (lock heartbeat nélkül ${Math.round(LOCK_TTL / MIN)} perc után lejár — D7).</div>` : ''}

    <div class="doc-actions">
      <button class="btn primary" onclick="startEdit('${d.id}')" ${lockedByOther ? 'disabled' : ''}>✏️ Szerkesztés</button>
      <button class="btn" onclick="changeStatusModal('${d.id}')">Státuszváltás</button>
      <button class="btn" onclick="duplicateFrom('${d.id}')">⧉ Duplikálás</button>
      <button class="btn" onclick="copyToClipboard('${d.id}')">📋 Vágólapra</button>
      <button class="btn" onclick="downloadMd('${d.id}')">⬇ .md letöltés</button>
      <button class="btn" onclick="toast('Export: a valóságban szerveroldali pandoc-pipeline (WP14) — a prototípusban nem elérhető')">PDF / DOCX</button>
      <button class="btn danger" onclick="archiveDoc('${d.id}')">🗄️ Archiválás</button>
    </div>

    <div class="tabs">
      ${['tartalom', 'feed', 'verziok'].map(t => `
        <button class="tab ${tab === t ? 'active' : ''}" onclick="setDocTab('${d.id}','${t}')">
          ${t === 'tartalom' ? 'Tartalom' : t === 'feed' ? `Kommentek és események (${feedItems(d.id).length})` : `Verziók (${d.versions.length})`}
        </button>`).join('')}
      ${tab === 'feed' ? sortToggleHtml('feed') : tab === 'verziok' ? sortToggleHtml('versions') : ''}
    </div>
    <div class="scroll-area">${tabContent}</div>`;
}

function setDocTab(docId, tab) { state.docTab[docId] = tab; render(); }

function toggleSort(key) {
  state.sort[key] = state.sort[key] === 'asc' ? 'desc' : 'asc';
  render();
}

function sortToggleHtml(key) {
  const desc = state.sort[key] === 'desc';
  return `<button class="btn sm sort-toggle" onclick="toggleSort('${key}')"
    title="Rendezési irány váltása">${desc ? '↓ legújabb elöl' : '↑ legrégebbi elöl'}</button>`;
}

function viewDocContent(d) {
  return `
    <div class="doc-grid">
      <div class="panel"><div class="panel-body md">${renderMarkdown(head(d).content)}</div></div>
      <div>
        <div class="panel">
          <h3 class="panel-title">Metaadatok</h3>
          <div class="panel-body">
            <table class="meta-table">
              <tr><td>Tulajdonos</td><td>${avatarHtml(user(d.ownerId), 20)} ${esc(user(d.ownerId).name)}</td></tr>
              <tr><td>Státusz</td><td><span class="badge st-${d.status}">${d.status}</span></td></tr>
              <tr><td>Iteráció</td><td>${d.iteration}</td></tr>
              <tr><td>Kategóriák</td><td>${d.categories.map(c => `<span class="badge cat">${esc(c)}</span>`).join(' ') || '—'}</td></tr>
              <tr><td>Verziók</td><td>${d.versions.length} commit</td></tr>
              <tr><td>UUID</td><td class="mono">${d.id}</td></tr>
            </table>
            <div class="frontmatter">${esc(frontmatter(d))}</div>
          </div>
        </div>
      </div>
    </div>`;
}

// ================= Feed: kommentek + rendszeresemények (D9, D20) =================

const EVENT_TEXT = {
  created:         () => 'létrehozta a dokumentumot',
  edited:          ev => `mentette a dokumentumot (commit ${ev.details.commit || '?'})`,
  status_changed:  ev => `státuszt váltott: ${ev.details.from} → ${ev.details.to}`,
  deleted:         ev => `archiválta a dokumentumot${ev.details.reason ? ` („${ev.details.reason}")` : ''}`,
  restored:        () => 'visszaállította a dokumentumot az archívumból',
  reverted:        ev => `visszaállította a(z) ${ev.details.toHash} verziót (új commit: ${ev.details.commit})`,
  renamed:         ev => `átnevezte: ${ev.details.from} → ${ev.details.to}`,
  duplicated_from: ev => `duplikálta a(z) „${ev.details.sourceTitle}" dokumentumból`,
  duplicated_to:   ev => `dokumentumot duplikált ebből: „${ev.details.targetTitle}"`,
  comment_edited:  () => 'szerkesztette a kommentjét',
  comment_deleted: () => 'törölte a kommentjét',
  category_created:ev => `létrehozta a(z) „${ev.details.name}" kategóriát`,
  category_renamed:ev => `átnevezte a kategóriát: ${ev.details.from} → ${ev.details.to}`,
  category_deleted:ev => `törölte a(z) „${ev.details.name}" kategóriát`,
  lock_expired:    ev => `lockja lejárt (heartbeat kimaradt)`,
};

const EVENT_ICON = {
  created: '✨', edited: '💾', status_changed: '🔁', deleted: '🗄️', restored: '♻️',
  reverted: '⏪', renamed: '📝', duplicated_from: '⧉', duplicated_to: '⧉',
  comment_edited: '✏️', comment_deleted: '🗑️', category_created: '🏷️',
  category_renamed: '🏷️', category_deleted: '🏷️', lock_expired: '🔓',
};

function feedItems(docId) {
  const comments = state.comments.filter(c => c.docId === docId).map(c => ({ kind: 'comment', ts: c.ts, c }));
  const events = state.events.filter(e => e.docId === docId).map(e => ({ kind: 'event', ts: e.ts, e }));
  return [...comments, ...events].sort((a, b) => a.ts - b.ts);
}

function viewFeed(d) {
  let items = feedItems(d.id);
  if (state.sort.feed === 'desc') items = [...items].reverse();
  return `
    <div class="panel"><div class="panel-body">
      <div class="feed">
        ${items.map(it => it.kind === 'comment' ? feedCommentHtml(it.c) : feedEventHtml(it.e)).join('')}
        ${items.length === 0 ? '<div class="empty-state">Még nincs bejegyzés.</div>' : ''}
      </div>
      <div class="comment-box">
        ${avatarHtml(state.currentUser)}
        <textarea id="new-comment" placeholder="Írj kommentet…"></textarea>
        <button class="btn primary" onclick="addComment('${d.id}')">Küldés</button>
      </div>
    </div></div>`;
}

function feedCommentHtml(c) {
  const author = user(c.authorId);
  const mine = c.authorId === state.currentUser.id;
  if (c.deletedAt) {
    return `<div class="feed-item">${avatarHtml(author)}<div class="body">
      <div class="head"><span class="who">${esc(author.name)}</span><span>${fmtDate(c.ts)}</span></div>
      <div class="content deleted">Ez a komment törölve lett. (soft delete — a helye megmarad, D20)</div>
    </div></div>`;
  }
  return `<div class="feed-item">${avatarHtml(author)}<div class="body">
    <div class="head">
      <span class="who">${esc(author.name)}</span>
      <span>${fmtDate(c.ts)}</span>
      ${c.editedAt ? '<span title="A korábbi tartalmat comment_edited esemény őrzi">· szerkesztve</span>' : ''}
    </div>
    <div class="content">${mdInline(c.content)}</div>
    ${mine ? `<div class="comment-actions">
      <button onclick="editCommentModal('${c.id}')">Szerkesztés</button>
      <button onclick="deleteComment('${c.id}')">Törlés</button>
    </div>` : ''}
  </div></div>`;
}

function feedEventHtml(e) {
  const textFn = EVENT_TEXT[e.type] || (() => e.type);
  return `<div class="feed-item sysevent">
    <span class="sysico">${EVENT_ICON[e.type] || '•'}</span>
    <div class="sysline"><span class="who">${esc(user(e.userId).name)}</span> ${esc(textFn(e))} · ${fmtDate(e.ts)}</div>
  </div>`;
}

function addComment(docId) {
  const el = $('#new-comment');
  const text = el.value.trim();
  if (!text) return;
  state.comments.push({ id: uid(), docId, authorId: state.currentUser.id, ts: Date.now(), content: text, editedAt: null, deletedAt: null });
  render();
}

function editCommentModal(commentId) {
  const c = state.comments.find(x => x.id === commentId);
  if (!c || c.authorId !== state.currentUser.id) { toast('Kommentet csak a szerzője módosíthat (D20)', true); return; }
  openModal(`
    <h2>Komment szerkesztése</h2>
    <textarea id="edit-comment-text" rows="4">${esc(c.content)}</textarea>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Mégse</button>
      <button class="btn primary" onclick="saveComment('${c.id}')">Mentés</button>
    </div>`);
}

function saveComment(commentId) {
  const c = state.comments.find(x => x.id === commentId);
  const text = $('#edit-comment-text').value.trim();
  if (!text) return;
  logEvent(c.docId, 'comment_edited', { previous: c.content });
  c.content = text;
  c.editedAt = Date.now();
  closeModal();
  toast('Komment módosítva — a korábbi tartalmat esemény őrzi (D20)');
  render();
}

function deleteComment(commentId) {
  const c = state.comments.find(x => x.id === commentId);
  if (!c || c.authorId !== state.currentUser.id) { toast('Kommentet csak a szerzője törölhet (D20)', true); return; }
  c.deletedAt = Date.now();
  logEvent(c.docId, 'comment_deleted', {});
  toast('Komment törölve (soft delete — a helye megmarad)');
  render();
}

// ================= Verziók, diff, visszaállítás (WP7) =================

function viewVersions(d) {
  const sel = state.diffSelection[d.id] || [];
  const versions = state.sort.versions === 'desc' ? [...d.versions].reverse() : [...d.versions];
  const headHash = head(d).hash;

  let diffHtml = '';
  if (sel.length === 2) {
    const [ha, hb] = sel;
    const va = d.versions.find(v => v.hash === ha), vb = d.versions.find(v => v.hash === hb);
    const [older, newer] = va.ts <= vb.ts ? [va, vb] : [vb, va];
    const rows = diffLines(older.content, newer.content);
    diffHtml = `
      <div class="diff-block">
        <h3>Diff: ${older.hash} → ${newer.hash}</h3>
        <div class="diff-view">
          ${rows.map(r => `<div class="diff-line ${r.t}">${r.t === 'add' ? '+' : r.t === 'del' ? '−' : ' '} ${esc(r.s) || '&nbsp;'}</div>`).join('')}
        </div>
      </div>`;
  }

  return `
    <div class="panel">
      <div class="panel-body panel-body--flush">
        ${versions.map(v => `
          <div class="version-row ${v.hash === headHash ? 'head-row' : ''}">
            <input type="checkbox" title="Kijelölés diffhez (pontosan kettőt)"
                   ${sel.includes(v.hash) ? 'checked' : ''} onchange="toggleDiffSel('${d.id}','${v.hash}')">
            <span class="hash">${v.hash}</span>
            <span class="msg">${esc(v.message)}</span>
            <span class="when">${esc(user(v.authorId).name)} · ${fmtDate(v.ts)}</span>
            ${v.hash !== headHash ? `<button class="btn sm" onclick="revertTo('${d.id}','${v.hash}')">⏪ Visszaállítás</button>` : ''}
          </div>`).join('')}
      </div>
    </div>
    <div class="draft-note">Jelölj ki két verziót a diffhez. Visszaállítás = új commit — a történet soha nem íródik át.</div>
    ${diffHtml}`;
}

function toggleDiffSel(docId, hash) {
  let sel = state.diffSelection[docId] || [];
  if (sel.includes(hash)) sel = sel.filter(h => h !== hash);
  else { sel = [...sel, hash]; if (sel.length > 2) sel = sel.slice(-2); }
  state.diffSelection[docId] = sel;
  render();
}

function revertTo(docId, hash) {
  const d = doc(docId);
  const v = d.versions.find(x => x.hash === hash);
  const newHash = shortHash();
  d.versions.push({ hash: newHash, ts: Date.now(), authorId: state.currentUser.id, message: `Visszaállítás: ${hash}`, content: v.content });
  d.iteration += 1;
  logEvent(docId, 'reverted', { toHash: hash, commit: newHash });
  state.diffSelection[docId] = [];
  toast(`Visszaállítva a(z) ${hash} verzió — új commit: ${newHash}`);
  render();
}

// ================= Szerkesztő (WP4, D16) =================

let editorDraft = null; // { docId, title, content, status, categories }

function startEdit(docId) {
  const holder = acquireLock(docId);
  if (holder) {
    toast(`🔒 ${user(holder.userId).name} éppen szerkeszti — a lock ${Math.round(LOCK_TTL / MIN)} perc heartbeat-hiány után jár le (D7)`, true);
    return;
  }
  navigate('edit/' + docId);
}

function viewEdit(d) {
  const holder = acquireLock(d.id);
  if (holder) {
    return `<div class="lock-note">🔒 <strong>${esc(user(holder.userId).name)}</strong> szerkeszti a dokumentumot — nem léphetsz be a szerkesztőbe.
      <a href="#/doc/${d.id}">Vissza az olvasó nézethez</a></div>`;
  }
  startHeartbeat(d.id);

  if (!editorDraft || editorDraft.docId !== d.id) {
    editorDraft = { docId: d.id, title: d.title, content: head(d).content, status: d.status, categories: [...d.categories] };
  }

  return `
    <div class="doc-header">
      <div class="titleline"><h1>Szerkesztés</h1>
        <span class="badge lock-badge">🔒 lock nálad · heartbeat 30 mp-enként</span>
      </div>
      <div class="pathline">${esc(d.repoPath)} · baseCommitHash: ${head(d).hash}</div>
    </div>

    <div class="editor-meta">
      <input type="text" id="edit-title" value="${esc(editorDraft.title)}" oninput="editorDraft.title=this.value" placeholder="Cím">
      <select onchange="editorDraft.status=this.value">
        ${STATUSES.map(s => `<option ${editorDraft.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>

    <div class="cat-picker">
      ${state.categories.map(c => `
        <button class="cat-pill ${editorDraft.categories.includes(c.name) ? 'on' : ''}"
                onclick="toggleDraftCat('${esc(c.name)}')">${esc(c.name)}</button>`).join('')}
    </div>

    <div class="scroll-area">
      <div class="editor-grid">
        <textarea id="edit-content" oninput="editorDraft.content=this.value;updatePreview()" spellcheck="false">${esc(editorDraft.content)}</textarea>
        <div class="editor-preview">
          <div class="preview-label">Élő előnézet — ugyanaz a render-pipeline, mint az olvasó nézet (D16)</div>
          <div class="md" id="edit-preview">${renderMarkdown(editorDraft.content)}</div>
        </div>
      </div>
      <div class="draft-note">A valóságban: mentés = szinkron lokális commit a queue-n át (200 + commitHash), a push aszinkron retry-jal fut (D26 A3).
      A piszkozat-őrzés (D7) itt memóriában van — a böngésző újratöltése a prototípusban törli.</div>
    </div>

    <div class="doc-actions">
      <button class="btn primary" onclick="saveDoc('${d.id}')">💾 Mentés (= commit)</button>
      <button class="btn" onclick="cancelEdit('${d.id}')">Mégse</button>
    </div>`;
}

function updatePreview() {
  const el = $('#edit-preview');
  if (el) el.innerHTML = renderMarkdown(editorDraft.content);
}

function toggleDraftCat(name) {
  const i = editorDraft.categories.indexOf(name);
  if (i >= 0) editorDraft.categories.splice(i, 1);
  else editorDraft.categories.push(name);
  render();
}

function saveDoc(docId) {
  const d = doc(docId);
  const draft = editorDraft;
  if (!draft.title.trim()) { toast('A cím nem lehet üres', true); return; }

  const contentChanged = draft.content !== head(d).content || draft.title !== d.title;
  if (contentChanged) {
    const newHash = shortHash();
    d.versions.push({ hash: newHash, ts: Date.now(), authorId: state.currentUser.id, message: 'Mentés a szerkesztőből', content: draft.content });
    d.iteration += 1;
    logEvent(docId, 'edited', { commit: newHash });
  }
  if (draft.status !== d.status) {
    logEvent(docId, 'status_changed', { from: d.status, to: draft.status });
    d.status = draft.status;
  }
  d.title = draft.title.trim();
  d.categories = [...draft.categories];

  releaseLock(docId);
  stopHeartbeat();
  editorDraft = null;
  toast(contentChanged ? `Mentve — új commit: ${head(d).hash} (a push a háttérben fut)` : 'Mentve — a tartalom nem változott, nincs új commit');
  navigate('doc/' + docId);
}

function cancelEdit(docId) {
  releaseLock(docId);
  stopHeartbeat();
  editorDraft = null;
  navigate('doc/' + docId);
}

// ================= Státuszváltás =================

function changeStatusModal(docId) {
  const d = doc(docId);
  openModal(`
    <h2>Státuszváltás — ${esc(d.title)}</h2>
    <p class="note">A workflow nem kikényszerített (D6) — bármely státuszba léphetsz, de minden váltás eseményként naplózódik.</p>
    ${STATUSES.map(s => `
      <button class="btn status-option" ${s === d.status ? 'disabled' : ''}
              onclick="changeStatus('${docId}','${s}')">
        <span class="badge st-${s}">${s}</span>${s === d.status ? ' (jelenlegi)' : ''}
      </button>`).join('')}
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Mégse</button></div>`);
}

function changeStatus(docId, to) {
  const d = doc(docId);
  logEvent(docId, 'status_changed', { from: d.status, to });
  d.status = to;
  closeModal();
  toast(`Státusz: ${to} — esemény naplózva`);
  render();
}

// ================= Létrehozás forrásból (D17) =================

function viewNew() {
  return `
    <p class="note">A létrehozás egységes „forrásból" művelet (D17): üres canvas, sablon vagy duplikálás.
    Az új dokumentum minden esetben új UUID-t kap, státusza draft, tulajdonosa te leszel, az iteráció újraindul.</p>
    <div class="scroll-area">
    <div class="create-cards">
      <button class="create-card" onclick="createFromEmpty()">
        <div class="ico">📄</div><h3>Üres dokumentum</h3>
        <p>Tiszta lappal indulsz.</p>
      </button>
      <button class="create-card" onclick="pickSourceModal(true)">
        <div class="ico">📋</div><h3>Sablonból</h3>
        <p>Válassz a sablonként jelölt dokumentumok közül.</p>
      </button>
      <button class="create-card" onclick="pickSourceModal(false)">
        <div class="ico">⧉</div><h3>Duplikálás</h3>
        <p>Meglévő dokumentum másolata — a származás eseményként naplózódik.</p>
      </button>
    </div>
    </div>`;
}

function pickSourceModal(templatesOnly) {
  const sources = activeDocs().filter(d => templatesOnly ? d.isTemplate : true);
  openModal(`
    <h2>${templatesOnly ? 'Sablon kiválasztása' : 'Forrás-dokumentum kiválasztása'}</h2>
    <div class="source-list">
      ${sources.map(d => `
        <button class="source-item" onclick="closeModal();duplicateFrom('${d.id}')">
          <strong>${esc(d.title)}</strong> ${d.isTemplate ? '<span class="badge tpl">sablon</span>' : ''}<br>
          <span class="sub">${esc(d.repoPath)} · ${d.categories.join(', ') || 'nincs kategória'}</span>
        </button>`).join('')}
      ${sources.length === 0 ? '<div class="empty-state">Nincs elérhető forrás.</div>' : ''}
    </div>
    <div class="modal-actions"><button class="btn" onclick="closeModal()">Mégse</button></div>`);
}

function createFromEmpty() {
  createDoc('Új dokumentum', '# Új dokumentum\n\nÍrd ide a tartalmat…', [], null);
}

function duplicateFrom(sourceId) {
  const src = doc(sourceId);
  createDoc(src.title + ' (másolat)', head(src).content, [...src.categories], src);
}

function createDoc(title, content, categories, source) {
  const id = uid();
  const hash = shortHash();
  const slug = norm(title).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'uj-dokumentum';
  const d = {
    id,
    repoPath: `draft/${slug}.md`,
    title,
    status: 'draft',
    ownerId: state.currentUser.id,
    iteration: 1,
    categories,
    isTemplate: false,
    deletedAt: null,
    versions: [{ hash, ts: Date.now(), authorId: state.currentUser.id, message: source ? `Létrehozás forrásból: ${source.repoPath}` : 'Létrehozás üres canvasból', content }],
  };
  state.docs.push(d);
  logEvent(id, 'created', {});
  if (source) {
    // A duplicated_from esemény mindkét dokumentumnál megjelenik (D17)
    logEvent(id, 'duplicated_from', { sourceId: source.id, sourceTitle: source.title });
    logEvent(source.id, 'duplicated_to', { targetId: id, targetTitle: title });
  }
  toast(source ? `Létrehozva „${source.title}" forrásból — új UUID, draft, iteráció újraindult` : 'Üres dokumentum létrehozva');
  startEdit(id);
}

// ================= Archívum (D8, D20) =================

function archiveDoc(docId) {
  const d = doc(docId);
  openModal(`
    <h2>Archiválás — ${esc(d.title)}</h2>
    <p class="note">Minden törlés soft delete (D20): a dokumentum az archívumba kerül,
    a Git-történet és minden esemény megmarad, és bármikor visszaállítható.</p>
    <input type="text" id="archive-reason" placeholder="Indoklás (opcionális)">
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Mégse</button>
      <button class="btn danger" onclick="confirmArchive('${docId}')">Archiválás</button>
    </div>`);
}

function confirmArchive(docId) {
  const d = doc(docId);
  d.deletedAt = Date.now();
  releaseLock(docId);
  logEvent(docId, 'deleted', { reason: $('#archive-reason').value.trim() || undefined });
  closeModal();
  toast('Archiválva — soft delete, visszaállítható az Archívumból');
  navigate('archive');
}

function viewArchive() {
  const archived = state.docs.filter(d => d.deletedAt);
  return `
    <p class="note">Soft delete-elt dokumentumok (D8). Fizikai törlés csak retention policy szerint történne (NY4) — a prototípusban soha.</p>
    <div class="scroll-area">
    <div class="doc-list">
      ${archived.length === 0 ? '<div class="empty-state">Az archívum üres.</div>' : ''}
      ${archived.map(d => `
        <div class="doc-row doc-row--static">
          <div class="title">${esc(d.title)} <span class="badge arch">archivált</span></div>
          <button class="btn sm" onclick="restoreDoc('${d.id}')">♻️ Visszaállítás</button>
          <div class="meta">
            <span>${esc(d.repoPath)}</span>
            <span>archiválva: ${fmtDate(d.deletedAt)}</span>
            <span>tulajdonos: ${esc(user(d.ownerId).name)}</span>
          </div>
        </div>`).join('')}
    </div>
    </div>`;
}

function restoreDoc(docId) {
  const d = doc(docId);
  d.deletedAt = null;
  logEvent(docId, 'restored', {});
  toast(`„${d.title}" visszaállítva`);
  render();
}

// ================= Kategóriák (D19) =================

function catUsage(name) { return activeDocs().filter(d => d.categories.includes(name)).length; }

function viewCategories() {
  return `
    <p class="note">Lapos címke-rendszer (D19): bárki hozhat létre kategóriát,
    de a használatban lévő nem nevezhető át és nem törölhető.</p>
    <div class="toolbar-row"><button class="btn primary" onclick="newCategoryModal()">＋ Új kategória</button></div>
    <div class="scroll-area">
    <table class="cat-table">
      <tr><th>Név</th><th>Leírás</th><th>Használat</th><th></th></tr>
      ${state.categories.map(c => {
        const n = catUsage(c.name);
        const locked = n > 0;
        return `<tr>
          <td><span class="badge cat">${esc(c.name)}</span></td>
          <td>${esc(c.description || '')}</td>
          <td class="count">${n} dokumentum</td>
          <td class="nowrap">
            <button class="btn sm" ${locked ? 'disabled title="Használatban lévő kategória nem nevezhető át (D19)"' : ''} onclick="renameCategoryModal('${c.id}')">Átnevezés</button>
            <button class="btn sm danger" ${locked ? 'disabled title="Használatban lévő kategória nem törölhető (D19)"' : ''} onclick="deleteCategory('${c.id}')">Törlés</button>
          </td>
        </tr>`;
      }).join('')}
    </table>
    </div>`;
}

function newCategoryModal() {
  openModal(`
    <h2>Új kategória</h2>
    <input type="text" id="cat-name" placeholder="Név (egyedi)">
    <input type="text" id="cat-desc" placeholder="Leírás (opcionális)">
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Mégse</button>
      <button class="btn primary" onclick="createCategory()">Létrehozás</button>
    </div>`);
}

function createCategory() {
  const name = $('#cat-name').value.trim();
  if (!name) { toast('A név kötelező', true); return; }
  if (state.categories.some(c => norm(c.name) === norm(name))) { toast('409 — már létezik ilyen nevű kategória', true); return; }
  state.categories.push({ id: uid(), name, description: $('#cat-desc').value.trim() });
  logEvent(null, 'category_created', { name });
  closeModal();
  toast(`„${name}" kategória létrehozva — esemény naplózva`);
  render();
}

function renameCategoryModal(catId) {
  const c = state.categories.find(x => x.id === catId);
  if (catUsage(c.name) > 0) { toast('409 category_in_use — használatban lévő kategória nem nevezhető át (D19)', true); return; }
  openModal(`
    <h2>Kategória átnevezése</h2>
    <input type="text" id="cat-newname" value="${esc(c.name)}">
    <div class="modal-actions">
      <button class="btn" onclick="closeModal()">Mégse</button>
      <button class="btn primary" onclick="renameCategory('${c.id}')">Átnevezés</button>
    </div>`);
}

function renameCategory(catId) {
  const c = state.categories.find(x => x.id === catId);
  const newName = $('#cat-newname').value.trim();
  if (!newName) return;
  logEvent(null, 'category_renamed', { from: c.name, to: newName });
  c.name = newName;
  closeModal();
  toast('Kategória átnevezve');
  render();
}

function deleteCategory(catId) {
  const c = state.categories.find(x => x.id === catId);
  if (catUsage(c.name) > 0) { toast('409 category_in_use — használatban lévő kategória nem törölhető (D19)', true); return; }
  state.categories = state.categories.filter(x => x.id !== catId);
  logEvent(null, 'category_deleted', { name: c.name });
  toast(`„${c.name}" törölve — esemény naplózva`);
  render();
}

// ================= Globális audit-nézet (WP8) =================

function viewAudit() {
  const events = [...state.events].sort((a, b) => b.ts - a.ts);
  return `
    <p class="note">Minden mutáló művelet eseménye (append-only <code>events</code> tábla — D6 kompenzáció).
    Az olvasás és a kedvenc-jelölés tudatosan nem naplózott.</p>
    <div class="scroll-area">
    <div class="panel"><div class="panel-body panel-body--rows">
      ${events.map(e => {
        const d = e.docId ? doc(e.docId) : null;
        const textFn = EVENT_TEXT[e.type] || (() => e.type);
        return `<div class="version-row">
          <span class="sysico">${EVENT_ICON[e.type] || '•'}</span>
          <span class="msg"><strong>${esc(user(e.userId).name)}</strong> ${esc(textFn(e))}
            ${d ? `— <a href="#/doc/${d.id}">${esc(d.title)}</a>` : ''}</span>
          <span class="when">${fmtDate(e.ts)}</span>
        </div>`;
      }).join('')}
    </div></div>
    </div>`;
}

// ================= Vágólap + .md letöltés (WP13) =================

function rawMd(d) { return frontmatter(d) + '\n\n' + head(d).content; }

function copyToClipboard(docId) {
  const d = doc(docId);
  navigator.clipboard.writeText(rawMd(d))
    .then(() => toast('Tartalom a vágólapon (frontmatterrel együtt)'))
    .catch(() => toast('A vágólap nem elérhető ebben a környezetben', true));
}

function downloadMd(docId) {
  const d = doc(docId);
  const blob = new Blob([rawMd(d)], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = d.repoPath.split('/').pop();
  a.click();
  URL.revokeObjectURL(a.href);
  toast('.md letöltés elindítva');
}

// ================= Indítás =================

render();
