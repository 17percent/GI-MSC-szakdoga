# Tudásbázis — Munkacsomag-terv (H5, delegálási sorrend)

*A döntési napló (7. verzió) D27 pontjának kifejtése. Minden csomag önállóan delegálható egység: kimondott céllal, függőségekkel és „kész"-kritériummal. A sorrend elve: **a legkockázatosabb varrat (Git-szerviz + queue) a lehető legkorábbra**, a hátrasorolt export (D21) a legvégére.*

## Sorrendi elvek

1. **Kockázat-előrehozás:** a WP3 (GitService + pg-boss) a rendszer egyetlen valóban újszerű, kísérletezést igénylő komponense — ha itt falba ütközünk (simple-git korlát, sorosítási él-esetek), annak a teljes tervre van hatása, ezért az auth után azonnal jön, minden funkcionális csomag előtt.
2. **Gerinctől a levelekig:** WP0–WP4 után létezik végigjátszható mag (login → dokumentum létrehozás → mentés = commit); minden további csomag erre rakódik, egymástól nagyrészt függetlenül.
3. **A demó-érték hátulról védett:** WP11–WP14 (kategóriák, kedvencek, vágólap, export) a 13 pontos MVP „levél"-funkciói — határidő-nyomásnál hátulról előre esnek ki, elsőként az export (D21 szerint).
4. **Minden csomag zárása:** tesztek zöldek CI-ben + a csomag érintette naplópontok visszaellenőrizve + rövid összefoglaló a delegáló felé. Ami nincs a naplóban, nem épül meg (D21 scope-fegyelem).

## Munkacsomagok

### WP0 — Skeleton, Compose, CI
**Tartalom:** monorepo (javaslat: pnpm workspaces — `apps/backend`, `apps/frontend`, `packages/shared` a közös típusoknak); Docker Compose (frontend dev-szerver, backend, Postgres, volume-ok a clone-nak és assets-nek — D12, D15); GitHub Actions CI: lint (ESLint+Prettier), typecheck, test, build; secret-kezelés váz (Compose secrets, D13).
**Kész:** `docker compose up` után hello-world backend + frontend válaszol; CI zöld egy PR-en.
**Függőség:** —

### WP1 — Adatbázis-séma és migrációk
**Tartalom:** a B4-dokumentum (`tudasbazis-db-sema-b4.md`) 1:1 implementálása: Drizzle-séma, generált + kézi migrációk (keresési infrastruktúra, append-only trigger), migráció-futtatás a Compose-indulásban; **dummy seed-adat** (D11 — kizárólag műtartalom).
**Kész:** üres DB-ből migráció hibátlanul felépül; seed után a táblák a B4 szerintiek (ellenőrző teszt).
**Függőség:** WP0

### WP2 — Autentikáció és beléptetés
**Tartalom:** OIDC code flow (fejlesztés: Google, provider konfigként — D5); httpOnly session cookie + CSRF (A1); **allowlist-ellenőrzés kérésenkénti middleware-ként** (D5); user-cache upsert; `GET /me`; frontend login-kapu.
**Kész:** allowlistes user beléphet és `/me`-t kap; allowlistről levett user következő kérése 403 `not_on_allowlist`; CSRF-teszt zöld.
**Függőség:** WP1

### WP3 — GitService + worker queue ⚠️ *(a legkockázatosabb — ezért ilyen korán)*
**Tartalom:** lokális clone bootstrap tartós volume-ra (hiányzó/sérült clone → friss clone, D12); `GitService` modul simple-git-tel (D24), írás kizárólag pg-boss job-ból (D22, D12 sorosítás); commit a felhasználó nevében (author metaadat); push aszinkron, exponenciális retry; **lemaradás-monitoring** + `GET /status` (D12); kulcsbetöltés Compose secretből (D13).
**Kész:** párhuzamos mentés-zápor (integrációs teszt) alatt sincs `index.lock` ütközés és commit-vesztés; remote-leállás szimulálva → push visszapótlódik, a lag a `/status`-on látszott; sérült clone helyreáll.
**Kockázat, amit itt kell kiderülnie:** simple-git viselkedési korlátok (→ D24 szerint pontonként shell-out csere), queue-átbocsátás, retry-élesetek.
**Függőség:** WP1 (pg-boss a DB-ben); WP2-től független — párhuzamosítható vele.

### WP4 — Dokumentum-mag: CRUD, frontmatter, index, konzisztencia-őr
**Tartalom:** „létrehozás forrásból" (D17: üres/sablon/duplikálás, új UUID, draft, `duplicated_from` esemény); frontmatter írás/olvasás (id, status, owner, iteration, categories, template — 4. fejezet); mentés = `PUT …/content` az A3/A4 szemantikával (szinkron lokális commit, `baseCommitHash` → 412); metaadat-PATCH (átnevezés: `repoPath` változik, id nem); indexfrissítés mentés után (D4 sorrend); **`reindex` parancs + ütemezett konzisztencia-ellenőrzés** (commit hash összevetés, eltérésnél auto-reindex + esemény); minimál szerkesztő-UI (react-md-editor + rehype-sanitize pipeline, D16).
**Kész:** login → létrehozás mindhárom úton → szerkesztés → mentés → a commit a repóban, az index friss; reindex nulláról visszaépíti az indexet; a konzisztencia-őr kézzel elrontott hash-t észlel és javít.
**Függőség:** WP2 + WP3

### WP5 — Keresés és listázás
**Tartalom:** `GET /documents` a teljes szűrőkészlettel (q: FTS magyar + trgm, snippet `ts_headline`-nal; status; category; template; lapozás A5); lista-UI szűrőpanellel.
**Kész:** ragozott magyar keresőszó találatot ad; elírás-tűrés (trgm) működik; szűrők kombinálhatók.
**Függőség:** WP4

### WP6 — Lock és heartbeat
**Tartalom:** lock-végpontok (megszerzés `ON CONFLICT`-tal — S7, heartbeat, elengedés); lejárat-kezelés (heartbeat nélkül 2–5 perc, D7); szerkesztőbe lépés = lock; foglaltság-jelzés UI; kliensoldali piszkozat-őrzés; `lock_expired` esemény.
**Kész:** két user versenye determinisztikus (második 409-et és birtokos-infót kap); fül-bezárás után a lock magától lejár; lejárat utáni kései mentést az A4 (412) fogja meg — integrációs teszt.
**Függőség:** WP4

### WP7 — Verziótörténet, diff, visszaállítás *(MVP 3. pontja — a sorrendben eddig implicit)*
**Tartalom:** history/versions/diff/revert végpontok (lokális `git log/show/diff` — D12); **diff-nézet UI** (react-diff-viewer vagy diff2html — a delegált választ, a döntést a csomag-összefoglalóban indokolja); revert = új commit.
**Kész:** két tetszőleges verzió diffje megjelenik; visszaállítás után a történet teljes (nincs átírt múlt).
**Függőség:** WP4

### WP8 — Események és kommentfolyam
**Tartalom:** eseménynaplózás minden mutációra (2. szakasz eseménytípus-katalógusa a B4-ben); egyesített `feed` végpont (A6); komment CRUD a D20 szabályokkal (szerkesztés → `comment_edited` esemény őrzi a régi tartalmat; törlés → soft delete + placeholder); globális audit-nézet (`GET /events`).
**Kész:** minden WP4–WP7 művelet nyomot hagy a feedben; komment-életciklus a D20 szerint auditált; append-only trigger éles (mutáció-kísérlet hibát dob).
**Függőség:** WP4 (WP6–WP7 eseményei utólag kötődnek be, ha WP8 előbb készül — a sorrend tartásával ez nem áll elő)

### WP9 — Archívum
**Tartalom:** soft delete (D8): DELETE → archív állapot; archívum-lista és visszaállító felület; archivált dokumentum kizárása az alap-listákból (`archived=true` szűrő).
**Kész:** törlés → eltűnik a listából, megvan az archívumban → visszaállítható; események naplózva.
**Függőség:** WP4, WP8

### WP10 — Backup *(üzemeltetési MVP-elem, nem halasztható)*
**Tartalom:** ütemezett `pg_dump` (napi) külön tárolóra; retenció; **visszaállítási eljárás dokumentálva és egyszer végigpróbálva** (D4 kötelező kitétele); a repo tartalmi backupja = a remote maga (ellenőrzés: push-lag riasztás WP3-ból).
**Kész:** dump keletkezik ütemezetten; friss környezetben a dump + clone + reindex teljes rendszert ad vissza — végigjátszott restore-próba jegyzőkönyvvel.
**Függőség:** WP1 (érdemben: WP8 után, hogy elsődleges adat is legyen benne)

### WP11 — Kategóriakezelés
**Tartalom:** kategória CRUD a D19 védőszabályokkal (használatban → 409 `category_in_use`); dokumentum↔kategória hozzárendelés a szerkesztőben; frontmatter kategórianév-lista szinkron; kategória-szűrő rákötése (WP5); események.
**Kész:** védőszabályok teszteltek; reindex a frontmatterből visszaépíti a hozzárendeléseket (D19 varrat-teszt).
**Függőség:** WP5

### WP12 — Kedvencek
**Tartalom:** favorite PUT/DELETE (idempotens); kedvencek-szűrő (WP5 lista); privát láthatóság (D18) — más user kedvence semmilyen válaszban nem jelenik meg.
**Kész:** privátság tesztelt (két userrel); szűrő működik.
**Függőség:** WP5

### WP13 — Vágólap + nyers .md letöltés
**Tartalom:** kliensoldali vágólap-másolás; `GET …/raw` letöltés (D21 — triviális csomag).
**Kész:** mindkettő működik a dokumentum-nézetből.
**Függőség:** WP4

### WP14 — Export (.pdf/.docx) 🔻 *(hátrasorolt — határidő-nyomásnál ez esik ki elsőként, D21)*
**Tartalom:** pandoc a backend-image-ben (az egyetlen új szerveroldali függőség — D21 kimondott ára); `GET …/export` szinkron streaminggel (A7); magyar ékezet/tipográfia ellenőrzés a PDF-kimeneten.
**Kész:** mindkét formátum letölthető, ékezethelyes; pandoc-hiba 502 `export_failed`-ként jelenik meg.
**Függőség:** WP4

## Függőségi térkép és párhuzamosítás

```
WP0 ─ WP1 ─┬─ WP2 ─┐
           └─ WP3 ─┴─ WP4 ─┬─ WP5 ─┬─ WP11
                           │       └─ WP12
                           ├─ WP6
                           ├─ WP7
                           ├─ WP8 ─ WP9
                           ├─ WP13
                           └─ WP14 (utolsó)
           WP10: WP1 után bármikor, érdemben WP8 után
```

WP2 és WP3 párhuzamosítható; WP4 után a levél-csomagok sorrendje a fenti ajánlás, de egymástól nagyrészt függetlenek — több agent-szál esetén WP5/WP6/WP7 egyszerre futhat.

## MVP-lefedettségi ellenőrzés (napló 5. fejezet → csomagok)

| MVP-pont | Csomag |
|---|---|
| 1. OIDC + allowlist | WP2 |
| 2. CRUD + szerkesztő + létrehozás forrásból | WP4 |
| 3. Verziótörténet + visszaállítás + diff | WP7 |
| 4. Keresés + szűrők + kedvencek-szűrő | WP5 (+WP11, WP12 szűrői) |
| 5. Lock heartbeat-tel | WP6 |
| 6. Események + kommentfolyam | WP8 |
| 7. Reindex + konzisztencia-őr | WP4 |
| 8. Archívum | WP9 |
| 9. Backup | WP10 |
| 10. Kategóriakezelés | WP11 |
| 11. Kedvencek | WP12 |
| 12. Vágólap + .md | WP13 |
| 13. Export | WP14 |

Mind a 13 pont lefedett, árva csomag nincs.
