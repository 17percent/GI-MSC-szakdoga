# CLAUDE.md — Vállalati tudásbázis projekt

Agent-onboarding fájl. Ez a repo gyökerében él. A teljes kontextus a tervdokumentumokban van (lásd: Dokumentumtérkép) — **ez a fájl a kényszerek desztillátuma, nem helyettesíti őket**. Ütközés esetén a döntési napló nyer; ha eltérést találsz, jelezd, ne dönts helyette.

## A projekt egy mondatban

Webes, markdown-alapú tudásbázis ~200 fős vállalatnak: a tartalom igazságforrása egy Git-repo (lokális clone + remote), a PostgreSQL a keresőindex ÉS az elsődleges adatok (események, kommentek, kedvencek, allowlist, kategóriák) otthona. Szakdolgozati projekt, egyszemélyes fejlesztés, agent-delegált munkacsomagokkal.

## Kőbe vésett szabályok

### Tartalom és tárolás
- A repóban KIZÁRÓLAG szöveges .md fájl él. Képfeltöltést, csatolmány-kezelést NE implementálj (D15).
- Minden írás a backend API-n át megy. Közvetlen repo-manipulációt lehetővé tevő funkciót NE építs (D2).
- A dokumentum identitása a frontmatterben tárolt UUID. Az `id` SOHA nem változik; átnevezéskor csak a `repo_path`. Az `id`-t az alkalmazás generálja, SOHA nem a DB (B4 séma-elv).
- A frontmatter hordozza: id, status, owner, iteration, categories (névlista), is_template. Az index ebből épül — a repo önmagában teljes értékű kell maradjon (reindex-teszt kötelező).

### Git-műveletek
- Provider API-t (GitHub REST, Azure DevOps API) használni TILOS. Csak git protokoll, SSH (D12).
- Minden Git-ÍRÁS kizárólag a pg-boss queue-n át, egyesével sorosítva (D12, D22). Git-írást queue-n kívülről hívni TILOS.
- Minden Git-művelet a `GitService` modulon át megy. simple-git a belseje (D24); ha korlátba ütközöl, az adott műveletet cseréld shell-outra a GitService-en BELÜL, és dokumentáld a csomag-összefoglalóban.
- Olvasások (log/diff/show) a lokális clone-ból, szinkron — ezek gyorsak, nem kell queue.
- Mentés-szemantika: lokális commit szinkron megvárva (200 + commitHash), push aszinkron retry-jal (D26 A3). A mentés a lokális committal SIKERES — push-hiba nem buktatja.
- A történet SOHA nem íródik át: revert = új commit, force push TILOS.

### Adatbázis
- Drizzle a séma- és query-réteg (D25). A keresési infrastruktúra (extensions, generált tsvector, GIN indexek, append-only trigger) KÉZI SQL-migrációban él — NE próbáld TS-sémába erőltetni.
- A séma forrása: `tudasbazis-db-sema-b4.md`. Ettől eltérni csak a napló módosításával lehet.
- Fizikai DELETE TILOS az alkalmazáskódból. Minden törlés soft delete (`deleted_at`) (D20).
- Az `events` tábla append-only — UPDATE/DELETE triggerrel tiltva. Ezt a triggert kikapcsolni, megkerülni TILOS.
- Minden mutáló művelet eseményt naplóz (eseménytípus-katalógus: B4 dokumentum 2. szakasz). Új eseménytípus = TS-union bővítés, NEM DB-migráció.

### API
- Kontraktus: `tudasbazis-api-kontraktus-b5.md`. Új végpont vagy szemantika-változás csak a dokumentum frissítésével.
- Hibaválasz: RFC 9457 Problem Details + stabil `code` mező, a katalógus szerinti kódokkal (D26 A2). Ad-hoc hibaformátumot NE találj ki.
- `PUT …/content` KÖTELEZŐEN `baseCommitHash`-sel; eltérésnél 412 (D26 A4).
- Allowlist-ellenőrzés MINDEN kérésnél, middleware-ben (D5). Session httpOnly cookie, CSRF-token minden mutáló kérésen (D26 A1). Bearer-token flow-t NE vezess be.
- Jogosultsági szerepeket NE építs — a modell tudatosan nyitott (D6). Egyetlen kivétel: komment módosítás/törlés csak a szerzőnek (D20).

### Frontend
- Vite + React SPA + React Router (D23). SSR-t, Next.js-t NE hozz be.
- shadcn/ui = bemásolt, saját tulajdonú komponenskód + Tailwind (D14). Új runtime UI-könyvtárat NE vegyél fel a napló módosítása nélkül.
- Markdown megjelenítés: @uiw/react-md-editor + rehype-sanitize MINDENHOL — előnézetben ÉS olvasó nézetben, azonos pipeline-nal (D16). Nyers HTML átengedése = betárolt XSS, TILOS.
- Kép csak az alkalmazás saját assets-útvonaláról renderelődhet; külső kép-URL blokkolt a sanitize-sémában (D16).
- localStorage/sessionStorage használható a piszkozat-őrzéshez (D7) — ez böngészőben futó éles kód, nem artifact.

### Secrets
- SSH-kulcs, OIDC client secret, DB-jelszó SOHA nem kerül: Docker image-be, repóba, commitolható .env-be, logba (D13).
- Betöltés Compose secrets-ként; kizárólag a backend konténer kapja.
- Fejlesztés kizárólag dummy adattal. Éles céges tartalom a fejlesztői környezetbe és GitHub-ra SOHA (D11).

## Munkafegyelem

- **Scope-szabály (D21): ami nincs a döntési naplóban, azt NEM építed meg.** Ha a feladat közben új igény vagy döntési pont merül fel, NE implementáld — jelezd a delegálónak, hogy naplópontként felvehesse.
- A munka egysége a munkacsomag (`tudasbazis-munkacsomagok-h5.md`, WP0–WP14). Tartsd a sorrendet és a függőségeket; a csomag „kész"-kritériuma a definíció, nem a saját megérzésed.
- A funkcionális elvárások forrása a user story-k (`tudasbazis-user-story-h1-koteg1..3.md`). Az AC-k tesztként képeződnek le.
- Csomag-zárás: CI zöld + az érintett naplópontok visszaellenőrizve + rövid összefoglaló (mi készült, milyen döntéseket hoztál a szabad sávban, mibe ütköztél).
- Nyitott kérdést (NY-pontok, story-k ❓ szekciói) NE dönts el magad — különösen: NY2 (branch policy), NY4 (retention), H2 (OIDC-mock kérdés, biztonsági döntés).

## Stack-rögzítés (nem újratárgyalható a napló nélkül)

TypeScript end-to-end · Node.js + Fastify (JSON Schema validáció → generált OpenAPI) · pg-boss · PostgreSQL + Drizzle · Vite + React SPA + React Router · shadcn/ui + Tailwind + Motion · @uiw/react-md-editor + rehype-sanitize · simple-git a GitService mögött · Docker Compose · pnpm workspaces monorepo: `apps/backend`, `apps/frontend`, `packages/shared`.

## Dokumentumtérkép

| Fájl | Szerep |
|---|---|
| `tudasbazis-architektura-dontesi-naplo.md` | A forrás-igazság: D1–D27 döntések, követelmények, MVP, NY1–NY4. Ütközésnél EZ nyer. |
| `tudasbazis-db-sema-b4.md` | Séma-referencia: Drizzle-kód, kézi SQL-migrációk, S1–S8 mikrodöntések |
| `tudasbazis-api-kontraktus-b5.md` | API-referencia: A1–A8 elvek, végpontlista, hibakód-katalógus |
| `tudasbazis-munkacsomagok-h5.md` | WP0–WP14: sorrend, függőségek, kész-kritériumok |
| `tudasbazis-user-story-h1-koteg1..3.md` | US-01–US-14: funkcionális elvárások, AC-k, DoD |

## Gyors önellenőrzés minden PR előtt

1. Érint-e Git-írást? → queue-n át megy, GitService-ben él?
2. Töröl-e bármit? → soft delete, esemény naplózva?
3. Mutál-e adatot? → esemény naplózva, allowlist+CSRF middleware fedi?
4. Renderel-e user-tartalmat? → sanitize pipeline-on át?
5. Hoz-e új függőséget, végpontot, táblát, funkciót? → van rá naplópont/kontraktus-frissítés? Ha nincs: STOP, jelezd.
6. CI zöld, AC-lefedő tesztekkel?
