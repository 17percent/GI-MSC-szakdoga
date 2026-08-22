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

## Visszajelzések alapján beépítve (4. kör — Táltos design system + Élő Atlasz)

> **A Cobalt/Hallmark rendszer eldobva.** A prototípus teljes egészében a **Táltos
> Design Systemre** állt át (`taltos-design-system.md` · `taltos-design-tokens.json`
> · `taltos-design-system.html`). A [`design.md`](design.md) ezzel **elavult** —
> csak történeti dokumentáció, kódot ne emitálj belőle.

**Design system csere.** A [`tokens.css`](tokens.css) most a Táltos token-készlet
(`:root` + `[data-theme="dark"]` remap), plusz egy **app-szemantikus réteg** azokra a
jelentésekre, amiket a rendszer nem nevez meg (státusz-címkék, diff, keresés-kiemelés,
avatár-paletta, kód-felület) — mind a rendszer szemantikus tokenjeire épül, nyers érték
nélkül. A [`styles.css`](styles.css) teljesen újraírva a Táltos komponens-receptekkel.
Fontok: **Fraunces** (display, csak címben) · **Inter** (törzs/UI) · **JetBrains Mono**
(adat). Az `app.js`-ből minden inline nyers érték kikerült (az avatárszín is: `data.js`
már palettaindexet tárol, nem hexet).

**Bejelentkezés** (`login/`) — reaktív, élő tudásgráf-háttérrel; részletek a
`taltos-login-handoff.md`-ben. Modulok: `constellation.js` (Canvas ambient mező),
`authMachine.js` (FSM), `loginView.js` (koreográfia), `login.config.js` (OAuth
placeholderek). Két belépési mód: Google + Microsoft; valódi backend nélkül a redirect
helyén mock belépés fut (a valódi `loginRedirect()` helye a kódban megjelölve).

**Kezdőoldal: „Élő Atlasz"** (`home/`) — a szűrős lista helyén kurált **tudás-térkép +
gyors találati lista**, egyetlen közös kiválasztással. Modulok: `graphModel.js`
(Tier 0: származtatott gráf címke/szerző együttes-előfordulásból, determinisztikus
elrendezés), `atlasRenderer.js` (Canvas térkép, semantic zoom L0/L1/L2 crossfade-del,
kamera-tween, rács hit-test, culling), `selectionStore.js` (egyetlen igazságforrás),
`atlasMachine.js` (FSM: overview/focused/searching/empty/error), `resultsList.js`
(`role="listbox"`, FLIP-átrendezés, billentyűzet-navigáció), `atlasView.js` (koreográfia).

- **Soha nincs teljes gráf a képernyőn:** kurálás (≤150 csomópont) + LOD + culling.
- **Térkép ↔ lista szinkron:** hover és kiválasztás kétirányú, egy store-ból.
- **A lista az a11y-elsődleges nézet:** nyilak lépnek, Enter kiválaszt (kamera ráközelít),
  még egy Enter megnyit; „Csak lista" mód elrejti a térképet. 900px alatt a lista a fő nézet.
- **Térkép-kattintás:** üres terület = kizoomolás · domén-csomópont = szűrés arra a
  kategóriára · dokumentum = kiválasztás.
- A keresés címben **és tartalomban** talál (MVP-4), snippet-kiemeléssel.
- A régi szűrők **facetekké** lettek (Ma / Enyém / Csapat / Kedvenc / Sablon + státusz +
  kategória), és egyszerre szűrik a listát és a térképet.

**Folyékony átmenet login → kezdőoldal.** Két trükk viszi át a szemet vágás nélkül:
1. **Részecskemező-folytonosság:** a bejelentkező `constellation`-je átadja a pontok
   normalizált pillanatképét (`getSnapshot()`), a kezdőoldal ambient mezője ezzel indul
   (`applySnapshot()`) — a csillagkép **folytatódik**, nem keveredik újra.
2. **Shared element:** a világfa-jel ugyanaz a glyph a loginon és a fejlécben; a belépéskor
   egy fix pozíciós klón **átrepül** a kártyából a sidebar márkajelébe, miközben a login
   overlay elhalványul és az app alatta beúszik (crossfade, `app.js` `runHandoff()`).

Az app-váz **egyszer épül fel és megmarad** (`ensureShell`), így a kedvencezés, userváltás
és témaváltás nem indítja újra a térkép élő animációját.

**Ismert kompromisszumok:**
- A soron belüli ikongombok (kedvenc, megnyitás) `tabindex="-1"`-esek, mert egy
  `role="option"` nem tartalmazhat fókuszálható vezérlőt; a kedvenc billentyűzetről a
  dokumentumnézetben állítható. A kedvenc-állapotot glyph (★/☆) + `aria-pressed` is jelzi,
  nem csak szín.
- Lista-virtualizáció 200 tétel felett kapcsol be (a prototípus korpusza ennél kisebb);
  ilyenkor a FLIP-átrendezés kikapcsol.
- `--accent` világos témán `--bg`-n 2.79:1 — dekoratív canvas-elemekhez rendben, de
  **jelentéshordozó** grafikai elemre (pl. a Tier 1-ben megjelenő „személy" csomópont)
  erősebb tokent kell választani.

## Visszajelzések alapján beépítve (5. kör — a kategória facet, nem hely)

**A kiinduló kérdés:** hova kerül egy dokumentum, amely több kategória alá tartozik?
A válasz feltárta, miért volt követhetetlen a gráf: a dokumentum **csak az első**
kategóriája körében élt (`primary: myCats[0]`), így egy témakörre szűrve/kattintva
sosem látszott az összes hozzá tartozó dokumentum. Döntés: a **kategória kikerül a
térkép szerkezetéből**, és tisztán szűrővé válik.

- **`graphModel.js`** — nincs domén-csomópont, klaszter, `clusterId`, gyűrűs elrendezés
  és `primary`. Egyetlen csomóponttípus van: a dokumentum. A helyet a **kapcsolat**
  adja: determinisztikus erő-szimuláció (páronkénti taszítás + rugók a közös
  kategória/szerző éleken + enyhe középre-húzás, hash-alapú kezdőpozíció, fix
  iterációszám), majd a korábbi kemény ütközésfeloldás — a csomópontok továbbra sem
  fedhetik egymást. A getterek `{nodes, edges}`-t adnak. Az `applyFacets` mostantól
  `categories: [név…]` tömböt vár, **VAGY**-kapcsolattal.
- **`atlasRenderer.js`** — a LOD-szintek (0/1/2) is megszűntek (`setLOD`, `onLOD`,
  „Domének" chip): nincs többé mit elkülöníteni. A részletesség **folytonosan**
  skálázódik a zoomból, nem ugrik szinteken. Az `onViewport` csomópont-id-ket jelent,
  és a zoom↔lista szűrés pontos csomópont-egyezésre megy, nem kategórián keresztül.
- **`atlasView.js`** — a natív `<select>` helyén **multiszelekt dropdown**: a vezérlőn
  belül a kiválasztott kategóriák tag-ként, „×" gombbal törölhetők; a legördülő
  panelben checkbox-listával több is kiválasztható. A kiválasztás sorrendje a
  `data.categories` sorrendjére kanonizálódik, így a store tömbje stabilan
  összehasonlítható. A panel `position: fixed`, JS-ből igazítva — **nem** `absolute`,
  mert a facet-sáv 640px alatt `overflow-x: auto`, ami levágná.
- Kitakarítva: a pre-Atlasz időkből maradt, már senki által nem hívott
  `filteredDocs()` és `state.filters`.

**Ellenőrzés:** a Browser panel akciótooljai kiestek (biztonsági osztályozó), ezért a
valódi modulfájlokat **jsdom**-ban futtatva teszteltük (30 + 18 állítás), majd a
böngészőben újra. Igazolva: egy kétkategóriás dokumentum **mindkét** kategória
szűrőjében megjelenik, pontosan **egyszer**, és fókuszban a szomszédsága mindkét
kategória dokumentumait eléri; a kiválasztás halványít (nem töröl); a jelentés→
újraszámolás→újrarajzolás lánc **stabilizálódik** (nincs végtelen ciklus).

> ⚠️ **Modulszerkesztés után kényszerített újratöltés kell** (Ctrl+Shift+R). A beépített
> böngésző agresszíven cache-eli a JS-t, és sima újratöltésnél **vegyes verziójú** oldal
> jön létre (új `atlasView.js` + régi `selectionStore.js`), ami valódi hibának látszik.

## Visszajelzések alapján beépítve (6. kör — méret, kategória-színek, zoom-toggle)

**1. Kattintható csomópont-méret.** Mérés szerint a legkisebb csomópont sugara
**2,5 px** volt áttekintésben (a modell 4–11 px-es skáláját a renderer 0,62-tel
szorozta), miközben a legközelebbi szomszédok között **114 px** szabad hely volt —
bőven volt hova növekedni. Két ponton javítva:
- a modell sugárskálája **8–18 px** (`NODE_R_MIN`/`NODE_R_MAX`), és áttekintésben a
  renderer már 1,0-val skáláz (nem 0,62-tel) → a `r` egy-az-egyben px;
- `MIN_NODE_R = 7` px **padló** a rajzolt sugárra, hogy kis panelen vagy alacsony
  súlynál se essen pont-méretűre. A hit-test +6 px ráhagyásával a legkisebb
  célfelület **26 px átmérőjű** (WCAG 2.5.8 minimum 24 px).
  Mérve: sugarak 7–11 px, a legkisebb átfedés-tartalék 106 px → nincs ütközés.

**2. Kategória-színek.** Új app-szemantikus paletta a `tokens.css`-ben
(`--catcolor-1..8`), témánként külön (világoson sötét, sötéten világos telítés).
A slot-sorrend szándékos: 4 hue-ból úgy áll össze 8 slot, hogy se a szomszédos, se
a 4 távolságra lévő slotok ne osztozzanak hue-n — különben egy többkategóriás
dokumentum átmenete ugyanannak a színnek két árnyalata közt futna, azaz
láthatatlan lenne. A slotot a **modell** adja (`categorySlots()`, `node.catSlots`),
így egyetlen igazságforrás van.
- egy kategória → tömör szín;
- **több kategória → finom színátmenet** a kategóriái színei között. A gradienst
  slot-kombinációnként EGYSZER rendereljük egy kis offscreen canvasre, és
  `drawImage`-zsel méretezzük → nincs per-frame gradiens-allokáció. A megállók a
  szegmensek közepén vannak, ezért a színek folyamatosan olvadnak egymásba.
- **A szín soha nem egyedüli jelentéshordozó:** a legördülő minden opciója és a
  kiválasztott tag-ek színjelet kapnak (ez EGYBEN jelmagyarázat), és a listasorok
  kategória-címkéin is ott a színpont — a térkép színe így visszakereshető.

**3. Újra-kattintás = kizoomolás.** A térképen ugyanarra a dokumentumra másodszor
kattintva a fókusz megszűnik, és a kamera visszatér a kezdeti áttekintésre (a
`backToOverview()` egy helyre vonja össze ezt az utat: a HUD-gomb és az Esc is
ezt hívja). Más csomópontra kattintva átvált (nem zoomol ki).

**Közben talált és javított hiba:** a `setData` csak akkor illesztette újra a
kamerát, ha még nem volt kész (`!camReady`). Szűréskor viszont változik a
befoglaló (és így az `ovZoom`), tehát a kamera a régi értéken „zoomoltnak" tűnt
az új adathoz képest — és a nézet-alapú lista-szűrés indokolatlanul leszűkítette a
találatokat. Most `!camReady || !camTouched` esetén újraillesztünk: ha a
felhasználó nem mozgatta a kamerát, a szűrés az áttekintésben marad; ha mozgatta
(pan/zoom/fókusz), tiszteletben tartjuk.

**Ellenőrzés:** a két jsdom-suite **63 állítása** zöld (a valódi modulfájlokkal),
köztük a kamera pontos visszatérése az áttekintés-geometriára. A böngészőben
canvas-pixel mintavétellel igazolva: az egykategóriás csomópontok a saját
kategória-színüket kapják (Δ 0–5), a négy többkategóriás csomópont pedig a két
színe KÖZÖTT keveredik (91–142 RGB-távolság).

## Visszajelzések alapján beépítve (7. kör — a szűrés kiemel, nem töröl)

**A kérdés.** Kategória-szűréskor a nem illeszkedő csomópontok eltűntek a
térképről. Halványításra váltottunk.

**Miért halványítás.** Nem esztétikai döntés: az eltüntetés **elveszi a térbeli
memóriát**. A csomópontok helye determinisztikus (hash-alapú kezdőpozíció + fix
iterációszám), tehát ugyanaz a dokumentum mindig ugyanoda kerül — de ha a kiszűrt
csomópontok eltűnnek, a befoglaló (és vele a kamera illesztése) minden szűrő-
kattintásra átrendeződik, és a megmaradt csomópontok szétugranak. Így a szűrő
**kiemel a tudástárban**, nem pedig újrarajzolja azt. Mellékhatásként a 6. körben
leírt `!camTouched` újraillesztés szűréskor már no-op: a befoglaló nem változik.

**Hogyan.** Három rétegben, a modulhatárok tiszteletben tartásával:
- `graphModel.getOverview({ includeInactive: true })` — a szűrőt figyelmen kívül
  hagyó teljes halmaz. A „mi felel meg a szűrőnek" kérdést továbbra is az
  `applyFacets` válaszolja meg (`nodeIds`, + új `active` jelző).
- `atlasRenderer.setExcluded(ids)` — **új, a `setDimmed`-től szándékosan
  különböző** erősség. A `setDimmed` (keresés nem-találatai, fókusz szomszédságán
  kívüliek) továbbra is **kattintható** marad: így lehet a gráfban továbblépni egy
  szomszédra. A `setExcluded` viszont **inert** — lásd lentebb.
- `atlasView.recompute()` a teljes halmazt kontextus-rétegként a nézet alá húzza
  (`mergeViews`), a szűkebb nézet az unió elején van, így a renderer 150-es
  sapkája sosem attól vág le.

**A vizuál: halvány ÜRES karika.** A kiesett csomópont nem csak áttetszőbb lesz —
**elveszti a kitöltését** (és vele a kategória-színét), `--text-subtle` 1 px-es
körvonal marad belőle. Két okból: (1) a jelentést nem a szín hordozza, hanem a
kitöltés eltűnése (design system szabály); (2) a paletta így **csak a szűrt
halmazt** írja le, nem zavarja össze a színek olvasatát. A **méret marad** — az
továbbra is a súlyt jelenti. Az érintett élek 0,3-szoros alfát kapnak: a kapcsolat
látszik, de nem versenyez a szűrt halmaz éleivel.

**Inert, nem kattintható — tudatos döntés.** A kiesett csomópont nem kap feliratot,
a hit-test átlép rajta, és hover-célként sem jöhet szóba. Ha kattintható lenne, egy
olyan dokumentumra állna a fókusz, aminek a **listában nem lenne sora** — a
kijelölés láthatatlan állapotba csúszna. Ugyanezért: ha egy szűrő-váltás kilöki az
épp kijelölt dokumentumot, a kijelölést elengedjük (`afterFilterChange()`, ami
mostantól mindhárom szűrő-vezérlő egyetlen útja).
*Alternatíva, ha másképp döntenél:* a kattintás megnyithatná a dokumentumot a
szűrő átmeneti feloldásával („mutasd mégis") — ez viszont új állapot a store-ban.

**Nem csak színnel.** A halványság önmagában néma, ezért az élő régió kimondja:
„A szűrőből kimaradt N dokumentum halványan a térképen marad, de most nem
választható."

**Közben talált és javított hiba:** szűrővel 0 találatnál a lista csak kiürült —
nem volt sem üres-minta, sem kiút (az FSM `empty` állapotát csak a keresés érte
el). Most a szűrő-üres eset saját szövegét kapja („A dokumentumok halványan a
térképen maradtak…") a „Szűrők törlése" gombbal. A feltétel szándékosan a szűrő
eredményére néz, nem a listára: ha a lista csak a kamera-nézet miatt ürült ki
(rázoomoltál egy üres részre), az nem „nincs találat" — arra a kizoomolás a válasz.

**Ellenőrzés:** a három módosított modul parse-ol; a viselkedés böngészős
átnézése a felhasználónál van.

## Visszajelzések alapján beépítve (8. kör — fejléc-térköz, keresőikon, élek)

**1. Fejléc-térköz a kezdőoldalon.** A `.main--atlas { padding: 0 }` a teljes
szélességű atlaszhoz kellett — de a topbar is a `.main` gyermeke, így az is
elvesztette a paddingjét: a „Tudástár" cím a sidebar szegélyéhez tapadt, a
felhasználóváltó + téma + Kijelentkezés pedig a képernyő széléhez, felső térköz
nélkül. A fejléc most külön visszakapja a ritmust
(`.main--atlas > .topbar`, `--space-6`/`--space-8`, 640px alatt `--space-4`).

**2. Keresőikon a placeholderen.** Nem elírás volt, hanem **specificitás**: a
`styles.css` `input[type="search"]` szabálya (elem + attribútum → 0,1,1)
erősebb, mint az önmagában álló `.atlas__input` (0,1,0), így a recept
`padding: 0 var(--space-3)` **shorthandje** visszaírta a `padding-left`-et
40px-ről 12px-re — az ikon (12–30px) pont a szövegre került. Javítás:
`.atlas__search .atlas__input` (0,2,0). Ez a csapda bekerült a `CLAUDE.md`
„Gyakori hibák" listájába, mert minden alaprecept-felülírásnál visszatér.

**3. „Prototípus · adatok memóriában" címke törölve** — a markupból és a
`styles.css` `.proto-badge` szabályából is (nem hagytunk halott CSS-t).

**4. Élek: halvány alapháló + élénk hover-kiemelés.** Az élek eddig
gyakorlatilag láthatatlanok voltak (áttekintésben ~0,09–0,14 alfa), a „kiemelt"
állapot pedig ennek csak 1,6-szorosa — azaz szintén halvány. Most:
- az alapháló **halvány, de olvasható** (`EDGE_A_BASE`/`EDGE_A_WEIGHT`, és a
  zoom-tényező padlója 0,55 → **0,75**);
- a hoverelt (vagy kijelölt) csomópontból **induló és oda befutó** élek élénk
  `--accent`-re váltanak (a keverés 45/55 → **20/80** az accent felé),
  vastagabb vonallal (`EDGE_W_HI`);
- a kiemelt alfa **szándékosan nem skálázódik a zoommal** — áttekintésben is
  ugyanolyan határozott, mint közelről.
A hover mindkét irányban működik (térkép ↔ lista), mert a `selectionStore`
`hoverId`-jét a renderer `setHighlight`-ja is feldolgozza.
Az él-paraméterek megnevezett konstansok a fájl elején, hogy hangolhatók legyenek.

**5. Térkép-hover → a lista odagördül.** A kiemelés eddig is átváltott a megfelelő
listasoron, de ha az kilógott a nézetből, a visszajelzés néma maradt. Most a
`selectionStore` `hoverId`-változására a lista a sorhoz gördül
(`block: 'nearest'` — csak ha tényleg kell, és csak amennyit kell).

Két csapda, amit külön kezelni kellett:
- **A listából induló hover nem gördíthet.** Különben a sorok elcsúsznának a
  kurzor alól, az új sor `pointerover`-t kapna, az újabb hovert állítana → a
  hurok önmagát hajtja. A `store.setHover` emitje szinkron, ezért egy `selfHover`
  zászló elég: a feliratkozó még ezen az ablakon belül fut le. Minden listából
  induló hover (`pointerover`, `pointerleave`, nyilak, Home/End) ezen megy át.
- **Gyors kurzor-söprés** a csomópontok fölött: 90 ms debounce, és a lejáratkor
  újraellenőrizzük, hogy még mindig az az `id` a hover — így a végállapotra áll
  be, nem gördül minden érintett dokumentumhoz külön.

Közben javítva: a **Home/End** eddig átállította az aktív sort, de nem gördült
hozzá (a nyilak igen) — most mindkettő ugyanazon az úton fut (`jumpTo`).

**6. A kategória-legördülő nem a vezérlő alatt jelent meg.** Nem a számítás volt
hibás: az `.atlas__bar` **`backdrop-filter`-e** (mint a `filter`/`transform`)
**containing blockot csinál a `position:fixed` leszármazottaknak**, így a panel a
SÁV boxához igazodott — miközben a `getBoundingClientRect()` viewport-koordinátát
ad neki. Innen az elcsúszás. Javítás: a panel **portálozva a `<body>`-ba**, ahol a
`fixed` újra a viewporthoz mér (és 640px alatt a facet-sáv `overflow-x:auto`-ja
sem vágja le — ez volt az eredeti indok a `fixed`-re).

Amit a portál miatt kézzel kell kezelni, mert a panel már nem a `.catfilter`
leszármazottja: a **kívülre-kattintás** (`catPanel.contains` is kell), az
**Escape** (a listener a panelre is felkerült), és a **`destroy()`** (a body-ból
külön el kell távolítani). Az `aria-controls`/`aria-expanded` id-alapú, azt a
portál nem érinti.

A pozicionálás egyben pontosabb is lett: a panel **valódi méretét** mérjük
(ezért ELŐBB látható, aztán igazítunk), a viewport-széli levágást tokenből jövő
réssel kerüljük (nem a régi bűvös `232`), és ha alul nem fér el, **fölfelé nyílik**.
Görgetésre is újraigazít (capture fázis).

**7. Jelmagyarázat a térkép bal alsó sarkában.** Szín → kategória, dokumentum-
számmal (mono), és egy lábjegyzettel a többkategóriás csomópontok átmenetéről —
e nélkül a két színű gombóc megmagyarázatlan maradt. Az adat a **modellből** jön
(`categoryLegend()`), tehát ugyanabból az igazságforrásból, mint a csomópontok
slotjai: nem tud elcsúszni tőlük. Csak a **használatban lévő** kategóriák kerülnek
bele (az „Üres kategória" egyetlen csomópontot sem színez, felsorolni félrevezető
lenne), de a kategória nélküli doksik gyűjtője („Egyéb") igen, mert az IS színez.
- A HUD ezzel kétsorossá lett (jelmagyarázat + „Áttekintés" gomb egymás alatt).
- 900px alatt a jelmagyarázat elrejtve: ott a térkép már csak a színpad ~35%-a,
  és a jelentés nem veszik el (a listasorok színpontjai + a legördülő is az).
- A színjel osztálya `.catfilter__swatch` → **`.catswatch`**: a jelmagyarázat nem
  függhet egy `catfilter__`-scope-olt osztálytól. Egy definíció szolgálja a
  legördülőt, a tag-eket és a jelmagyarázatot.

**Ellenőrzés:** a módosított JS parse-ol, a `home.css`-ben nincs nyers hex, a
`proto-badge` nyom nélkül eltűnt; a vizuális átnézés (mindkét téma, 360px-ig) a
felhasználónál van.

## Verdikt (kitöltendő átnézés után)

- Mi működik jól: …
- Mi hiányzik / mit kell másképp: …
- Mely képernyők kerülnek át a valódi frontendbe: …

*A prototípus eldobható — a válasz megszületése után törölhető, vagy a tanulságok
a tervdokumentumokba folynak vissza.*
