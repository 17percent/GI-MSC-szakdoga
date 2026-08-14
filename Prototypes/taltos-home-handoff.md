# Táltos — Kezdőoldal újratervezés · Fejlesztői átadó (integrációs spec)

> **Kinek szól:** annak a fejlesztő agentnek, aki egy **már elkezdett, könyvtár nélküli
> (vanília HTML/CSS/JS) prototípusba** építi be az új kezdőoldalt. A jelenlegi kezdőoldal
> egy szűrős dokumentum**lista**.
> **Cél:** az „**Élő Atlasz**" — egy magával ragadó, élő, kurált **tudás-térkép** (nem
> teljes gráf!), szorosan összekötve egy **gyors találati listával**. A térkép adja a
> hero-élményt, a tájékozódást és a felfedezést; a lista a megtalálás munkalova **és** az
> akadálymentességi tartalék.
> **Kötöttség:** semmilyen külső futásidejű könyvtár. Canvas 2D + Web Animations API (WAAPI)
> + saját állapotgép. Háttérintenzitás: **kiegyensúlyozott** (a loginnal konzisztens).

---

## 0. Olvasd el ELŐSZÖR (nem duplikáljuk itt)

Tartsd a projekt `CLAUDE.md` munkafolyamatát; a vizuális értékeket **nem** ismételjük meg.

1. `taltos-design-system.md` — token-hatékony referencia (paste-ready `:root`, sötét
   remap, komponens-receptek, szabályok). **Csak szemantikus tokent használj.**
2. `taltos-design-tokens.json` — programozott tokenérték esetén.
3. `taltos-design-system.html` — vizuális referencia.
4. `taltos-login-handoff.md` — **ezt hasznosítjuk újra**: az ott specifikált
   `constellation.js` motor (Canvas particle-mező, DPR-tudatos rAF, token-olvasó
   színleképezés, `reducedMotion` mód) az Atlasz **ambient rétegének** alapja. Ne írd
   újra — bővítsd (lásd 6.).

**Aranyszabály:** komponens-CSS-ben nincs nyers hex/px, csak `var(--…)`; a téma a
szemantikus rétegből jön (a Canvas is tokent olvas → témával vált); `prefers-reduced-motion`
és látható fókusz kötelező.

---

## 1. Hatókör & vezérelvek

- **Soha nem rajzoljuk ki a teljes gráfot.** Mindig **kurált kivágat** vagy
  **klaszterezett szint** látszik (level-of-detail). Ez zárja ki a „hajgombóc"-ot.
- **Egyetlen kiválasztás, két nézet.** A térkép és a lista **ugyanazt** a kiválasztást/
  szűrőt tükrözi, egy közös store-ból. Nincs két igazság → nincs elcsúszás.
- **Minden átmenet determinisztikus és snap-mentes:** kamera-tween, LOD-crossfade,
  FLIP a listasorokra. Semmi nem „vágódik be".
- **A lista a robusztus alap.** Ha nincs gráfadat, reduced-motion van, vagy a térkép
  hibázik → a lista önmagában teljes értékű, billentyűzet-elérhető kezdőoldal.
- **Fokozatos bevezetés (Tier 0/1/2)** az elérhető adat szerint — lásd 9.

---

## 2. Architektúra — modulok

Laza csatolás, hogy a meglévő prototípusba illeszthető és tesztelhető legyen.

| Modul | Felelősség | Nem felelőssége |
|---|---|---|
| `constellation.js` *(újrahasznosított)* | Ambient particle-mező háttér + a nem-fókuszált csomópontok „lélegzése" alacsony intenzitással. | Nem tud a kiválasztásról; nem rajzol címkét/élt logikát. |
| `graphModel.js` | Adatréteg: nyers dokumentum+kapcsolat → normalizált `{nodes, edges, clusters}`; kurálás, klaszterezés, szomszédság-lekérdezés. | Nem rajzol, nem tud DOM-ról. |
| `atlasRenderer.js` | A kurált térkép rajzolása Canvasre: csomópont/él/címke, LOD, culling, kamera (pan/zoom), hit-testing. Publikus API-val. | Nem dönt állapotot; a kamerát/kiemelést a view vezérli. |
| `selectionStore.js` | **Egyetlen igazságforrás:** `{ hoverId, selectedId, query, filters }` + feliratkozás. | Nem animál, nem hív adatot. |
| `atlasMachine.js` | Nézet-állapotgép (FSM): `overview/focused/searching/empty/error`. **A determinizmus forrása.** | Nem rajzol, nem animál. |
| `atlasView.js` | DOM felépítés + koreográfia: minden átmenetnél lejátssza a WAAPI/kamera-animációt, szinkronban tartja a két panelt. | Nincs benne üzleti logika; a „mi a következő" az FSM-é. |
| `resultsList.js` *(a meglévő lista adaptálva)* | A találati lista: szűrés, virtualizáció, billentyűzet-navigáció, FLIP-átrendezés. **Ez az a11y-elsődleges nézet.** | — |

**Adatfolyam:** felhasználói esemény (keresés/kattintás/hover) → `selectionStore` frissül
→ feliratkozók reagálnak: `atlasView` kamera-tweent + kiemelést játszik, `resultsList`
FLIP-pel átrendez; a nézet-szintű váltásokat (`overview↔focused↔searching`) az
`atlasMachine` dönti el, és a `atlasView` koreografálja.

Javasolt fájlelhelyezés:

```
/home
  graphModel.js        // adat → {nodes, edges, clusters}; kurálás, szomszédság
  atlasRenderer.js     // Canvas térkép: rajz, LOD, kamera, hit-test (publikus API)
  selectionStore.js    // közös állapot + subscribe
  atlasMachine.js      // FSM (nincs DOM/rajz)
  atlasView.js         // mount(), teardown(), koreográfia, panel-szinkron
  resultsList.js       // a meglévő lista adaptálva (facet + FLIP + a11y)
  home.css             // csak szemantikus tokenekre épülő stílusok
/login/constellation.js  // ÚJRAHASZNOSÍTVA az ambient réteghez
```

---

## 3. DOM-váz (markup)

Kétpaneles „Atlasz": felül omnibox (keresés + gyors facetek), balra a térkép (Canvas),
jobbra a lista. A gyökér `data-view` attribútuma az `atlasMachine` állapotát tükrözi.

```html
<section class="atlas" data-view="loading" aria-label="Tudástár">
  <header class="atlas__bar">
    <div class="atlas__search input-group">
      <svg aria-hidden="true"><!-- kereső ikon --></svg>
      <input class="input" type="search" placeholder="Keresés vagy „Kérdezd a Táltost…”"
             aria-label="Keresés a tudástárban">
    </div>
    <div class="atlas__facets" role="group" aria-label="Nézet">
      <button class="btn btn--ghost btn--sm" data-facet="today" aria-pressed="false">Ma</button>
      <button class="btn btn--ghost btn--sm" data-facet="mine" aria-pressed="false">Enyém</button>
      <button class="btn btn--ghost btn--sm" data-facet="team" aria-pressed="false">Csapat</button>
      <button class="btn btn--ghost btn--sm" data-toggle="listonly" aria-pressed="false">Csak lista</button>
    </div>
  </header>

  <div class="atlas__stage">
    <!-- Térkép: ambient particle Canvas + a kurált térkép Canvas egymáson -->
    <div class="atlas__map" aria-hidden="true">
      <canvas class="atlas__field"></canvas>   <!-- constellation.js ambient réteg -->
      <canvas class="atlas__graph"></canvas>    <!-- atlasRenderer.js kurált térkép -->
      <div class="atlas__hud"><!-- zoom-ki gomb, „Áttekintés” chip --></div>
    </div>

    <!-- Lista: a11y-elsődleges, billentyűzet-navigálható -->
    <aside class="atlas__results" role="region" aria-label="Találatok">
      <ul class="atlas__list" role="listbox" aria-label="Dokumentumok" tabindex="0">
        <!-- resultsList.js tölti; minden sor role="option", data-id -->
      </ul>
      <div class="atlas__status" role="status" aria-live="polite"></div>
    </aside>
  </div>
</section>
```

Megjegyzések:
- A térkép `aria-hidden` (dekoratív reprezentáció); **a kiválasztás mindig tükröződik a
  listában**, ami a hozzáférhető nézet. A „Csak lista" kapcsoló elrejti a térképet.
- A `role="status"` élő régió mondja ki a találatszámot és az üres/hiba állapotot.

---

## 4. Elrendezés & réteg-CSS (kivonat — csak tokenekkel)

```css
.atlas { min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.atlas__bar { display: flex; gap: var(--space-4); align-items: center;
  padding: var(--space-4) var(--space-6); border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: var(--z-sticky);
  background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(10px); }
.atlas__search { flex: 1; max-width: 560px; }
.atlas__facets { display: flex; gap: var(--space-2); }

.atlas__stage { flex: 1; display: grid; grid-template-columns: 1fr 380px; min-height: 0; }
.atlas__map { position: relative; min-width: 0; overflow: hidden; }
.atlas__field, .atlas__graph { position: absolute; inset: 0; width: 100%; height: 100%; }
.atlas__field { z-index: var(--z-base); }      /* ambient */
.atlas__graph { z-index: var(--z-raised); }    /* kurált térkép, interaktív */
.atlas__hud { position: absolute; left: var(--space-4); bottom: var(--space-4);
  z-index: var(--z-raised); display: flex; gap: var(--space-2); }

.atlas__results { border-left: 1px solid var(--border); background: var(--surface);
  display: flex; flex-direction: column; min-height: 0; }
.atlas__list { overflow: auto; padding: var(--space-2); margin: 0; list-style: none; }
.atlas__status { padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border);
  color: var(--text-subtle); font: var(--text-sm)/1.4 var(--font-body); min-height: var(--space-10); }

/* Listasor = a rendszer kártya/sor receptje, kiemelhető állapottal */
.atlas__row { display: flex; gap: var(--space-3); align-items: center;
  padding: var(--space-3); border-radius: var(--radius-md); cursor: pointer;
  transition: background var(--duration-fast) var(--ease-standard); }
.atlas__row:hover, .atlas__row[data-hover="true"] { background: var(--surface-sunken); }
.atlas__row[aria-selected="true"] { background: var(--primary-soft); }
.atlas__row:focus-visible { outline: none; box-shadow: var(--focus-ring); }

/* Reszponzív: térkép fölé kerül, lista alá csúszik; mobilon a lista az alap */
@media (max-width: 900px) {
  .atlas__stage { grid-template-columns: 1fr; grid-template-rows: 44vh 1fr; }
  .atlas__results { border-left: 0; border-top: 1px solid var(--border); }
}
```

**A „nincs snap" első szabálya itt is:** az `.atlas__status` és a panelek fix helyet
kapnak; állapotváltáskor `opacity`/`transform`/kamera animál, sosem `display`-ugrás vagy
layout-reflow-ugrás.

---

## 5. Az adatréteg — `graphModel.js`

Normalizált modell, amit a renderer és a lista is fogyaszt. A kulcs a **kurálás**: a
`getView(...)` sosem ad vissza többet, mint amennyi olvashatóan megjeleníthető.

```js
// Node: { id, label, type: "domain"|"topic"|"document"|"person",
//         weight, clusterId, tags[], updatedAt, authority? }
// Edge: { source, target, type: "reference"|"coauthor"|"topic"|"semantic", weight }

const model = createGraphModel(rawData, { tier: 0 /* 0|1|2, lásd 9. */ });

model.getOverview();                 // top klaszterek (domének), méret=doc-szám → L0
model.getNeighborhood(id, { max: 32 }); // egy csomópont + legrelevánsabb szomszédai → L1/L2
model.search(query, { max: 60 });    // találatok + közvetlen kapcsolataik
model.applyFacets({ today, mine, team }); // szűrt részhalmaz (lista + térkép közös)
```

**Kurálási szabályok (kiegyensúlyozott):** áttekintésben ~8–15 klaszter; fókuszban a
kiválasztott + max ~24–32 szomszéd (súly szerint rangsorolva); keresésben max ~60 találat.
A többi elem nem „eltűnik", hanem a rendererben lefokozódik/kimarad — a listában viszont
mindig lapozható a teljes találat.

---

## 6. A térkép — `atlasRenderer.js` + az újrahasznosított `constellation.js`

Két Canvas egymáson: alul az **ambient** particle-mező (`constellation.js`, `balanced`,
alacsony intenzitáson, hogy „éljen"), felül a **kurált térkép** (`atlasRenderer.js`),
ami a valódi csomópontokat/éleket/címkéket rajzolja, kezeli a kamerát és az interakciót.

**`atlasRenderer` publikus API:**

```js
const map = createAtlasRenderer(graphCanvas, {
  intensity: "balanced",
  reducedMotion: false,
  onHover: (id|null) => {},   // hit-test eredménye → selectionStore.hover
  onSelect: (id) => {}        // kattintás → selectionStore.select
});
map.setData({ nodes, edges, clusters });   // a getView(...) eredménye
map.setHighlight({ selectedId, hoverId }); // vizuális kiemelés (nem kamera!)
map.focusOn(id, { animate: true });        // kamera-tween a csomópont/klaszter köré
map.toOverview({ animate: true });         // kizoomol az áttekintésre (sólyom-nézet)
map.setLOD(level);                         // 0 domain / 1 topic / 2 document (auto zoomból is)
map.resize(); map.destroy();
```

**Semantic zoom / LOD.** Három szint: **L0** domének (kevés nagy címke, „csillagképek"),
**L1** altémák, **L2** dokumentumok. A zoom mértéke automatikusan vált szintet; a
szintváltás **crossfade** a címke/részlet-rétegen (`--duration-base`, `--ease-grow`),
sosem hirtelen. A világfa-metafora: lefelé haladva mélyülsz a hierarchiában.

**Kiegyensúlyozott vizuális paraméterek (kezdőértékek):**

| Paraméter | Érték | Megjegyzés |
|---|---|---|
| Látható csomópont-sapka | ≤ 150 | kurálás garantálja; efölött ne rajzolj |
| Csomópont-méret | súlyból, 4–18 px | doc-szám / authority alapján |
| Címke-megjelenítés | ütközés-budget + prioritás | súlyosabb/kijelölt előbb kap címkét |
| Él-fényerő | alap halvány `--border` | kijelölt szomszédság ~1.6× + `--accent` árnyalat |
| Kamera-tween | `--duration-slow`, `--ease-grow` | fit-to-bounds a célra |
| Hover hit-test | rács-alapú spatial index | ne O(n) minden `pointermove`-ra |
| DPR sapka | 2 | `Math.min(devicePixelRatio, 2)` |

**Színleképezés** (a tokenekből `getComputedStyle`-lel, nem beégetve): domén-csomópont
`--primary`, altéma `--secondary`, dokumentum `--text-muted`/`--surface` keret, személy
`--accent`; kijelölt `--primary` + `--focus-ring`-szerű glória; élek `--border`. Így a
térkép **témával vált**.

**Ambient élet.** A `constellation.js` mögötte fut `balanced`-en, de lefojtva (a login-
handoff `setMode("idle")`-jét használva), hogy a nem-fókuszált tér „lélegezzen", miközben
a kurált réteg éles és stabil marad. `reducedMotion` esetén az ambient statikus, a kamera-
tweenek rövid crossfade-re esnek.

**Renderelés.** Canvas 2D elég, mert kurálunk (≤150 látható csomópont) + LOD + culling
(csak a viewportba eső elemek). WebGL csak akkor, ha a látható szám tartósan nagyra nő —
most **ne** vezess be. Egyetlen rAF ciklus, particle-pool, nincs per-frame allokáció;
`stop()` a `visibilitychange`-re; `destroy()` takarít.

---

## 7. Kiválasztás & szinkron — `selectionStore.js`

Ez köti össze a két panelt, és ez adja a snap-mentes összhangot.

```js
const store = createSelectionStore(); // { hoverId, selectedId, query, filters }
store.subscribe((state, prev) => { /* atlasView + resultsList reagál */ });
store.setHover(id|null);   // lista-sor hover ↔ térkép csomópont-pulzálás (kétirányú)
store.select(id);          // térkép kamera-tween + lista görgetés/kiemelés
store.setQuery(text);      // keresés
store.setFilters(facets);  // facetek
```

Szinkron-szabályok:
- **Hover bármelyik panelen** → a másikban `--duration-fast` kiemelés (opacity/scale),
  sosem ugrás. A listasor `data-hover="true"`, a térkép csomópontja pulzál.
- **Kiválasztás** → a térkép `focusOn(id)` kamera-tweent játszik **és** a lista odagördül
  (`scrollIntoView({behavior:"smooth"})`), a sor `aria-selected="true"`.
- **Egy forrás** → a két panel sosem tud eltérni.

---

## 8. Nézet-állapotgép — `atlasMachine.js`

**Állapotok:** `loading` · `overview` · `focused` · `searching` · `empty` · `error`
**Kontextus:** `{ selectedId, query, filters, resultCount }`

| Aktuális | Esemény | Következő | Mellékhatás (a view játssza) |
|---|---|---|---|
| `loading` | `READY` | `overview` | belépő koreográfia; áttekintés kamera |
| `overview`/`focused`/`searching` | `SELECT(id)` | `focused` | `focusOn(id)` + lista kiemelés/görgetés |
| `focused` | `ZOOM_OUT` / `CLEAR` | `overview` | `toOverview()` + kijelölés törlése |
| bármely | `SEARCH(q)` | `searching` | találatok highlight, többi lefokoz + lista szűr |
| `searching` | `RESULTS_OK(n>0)` | `searching` | találatszám az élő régióba |
| `searching` | `RESULTS_OK(0)` | `empty` | üres állapot (rendszer empty-state minta) |
| `searching` | `CLEAR` | `overview` | vissza áttekintésre |
| bármely | `DATA_ERR` | `error` | **fallback: sima lista**, térkép elrejtve, alert |

**Minimál kontraktus** (mint a loginnál: ismeretlen esemény = no-op, nincs illegális ugrás):

```js
function createAtlasMachine({ onTransition }) {
  let state = "loading";
  const ctx = { selectedId: null, query: "", filters: {}, resultCount: null };
  const t = {
    loading:   { READY: () => "overview" },
    overview:  { SELECT: (id)=>(ctx.selectedId=id,"focused"), SEARCH:(q)=>(ctx.query=q,"searching"), DATA_ERR:()=>"error" },
    focused:   { SELECT:(id)=>(ctx.selectedId=id,"focused"), ZOOM_OUT:()=>(ctx.selectedId=null,"overview"),
                 CLEAR:()=>(ctx.selectedId=null,"overview"), SEARCH:(q)=>(ctx.query=q,"searching"), DATA_ERR:()=>"error" },
    searching: { RESULTS_OK:(n)=>(ctx.resultCount=n, n>0?"searching":"empty"),
                 SELECT:(id)=>(ctx.selectedId=id,"focused"), CLEAR:()=>(ctx.query="","overview"), DATA_ERR:()=>"error" },
    empty:     { SEARCH:(q)=>(ctx.query=q,"searching"), CLEAR:()=>(ctx.query="","overview") },
    error:     { RETRY:()=>"loading" }
  };
  function send(ev,p){ const n=t[state]?.[ev]?.(p); if(!n||n===state && ev!=="SELECT") return;
    const prev=state; state=n; onTransition(state,prev,{...ctx}); }
  return { send, get state(){return state;}, get context(){return {...ctx};} };
}
```

---

## 9. Adat-fokozatok (Tier 0/1/2) — a gráfadat elérhetőségétől függően

A térkép **fokozatosan gazdagszik**; a felület minden fokozaton működik.

- **Tier 0 — nincs valódi gráf, csak metaadat/címke/mappa.** Származtatott, könnyű gráf:
  csomópont = dokumentum; klaszter = mappa/kategória; él = **közös címke / közös szerző**
  együttes-előfordulásból. Az elrendezés klaszterezett (nem force-directed hairball). Ez
  már ad „csillagkép" élményt valódi kapcsolati adat nélkül is.
- **Tier 1 — explicit kapcsolatok** (hivatkozás, közös szerző/téma). Ezek valódi élek;
  a szomszédság és a fókusz-nézet pontosabb.
- **Tier 2 — embeddingek (szemantikus hasonlóság).** A csomópontok elhelyezése és a
  klaszterezés szemantikus; „hasonló témák egymás mellett", és a keresés szemantikus
  találatokat is highlightol. Ez a leggazdagabb élmény.

A `graphModel` `tier` kapcsolóval ugyanazt az API-t adja; az `atlasRenderer`/`atlasView`
nem tud a fokozatról. **Ha ma Tier 0 a valóság, azzal indíts** — a spec későbbi upgrade-et
nem igényel a nézet oldalán.

---

## 10. Koreográfia állapotonként (időzítés/görbe tokenből)

Csak `opacity`/`transform`/kamera animál; a hely fenntartva; a lista átrendezése **FLIP**-pel.

- **`loading` → belépés (`--duration-slower`, stagger):** ambient mező fade-in → a kurált
  áttekintés csomópontjai „kigyúlnak" és élek rajzolódnak → a domén-címkék beúsznak →
  a lista sorai staggerrel (`--duration-base`, ~40 ms). Végén `send("READY")`.
- **`overview → focused` (SELECT):** kamera-tween a célra (`--duration-slow`, `--ease-grow`,
  fit-to-bounds), közben LOD L0→L1/L2 crossfade; a lista a sorra gördül, `aria-selected`.
  **Nincs ugrás** — a kamera pozíció+zoom egyszerre eased.
- **`focused → overview` (ZOOM_OUT):** fordított kamera-tween, kijelölés-glória lecseng.
- **`* → searching` (SEARCH):** a nem-találatok `opacity`-ja lecsökken (nem törlődnek), a
  találatok kiemelődnek; a lista **FLIP**-pel átrendez (sorok elcsúsznak, nem bevágódnak);
  az élő régió kimondja a találatszámot.
- **Hover-szinkron:** `--duration-fast` kiemelés mindkét irányban (lásd 7.).
- **`empty`:** rendszer empty-state minta (`taltos-design-system.md`) fade-innel, cselekvő
  szöveggel („Nincs találat — próbálj tágabb kulcsszót, vagy kérdezd a Táltost").
- **`error`:** térkép elrejtése (fade-out), a **lista előtérbe** kerül teljes szélességen,
  `--danger` alert ikonnal + user-központú szöveggel; fókusz az alertre. „Próbáld újra" → `RETRY`.

---

## 11. Akadálymentesség & teljesítmény (kötelező floor)

- **A lista az a11y-elsődleges nézet:** teljes billentyűzet-navigáció (nyilak lépnek a
  `listbox`-ban, Enter kiválaszt, ez frissíti a térképet), `role="option"`/`aria-selected`,
  minden állapot kimondva az élő régióban. „Csak lista" kapcsoló elrejti a térképet.
- **Térkép billentyűzetről is:** Tab a HUD-ra (zoom-ki), Esc = `ZOOM_OUT`; a térkép nem
  lehet billentyűzet-csapda.
- `prefers-reduced-motion`: ambient statikus, kamera-váltás rövid crossfade, nincs
  particle-sodródás, LOD-váltás azonnali.
- Kontraszt ≥ 4.5:1 mindkét témában (tokenek tartják); kijelölés nem csak színnel (glória+
  `aria-selected`+lista-kiemelés).
- Teljesítmény: kurálás (≤150 látható) + LOD + viewport-culling + rács hit-test; lista
  **virtualizált**; egyetlen rAF; `stop()` rejtett fülre; `destroy()` a kezdőoldal
  elhagyásakor. Nagy adathalmaznál a `getView` webworkerbe kiszervezhető (opcionális).

---

## 12. Integrációs pontok a meglévő prototípusba

1. **A jelenlegi lista újrahasznosul.** A meglévő szűrős listát alakítsd `resultsList.js`-szé:
   a szűrők **facetekké** válnak, amelyek a `selectionStore.setFilters`-en át **egyszerre**
   szűrik a listát és fokozzák le a térképet. A lista marad a fallback.
2. **A térkép additív.** A `.atlas__stage` bal paneljét told a meglévő oldalra; ha nincs
   gráfadat, Tier 0-val indul, vagy „Csak lista" módban rejtve marad.
3. **Router/életciklus:** a `mount(container)` / `teardown()` a meglévő router
   nézetváltásához kötve; `teardown` hívja `map.destroy()` + `constellation.destroy()`.
4. **Dokumentum-megnyitás:** a sor/csomópont kiválasztása után a „megnyitás" a meglévő
   dokumentum-útvonalra navigál; ha van közös elem (a Táltos-jel / kártya), használható
   **shared-element folytonosság** (mint a loginnál), hogy a részletnézet ne „vágódjon be".
5. **Tokenek/fontok:** ha még nincsenek betöltve, a `taltos-design-system.md` 1–3. pontja
   szerint told be a `:root` blokkot és a `<link>`-et.

---

## 13. Nyitott kérdések / feltételezések (beépítés előtt tisztázd)

1. **Milyen kapcsolati adat van ma?** (→ Tier 0/1/2 döntés a 9. szerint.) Ez határozza meg,
   mennyire gazdag a térkép az induláskor. Alapfeltételezés: **Tier 0** (címke/mappa/szerző
   együttes-előfordulásból származtatott gráf), ha nincs más info.
2. **Van-e embedding-forrás** (szemantikus hasonlóság) most vagy tervben? (Tier 2 kapcsoló.)
3. **Mekkora a korpusz nagyságrendje?** Ha tízezres+ a dokumentumszám, a `getView`
   kiszámítását érdemes webworkerbe tenni és a listát szerveroldalon lapozni.
4. **A meglévő lista/szűrő komponens** mennyire adaptálható `resultsList.js`-szé (virtualizáció,
   billentyűzet-navigáció megvan-e)?
5. **Van-e közös elem a részletnézettel** a shared-element átmenethez? Ha nincs, egyszerű
   crossfade a fallback (továbbra is snap-mentes).

**Eldöntve — szűrés a térképen (2026-08-14).** A szűrőből kieső csomópont **nem tűnik el**,
hanem halvány üres karikaként (kitöltés és kategória-szín nélkül, `--text-subtle` körvonal)
a térképen marad, **inert** módon: nincs felirata, nem kattintható, nem hover-cél. Indok: az
eltüntetés minden szűrő-kattintásra átrendezi a befoglalót és a kamera-illesztést, azaz
elveszi a térbeli memóriát — pedig épp az az érték, hogy ugyanaz a dokumentum mindig ugyanott
van. A szűrő **kiemel**, nem újrarajzol. A renderer ehhez `setExcluded(ids)`-t kapott, ami
szándékosan ERŐSEBB háttérbe-tolás a `setDimmed`-nél (utóbbi — keresés nem-találatai, fókusz
szomszédságán kívüliek — kattintható marad, hogy a gráfban tovább lehessen lépni).
Részletek: `tudasbazis-prototype/NOTES.md`, 7. kör.

---

## 14. Elfogadási kritériumok (QA — kész előtt fusson végig)

- [ ] Nincs nyers hex/px a `home.css`-ben; minden érték `var(--…)`.
- [ ] Világos ↔ sötét téma működik `data-theme="dark"`-ra — **a térkép Canvas is vált**
      (tokent olvas); komponens-szintű dark-override nincs.
- [ ] **Soha nincs teljes gráf a képernyőn:** ≤150 látható csomópont, kurálás + LOD + culling.
- [ ] Térkép ↔ lista **egyetlen** kiválasztást tükröz; hover és select kétirányban szinkron.
- [ ] Egyetlen átmenet sem „snap": kamera-tween (`--ease-grow`), LOD-crossfade, lista-FLIP;
      a layout nem ugrik (helyek fenntartva).
- [ ] Az FSM ismeretlen/kései eseményt no-opként nyel el; nincs illegális állapot.
- [ ] Keresés: találatszám az élő régióban; 0 találatnál `empty` minta; hiba esetén
      **fallback sima listára** + `--danger` alert, fókusz odakerül.
- [ ] `prefers-reduced-motion`: statikus ambient, rövid crossfade-ek, nincs particle-sodródás.
- [ ] Lista teljesen billentyűzettel kezelhető, `role="listbox"`/`option`, `aria-selected`,
      élő régió; „Csak lista" mód elrejti a térképet és önmagában használható.
- [ ] 900px alatt a lista az elsődleges (térkép fölé/alá rendezve); 360px-ig működik.
- [ ] `visibilitychange`-re a rAF megáll; a kezdőoldal elhagyásakor `destroy()` takarít.
- [ ] Tier 0 adattal is működik (származtatott gráf); Tier 1/2 upgrade nem igényel
      nézet-oldali átírást.

---

### Kapcsolódó fájlok
`CLAUDE.md` · `taltos-design-system.md` · `taltos-design-tokens.json` ·
`taltos-design-system.html` (vizuális referencia) · `taltos-login-handoff.md`
(az újrahasznosított `constellation.js` motor forrása)
