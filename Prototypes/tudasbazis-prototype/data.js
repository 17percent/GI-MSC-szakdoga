// PROTOTÍPUS — a seed-adatok BELÉPÉSI PONTJA (D11: kizárólag műtartalom).
// Minden itt előálló adat memóriában él, újratöltéskor visszaáll.
//
// Kézzel kiírt dummy dokumentum már NINCS: a korpuszt a `seedGenerator.js`
// állítja elő induláskor. A generátor determinisztikus (seed-elt PRNG), ezért
// ugyanaz a seed ugyanazt a korpuszt — és így ugyanazt az Atlasz-elrendezést —
// adja újratöltés után is.
//
// Hangolás:
//   SEED_CONFIG.docCount   — hány dokumentum készüljön (min. 12)
//   SEED_CONFIG.seed       — melyik korpusz; `?seed=<szám>` URL-paraméter felülírja
//   `?docs=<szám>` URL-paraméter                — darabszám felülírása
// A kategória-eloszlást (nagy/kis klaszter, egydoksis, üres kategória) a
// generátor `CATEGORY_PLAN` táblája írja le.

const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

const SEED_CONFIG = {
  seed: 20260822,
  docCount: 56,
};

// URL-felülírás — egyetlen újratöltéssel más korpusz nézhető meg.
// (`?seed=7`, `?docs=120`; a `docs` a 150-es csomópont-sapka próbájához is jó.)
const __seedParams = new URLSearchParams(location.search);
const __seedOverride = parseInt(__seedParams.get('seed'), 10);
const __docsOverride = parseInt(__seedParams.get('docs'), 10);

const SEED = generateSeed({
  seed: Number.isFinite(__seedOverride) ? __seedOverride : SEED_CONFIG.seed,
  docCount: Number.isFinite(__docsOverride) ? __docsOverride : SEED_CONFIG.docCount,
});

// `avatar`: a design system avatár-palettájának indexe (tokens.css --avatar-1..4).
// Szándékosan NEM nyers hex — a színt a rendszer adja, nem az adat.
const SEED_USERS = SEED.users;

// Allowlist — a "Szabó Kata" szándékosan NINCS rajta (403-demó a loginon)
const SEED_ALLOWLIST = SEED.allowlist;
const NOT_ALLOWED_USER = SEED.notAllowedUser;

const SEED_CATEGORIES = SEED.categories;

// Dokumentumok. Verzió = commit: {hash, ts, authorId, message, content}
const SEED_DOCS = SEED.docs;

// Kommentek: {id, docId, authorId, ts, content, editedAt, deletedAt}
const SEED_COMMENTS = SEED.comments;

// Események: {id, docId, type, userId, ts, details}
const SEED_EVENTS = SEED.events;

// Kedvencek: privát, felhasználónként (D18) — userId -> docId lista
const SEED_FAVORITES = SEED.favorites;
