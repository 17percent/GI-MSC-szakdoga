// PROTOTÍPUS — dummy seed-adatok (D11: kizárólag műtartalom).
// Minden itt definiált adat memóriában él, újratöltéskor visszaáll.

const NOW = Date.now();
const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

const SEED_USERS = [
  { id: 'u1', name: 'Tóth Máté',   email: 'mate.toth@vallalat.hu',   initials: 'TM', color: '#2563eb' },
  { id: 'u2', name: 'Kiss Anna',   email: 'anna.kiss@vallalat.hu',   initials: 'KA', color: '#059669' },
  { id: 'u3', name: 'Nagy Béla',   email: 'bela.nagy@vallalat.hu',   initials: 'NB', color: '#d97706' },
];

// Allowlist — a "Szabó Kata" szándékosan NINCS rajta (403-demó a loginon)
const SEED_ALLOWLIST = SEED_USERS.map(u => u.email);
const NOT_ALLOWED_USER = { id: 'u9', name: 'Szabó Kata (nincs allowlisten)', email: 'kata.szabo@kulsos.hu', initials: 'SK', color: '#6b7280' };

const SEED_CATEGORIES = [
  { id: 'c1', name: 'Onboarding',  description: 'Új belépők anyagai' },
  { id: 'c2', name: 'DevOps',      description: 'Üzemeltetés, CI/CD, infrastruktúra' },
  { id: 'c3', name: 'Backend',     description: 'Szerveroldali fejlesztés' },
  { id: 'c4', name: 'Frontend',    description: 'Kliensoldali fejlesztés' },
  { id: 'c5', name: 'HR',          description: 'Munkaügyi tudnivalók' },
  { id: 'c6', name: 'Folyamatok',  description: 'Belső folyamatleírások' },
  { id: 'c7', name: 'Üres kategória', description: 'Még egy dokumentum sem használja — törölhető/átnevezhető' },
];

// Verzió = commit: {hash, ts, authorId, message, content}
function v(hash, tsOffset, authorId, message, content) {
  return { hash, ts: NOW - tsOffset, authorId, message, content };
}

const SEED_DOCS = [
  {
    id: 'd1',
    repoPath: 'onboarding/elso-het.md',
    title: 'Első hét — új belépő checklist',
    status: 'publikált',
    ownerId: 'u2',
    iteration: 3,
    categories: ['Onboarding', 'HR'],
    isTemplate: false,
    deletedAt: null,
    versions: [
      v('a1f09c2', 21 * DAY, 'u2', 'Első vázlat',
`# Első hét — új belépő checklist

Üdv a csapatban! Ez a dokumentum az első heted teendőit gyűjti össze.

## Első nap

- Laptop és jogosultságok átvétele az IT-tól
- Céges e-mail beállítása
- Bemutatkozó kör a csapatban`),
      v('b4d21e7', 9 * DAY, 'u1', 'VPN szekció hozzáadva',
`# Első hét — új belépő checklist

Üdv a csapatban! Ez a dokumentum az első heted teendőit gyűjti össze.

## Első nap

- Laptop és jogosultságok átvétele az IT-tól
- Céges e-mail beállítása
- Bemutatkozó kör a csapatban

## VPN és távoli elérés

- VPN kliens telepítése a belső wikiből
- Kétfaktoros hitelesítés bekapcsolása`),
      v('c9e83f1', 2 * DAY, 'u2', 'Mentorprogram és linkek',
`# Első hét — új belépő checklist

Üdv a csapatban! Ez a dokumentum az első heted teendőit gyűjti össze.

## Első nap

- Laptop és jogosultságok átvétele az IT-tól
- Céges e-mail beállítása
- Bemutatkozó kör a csapatban

## VPN és távoli elérés

- VPN kliens telepítése a belső wikiből
- Kétfaktoros hitelesítés bekapcsolása

## Mentorprogram

Minden új belépő mellé **mentort** rendelünk az első hónapra.
Kérdés esetén fordulj hozzá bátran!

> Tipp: a leggyakoribb kérdéseket a [GYIK dokumentum](#) gyűjti.`),
    ],
  },
  {
    id: 'd2',
    repoPath: 'devops/deploy-folyamat.md',
    title: 'Deploy folyamat — staging és éles',
    status: 'tesztelt',
    ownerId: 'u1',
    iteration: 5,
    categories: ['DevOps', 'Folyamatok'],
    isTemplate: false,
    deletedAt: null,
    versions: [
      v('d7a45b0', 30 * DAY, 'u1', 'Kezdeti leírás',
`# Deploy folyamat

## Staging

1. Merge a \`develop\` branchre
2. A CI automatikusan buildel és deployol
3. Füstteszt a staging környezeten`),
      v('e2c91d8', 5 * DAY, 'u3', 'Éles deploy szekció + rollback',
`# Deploy folyamat

## Staging

1. Merge a \`develop\` branchre
2. A CI automatikusan buildel és deployol
3. Füstteszt a staging környezeten

## Éles

1. Release tag létrehozása (\`v1.2.3\` formátum)
2. Jóváhagyás a release csatornán
3. Deploy a pipeline-ból, **munkaidőben tilos** pénteken

## Rollback

Hiba esetén az előző tag újra-deployolható — az adatbázis-migrációk
visszavonását külön runbook írja le.`),
    ],
  },
  {
    id: 'd3',
    repoPath: 'backend/kodolasi-konvenciok.md',
    title: 'Backend kódolási konvenciók',
    status: 'review',
    ownerId: 'u3',
    iteration: 2,
    categories: ['Backend'],
    isTemplate: false,
    deletedAt: null,
    versions: [
      v('f8b32a4', 14 * DAY, 'u3', 'Vázlat',
`# Backend kódolási konvenciók

## Elnevezések

- Szolgáltatás-osztályok: \`XyzService\`
- Aszinkron függvények neve igével kezdődik

## Hibakezelés

Minden végpont egységes hibaformátumot ad vissza.
Nyelt kivétel (üres \`catch\`) tilos.

\`\`\`ts
try {
  await gitService.commit(docId);
} catch (err) {
  logger.error({ err, docId }, 'commit failed');
  throw new AppError('git_commit_failed');
}
\`\`\``),
    ],
  },
  {
    id: 'd4',
    repoPath: 'frontend/komponens-katalogus.md',
    title: 'Frontend komponens-katalógus',
    status: 'draft',
    ownerId: 'u2',
    iteration: 1,
    categories: ['Frontend'],
    isTemplate: false,
    deletedAt: null,
    versions: [
      v('a3e57c9', 3 * DAY, 'u2', 'Első vázlat',
`# Frontend komponens-katalógus

*Munkapéldány — folyamatosan bővül.*

## Gombok

- Elsődleges akció: kitöltött gomb
- Másodlagos: körvonalas
- Veszélyes művelet: piros, megerősítő dialógussal

## Űrlapok

Minden mező alatt hibaüzenet-hely van fenntartva, hogy a layout ne ugráljon.`),
    ],
  },
  {
    id: 'd5',
    repoPath: 'hr/szabadsag-igenyles.md',
    title: 'Szabadság igénylése',
    status: 'publikált',
    ownerId: 'u2',
    iteration: 4,
    categories: ['HR', 'Folyamatok'],
    isTemplate: false,
    deletedAt: null,
    versions: [
      v('b6f14d2', 60 * DAY, 'u2', 'Első verzió',
`# Szabadság igénylése

1. Nyisd meg a HR-portált
2. Válaszd az *Igénylés* menüpontot
3. A jóváhagyást a közvetlen vezető adja meg`),
      v('c1a98e5', 12 * DAY, 'u2', 'Határidők pontosítva',
`# Szabadság igénylése

1. Nyisd meg a HR-portált
2. Válaszd az *Igénylés* menüpontot
3. A jóváhagyást a közvetlen vezető adja meg

## Határidők

- 1–2 nap: legalább **3 munkanappal** előre
- Egy hétnél hosszabb: legalább **2 héttel** előre

## Betegszabadság

Betegség esetén a jelzés a vezető felé aznap reggel esedékes,
az igazolást utólag kell feltölteni.`),
    ],
  },
  {
    id: 'd6',
    repoPath: 'sablonok/runbook-sablon.md',
    title: 'Runbook sablon',
    status: 'publikált',
    ownerId: 'u1',
    iteration: 2,
    categories: ['DevOps', 'Folyamatok'],
    isTemplate: true,
    deletedAt: null,
    versions: [
      v('d4c72b8', 45 * DAY, 'u1', 'Sablon létrehozása',
`# [Rendszer neve] runbook

## Mit csinál a rendszer?

*Rövid leírás ide.*

## Riasztások

| Riasztás | Teendő |
| --- | --- |
| ... | ... |

## Gyakori hibák és megoldásuk

### Hiba: ...

**Tünet:** ...

**Megoldás:** ...

## Eszkaláció

Ha 30 perc alatt nem oldódik meg: ...`),
    ],
  },
  {
    id: 'd7',
    repoPath: 'sablonok/dontesi-jegyzokonyv-sablon.md',
    title: 'Döntési jegyzőkönyv sablon',
    status: 'publikált',
    ownerId: 'u3',
    iteration: 1,
    categories: ['Folyamatok'],
    isTemplate: true,
    deletedAt: null,
    versions: [
      v('e9d31f6', 40 * DAY, 'u3', 'Sablon létrehozása',
`# Döntés: [cím]

**Dátum:** ÉÉÉÉ-HH-NN
**Résztvevők:** ...

## Kontextus

*Milyen problémát oldunk meg?*

## Mérlegelt alternatívák

1. ...
2. ...

## Döntés és indoklás

*Mit választottunk és miért?*

## Következmények

*Mit vállalunk be ezzel?*`),
    ],
  },
  {
    id: 'd8',
    repoPath: 'devops/regi-backup-eljaras.md',
    title: 'Régi backup eljárás (elavult)',
    status: 'draft',
    ownerId: 'u1',
    iteration: 1,
    categories: ['DevOps'],
    isTemplate: false,
    deletedAt: NOW - 6 * DAY, // archivált — az archívum nézet demója
    versions: [
      v('f2b84c1', 90 * DAY, 'u1', 'Backup leírás',
`# Régi backup eljárás

*Ez az eljárás a 2024-es szerverköltözés óta nem érvényes.*

A napi mentés a régi NAS-ra futott éjfélkor, kézi ellenőrzéssel.`),
    ],
  },
];

// Kommentek: {id, docId, authorId, ts, content, editedAt, deletedAt}
const SEED_COMMENTS = [
  { id: 'k1', docId: 'd1', authorId: 'u1', ts: NOW - 8 * DAY, content: 'A VPN-szekcióba érdemes lenne belinkelni az IT-portált is.', editedAt: null, deletedAt: null },
  { id: 'k2', docId: 'd1', authorId: 'u2', ts: NOW - 7 * DAY, content: 'Jó ötlet, a következő körben beteszem!', editedAt: NOW - 7 * DAY + 2 * HOUR, deletedAt: null },
  { id: 'k3', docId: 'd1', authorId: 'u3', ts: NOW - 5 * DAY, content: 'Ezt a kommentet töröltem, mert rossz dokumentumhoz írtam.', editedAt: null, deletedAt: NOW - 5 * DAY + HOUR },
  { id: 'k4', docId: 'd2', authorId: 'u2', ts: NOW - 4 * DAY, content: 'A pénteki deploy-tilalom a hotfixekre is vonatkozik?', editedAt: null, deletedAt: null },
  { id: 'k5', docId: 'd2', authorId: 'u1', ts: NOW - 4 * DAY + 3 * HOUR, content: 'Hotfixre nem — azt bármikor lehet, de csak jóváhagyással.', editedAt: null, deletedAt: null },
  { id: 'k6', docId: 'd3', authorId: 'u1', ts: NOW - 2 * DAY, content: 'A hibakezelés részhez tennék példát a Problem Details formátumra is.', editedAt: null, deletedAt: null },
];

// Események: {id, docId, type, userId, ts, details}
const SEED_EVENTS = [
  { id: 'e1',  docId: 'd1', type: 'created',        userId: 'u2', ts: NOW - 21 * DAY, details: {} },
  { id: 'e2',  docId: 'd1', type: 'edited',         userId: 'u1', ts: NOW - 9 * DAY,  details: { commit: 'b4d21e7' } },
  { id: 'e3',  docId: 'd1', type: 'edited',         userId: 'u2', ts: NOW - 2 * DAY,  details: { commit: 'c9e83f1' } },
  { id: 'e4',  docId: 'd1', type: 'status_changed', userId: 'u2', ts: NOW - 2 * DAY + HOUR, details: { from: 'review', to: 'publikált' } },
  { id: 'e5',  docId: 'd1', type: 'comment_edited', userId: 'u2', ts: NOW - 7 * DAY + 2 * HOUR, details: { previous: 'Jó ötlet!' } },
  { id: 'e6',  docId: 'd1', type: 'comment_deleted',userId: 'u3', ts: NOW - 5 * DAY + HOUR, details: {} },
  { id: 'e7',  docId: 'd2', type: 'created',        userId: 'u1', ts: NOW - 30 * DAY, details: {} },
  { id: 'e8',  docId: 'd2', type: 'edited',         userId: 'u3', ts: NOW - 5 * DAY,  details: { commit: 'e2c91d8' } },
  { id: 'e9',  docId: 'd2', type: 'status_changed', userId: 'u1', ts: NOW - 4 * DAY,  details: { from: 'review', to: 'tesztelt' } },
  { id: 'e10', docId: 'd3', type: 'created',        userId: 'u3', ts: NOW - 14 * DAY, details: {} },
  { id: 'e11', docId: 'd3', type: 'status_changed', userId: 'u3', ts: NOW - 13 * DAY, details: { from: 'draft', to: 'review' } },
  { id: 'e12', docId: 'd4', type: 'created',        userId: 'u2', ts: NOW - 3 * DAY,  details: {} },
  { id: 'e13', docId: 'd5', type: 'created',        userId: 'u2', ts: NOW - 60 * DAY, details: {} },
  { id: 'e14', docId: 'd5', type: 'edited',         userId: 'u2', ts: NOW - 12 * DAY, details: { commit: 'c1a98e5' } },
  { id: 'e15', docId: 'd6', type: 'created',        userId: 'u1', ts: NOW - 45 * DAY, details: {} },
  { id: 'e16', docId: 'd7', type: 'created',        userId: 'u3', ts: NOW - 40 * DAY, details: {} },
  { id: 'e17', docId: 'd8', type: 'created',        userId: 'u1', ts: NOW - 90 * DAY, details: {} },
  { id: 'e18', docId: 'd8', type: 'deleted',        userId: 'u1', ts: NOW - 6 * DAY,  details: { reason: 'Elavult a szerverköltözés óta' } },
];

// Kedvencek: privát, felhasználónként (D18) — userId -> docId lista
const SEED_FAVORITES = {
  u1: ['d2', 'd6'],
  u2: ['d1', 'd5'],
  u3: [],
};
