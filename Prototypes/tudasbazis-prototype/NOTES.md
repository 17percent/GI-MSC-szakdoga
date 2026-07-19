# Tudásbázis UI-prototípus — jegyzet

**Kérdés, amire a prototípus válaszol:** hogyan érződik a tervezett tudásbázis
(döntési napló v7 + WP-terv) felülete és fő folyamatai egyben — mielőtt a valódi
stack (Fastify + React + Postgres + Git) megépülne?

**Forma:** egyetlen leegyszerűsített HTML+JS+CSS mock (nincs build, nincs backend,
nincs perzisztencia — újratöltéskor a seed áll vissza). A felhasználó kifejezetten
*egy* egyszerűsített verziót kért, ezért a skill szerinti variáns-váltó kimaradt.

## Futtatás

Nyisd meg az `index.html`-t böngészőben (dupla katt is elég, nem kell szerver).

## Mit fed le (MVP-pontok → felület)

| MVP | A prototípusban |
|---|---|
| 1. OIDC + allowlist | mock login képernyő; a „Szabó Kata" identitás 403 `not_on_allowlist`-et kap |
| 2. CRUD + szerkesztő + létrehozás forrásból | üres / sablonból / duplikálás (D17: új UUID, draft, iteráció reset, `duplicated_from` esemény mindkét oldalon); split szerkesztő élő előnézettel, azonos render-pipeline (D16) |
| 3. Verziótörténet + diff + visszaállítás | Verziók fül: két commit kijelölése → soronkénti diff; visszaállítás = új commit |
| 4. Keresés + szűrők | cím+tartalom keresés snippet-kiemeléssel (a valódi FTS/trgm helyett substring), státusz/kategória/sablon/kedvenc szűrők |
| 5. Lock heartbeat-tel | szerkesztőbe lépés = lock; másik userre váltva a szerkesztés tiltott, 2 perc heartbeat-hiány után lejár (`lock_expired` esemény) |
| 6. Események + kommentfolyam | egyesített feed; komment szerkesztés/törlés csak szerzőnek, soft delete placeholderrel (D20) |
| 8. Archívum | archiválás indoklással, lista, visszaállítás |
| 10. Kategóriák | CRUD; használatban lévő nem törölhető/átnevezhető (409 `category_in_use`, D19) |
| 11. Kedvencek | privát csillag (userváltással ellenőrizhető), szűrő; tudatosan nem naplózott (D18) |
| 12. Vágólap + .md | frontmatterrel együtt másol/tölt le |
| 13. Export | mock gomb — toast jelzi, hogy szerveroldali pandoc lenne (WP14) |

Nem UI-elem, ezért csak jelzésszerű: 7. reindex/konzisztencia-őr és a Git-státusz
(sidebar alján szimulált /status), 9. backup (kimaradt).

Extra demó-eszköz: **felhasználóváltó** a fejlécben — a lock, a privát kedvencek
és a komment-jogosultság (D20) két-useres eseteihez.

## Visszajelzések alapján beépítve (1. kör)

- **Rendezés-váltó** a „Kommentek és események" és a „Verziók" fülön
  (legújabb elöl ↔ legrégebbi elöl; alapértelmezés: feed időrendben, verziók HEAD elöl).
- **Fix fejléc-elrendezés:** az oldal maga nem görget — csak a tartalmi konténer
  (`.scroll-area`): lista, fültartalom, táblázat. A cím, akciógombok, fülek és a
  szűrősáv görgetés közben is láthatók maradnak; a szerkesztőben a Mentés-gombsor
  fixen a képernyő alján ül.

## Visszajelzések alapján beépítve (2. kör — Hallmark redesign)

- **Design system újratervezve** (Hallmark · modern-minimal genre · Cobalt téma):
  hűvös, kontrasztos paletta egyetlen kobalt akcenttel, Space Grotesk (display) +
  Inter (body) + JetBrains Mono (technikai elemek: hash, repo-út, frontmatter,
  panel-címkék). A teljes token-készlet a [`tokens.css`](tokens.css)-ben, a zárolt
  rendszer leírása a [`design.md`](design.md)-ben él — későbbi felület-módosítás
  ezt olvassa először.
- **Dark mode:** `data-theme` attribútum + OKLCH token-párok; alapértelmezés a
  rendszer-preferencia, kézi váltó a fejlécben és a login-kártyán (🌙/☀️), a
  választást localStorage őrzi (`tb-theme` — az egyetlen perzisztált állapot).
- Minden szín nevesített tokenre hivatkozik (inline hex az app.js-ből is kikerült);
  `:focus-visible` gyűrű minden interaktív elemen; `prefers-reduced-motion` támogatott.

## Visszajelzések alapján beépítve (3. kör — fluid mikrointerakciók)

Minden user-interakció fade/slide visszajelzést kapott; a specifikáció a
[`design.md`](design.md) Motion/Microinteractions szakaszában rögzült:

- **Hover:** gombok −1px emelés + árnyék; kártyák (dokumentumsor, létrehozás-kártya)
  −2px emelés + `--shadow-lift`; nav-elemek 2px csúszás; csillag/chip skála-pop.
- **Modal:** 260ms fade+scale belépés, 180ms kilépés — a bezárás megvárja az animációt.
- **Toast:** 400ms beúszás alulról, 240ms kilépés lefelé.
- **Tooltip:** a natív `title`-ök automatikusan egy JS-vezérelt, animált tooltipre
  konvertálódnak (hover: 700ms késleltetés, fókusz: azonnal, Escape zárja).
- **Input-fókusz:** akcent-keret + 3px puha gyűrű úszik be (200ms).
- **Nézet-belépés:** route-/fülváltáskor egyetlen 8px fade+slide (`view-enter`) —
  gépelés/szűrés közbeni újra-render nem indítja újra.
- **Téma-váltás:** 260ms szín-áttűnés.
- `prefers-reduced-motion` alatt minden ≤1ms-ra esik vissza; a fókuszgyűrű megjelenése
  soha nem animált.

## Verdikt (kitöltendő átnézés után)

- Mi működik jól: …
- Mi hiányzik / mit kell másképp: …
- Mely képernyők kerülnek át a valódi frontendbe: …

*A prototípus eldobható — a válasz megszületése után törölhető, vagy a tanulságok
a tervdokumentumokba folynak vissza.*
