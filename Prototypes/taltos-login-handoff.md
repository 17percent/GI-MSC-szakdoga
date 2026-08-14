# Táltos — Bejelentkező felület · Fejlesztői átadó (integrációs spec)

> **Kinek szól:** annak a fejlesztő agentnek, aki egy **már elkezdett, könyvtár nélküli
> (vanília HTML/CSS/JS) prototípusba** építi be ezt a bejelentkező élményt.
> **Cél:** egy „élő", reaktív login-képernyő élő tudásgráf-háttérrel és
> **determinisztikus, snap-mentes** állapotátmenetekkel. Belépés: **kizárólag
> Google + Microsoft AD (Entra ID)**. Háttérintenzitás: **kiegyensúlyozott**.
> **Kötöttség:** semmilyen külső futásidejű könyvtár (nincs framework, nincs
> animációs lib). Canvas 2D + Web Animations API (WAAPI) + saját állapotgép.

---

## 0. Olvasd el ELŐSZÖR (nem duplikáljuk itt)

A vizuális értékeket **nem** ismételjük meg ebben a dokumentumban. Mielőtt egyetlen
sort írnál, tartsd a projekt `CLAUDE.md` munkafolyamatát:

1. `taltos-design-system.md` — token-hatékony referencia. Innen jön a paste-ready
   `:root` tokenblokk, a `[data-theme="dark"]` remap, a komponens-receptek (gomb,
   input, alert stb.) és a szabályok. **Csak szemantikus tokent használj.**
2. `taltos-design-tokens.json` — ha programozottan kell tokenérték.
3. `taltos-design-system.html` — vizuális referencia, ha kételyed van egy komponensben.

**Aranyszabály (a `CLAUDE.md`-ből):** komponens-CSS-ben nincs nyers hex/px, csak
`var(--…)`; a téma a szemantikus rétegből jön, komponens-szintű dark-override nélkül;
`prefers-reduced-motion` és látható fókusz kötelező. Az itteni CSS-példák is ezt követik.

---

## 1. Architektúra — három független modul

A feladat három, egymástól lazán csatolt részre bomlik. Ezt a szeparációt tartsd meg,
mert ez teszi tesztelhetővé és a meglévő prototípusba illeszthetővé.

| Modul | Felelősség | Nem felelőssége |
|---|---|---|
| `constellation.js` | Az élő Canvas-háttér: rajzolás, sodródás, kurzorreakció, „konvergálás". Vezérelhető állapottal/intenzitással. | Nem tud az authról; nem módosít DOM-ot a saját `<canvas>`-án kívül. |
| `authMachine.js` | Az explicit állapotgép (FSM): állapotok, események, átmenetek. **Ez a determinizmus forrása.** | Nem animál, nem rajzol; csak állapotot vált és eseményt közöl (`onTransition`). |
| `loginView.js` | A DOM felépítése/összekötése + a koreográfia: minden állapotátmenetnél lejátssza a WAAPI/CSS animációt, és vezérli a `constellation`-t. | Nem tartalmaz üzleti logikát; a „mi a következő állapot" kérdést az FSM dönti el. |

Adatfolyam: `loginView` felhasználói eseményt küld az `authMachine`-nek → az FSM
átmenetet számol → `onTransition(state, prev)` visszahív → `loginView` **lejátssza a
belépő/kilépő koreográfiát**, és beállítja a `constellation` módját. A háttér és a
kártya sosem „ugrik": mindig egy megnevezett átmenet animálja.

Javasolt fájlelhelyezés a meglévő prototípusban (igazítsd a repo konvenciójához):

```
/login
  constellation.js     // Canvas háttér, publikus API-val
  authMachine.js       // FSM (nincs DOM-függés)
  loginView.js         // mount(), teardown(), koreográfia
  login.css            // csak szemantikus tokenekre épülő stílusok
  login.config.js      // OAuth kliens-azonosítók PLACEHOLDER-ei (lásd 6.)
```

---

## 2. DOM-váz (markup)

A gyökér egy `data-state` attribútumot hordoz — ezt az `authMachine` állapota
vezérli, és a CSS/koreográfia erre horgonyoz. A `<canvas>` a legalsó réteg,
`aria-hidden`, mert tisztán dekoratív.

```html
<section class="login" data-state="loading" aria-label="Bejelentkezés">
  <canvas class="login__field" aria-hidden="true"></canvas>

  <div class="login__card" role="group" aria-labelledby="login-title">
    <div class="login__mark" data-mark aria-hidden="true"><!-- világfa SVG --></div>
    <p class="login__eyebrow">Kollektív emlékezet</p>
    <h1 class="login__title" id="login-title">Lépj a küszöbön át</h1>
    <p class="login__lead">A szervezet emlékezete vár. Válaszd a belépés módját.</p>

    <div class="login__actions">
      <button class="btn btn--outline login__provider" data-provider="google" type="button">
        <span class="login__logo" data-logo="google" aria-hidden="true"><!-- Google G SVG --></span>
        <span class="login__provider-label">Folytatás Google-fiókkal</span>
      </button>
      <button class="btn btn--outline login__provider" data-provider="microsoft" type="button">
        <span class="login__logo" data-logo="microsoft" aria-hidden="true"><!-- MS 4-négyzet SVG --></span>
        <span class="login__provider-label">Bejelentkezés Microsoft-fiókkal</span>
      </button>
    </div>

    <div class="login__status" role="status" aria-live="polite"><!-- FSM tölti fel --></div>
  </div>
</section>
```

Megjegyzések:
- A providerlogók **hivatalos** jelek legyenek (Google „G", Microsoft négy-négyzet),
  a saját brand-irányelvük szerint. A gombhéj a rendszer `.btn--outline` receptje
  (`--surface`, `1px --border-strong`, `--radius-md`), min. 48px magas célfelület, hogy
  a színes logók kiemelkedjenek.
- A `role="status"` + `aria-live="polite"` élő régió mondja ki a „Kapcsolódás…" és a
  hibaüzeneteket képernyőolvasónak — a látvány sosem az egyetlen jelentéshordozó.

---

## 3. Elrendezés & réteg-CSS (kivonat — csak tokenekkel)

A rétegsorrend és a parallaxis-horgonyok. A gomb/alert stílust **ne** írd újra; a
`taltos-design-system.md` komponens-receptjeit használd.

```css
.login {
  position: relative; min-height: 100dvh; display: grid; place-items: center;
  padding: var(--space-8); background: var(--bg); overflow: hidden;
}
.login__field {                 /* Canvas — legalsó réteg */
  position: absolute; inset: 0; width: 100%; height: 100%; z-index: var(--z-base);
}
.login__card {
  position: relative; z-index: var(--z-raised); width: 100%; max-width: 420px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
  padding: var(--space-10) var(--space-8);
  /* parallaxis-eltolás JS-ből: */ transform: translate3d(var(--px,0), var(--py,0), 0);
}
.login__eyebrow { font: var(--weight-semibold) var(--text-xs)/1 var(--font-body);
  text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--text-subtle); }
.login__title { font: var(--weight-semibold) var(--text-4xl)/var(--leading-tight) var(--font-display);
  letter-spacing: var(--tracking-tight); color: var(--text); margin: var(--space-3) 0 var(--space-2); }
.login__lead { color: var(--text-muted); margin-bottom: var(--space-8); }
.login__actions { display: flex; flex-direction: column; gap: var(--space-3); }
.login__provider { width: 100%; height: 48px; justify-content: flex-start; gap: var(--space-3); }
.login__status { min-height: var(--space-6); margin-top: var(--space-5); } /* HELY FENNTARTVA — lásd „nincs snap" */
```

**A „nincs snap" első szabálya itt:** a `.login__status` és minden állapotfüggő elem
**előre lefoglalt helyet** kap (`min-height`), hogy megjelenéskor semmi ne told el
mást. Állapotváltáskor `opacity`/`transform` animál, sosem `display`-ugrás.

---

## 4. Az élő háttér — `constellation.js` spec

Egy önálló Canvas 2D modul. Csomópontok (tudáspontok) lassan sodródnak, közeli
párokat halvány él köt össze, időnként fényimpulzus fut végig egy élen. A kurzor
közelében a pontok felragyognak, és vékony vonal húzódik hozzájuk. `connecting`
állapotban a mező a kártya közepe felé **konvergál**.

**Publikus API (implementáld pontosan így, hogy a `loginView` vezérelni tudja):**

```js
const field = createConstellation(canvasEl, {
  intensity: "balanced",   // "calm" | "balanced" | "vivid"  → most: "balanced"
  reducedMotion: false     // a hívó adja át a media-query eredményét
});
field.start();                       // rAF ciklus indítása
field.stop();                        // ciklus leállítása (fül elrejtve / teardown)
field.setMode("idle");               // "idle" | "converge" | "ascend" | "settle"
field.setPointer(x, y);              // px a canvas koordinátában (null = elhagyta)
field.setParallaxTarget(nx, ny);     // -1..1 normalizált, a kártya parallaxishoz is
field.resize();                      // DPR + méret újraszámítás
field.destroy();                     // listener-ek + rAF felszabadítása
```

**Kiegyensúlyozott (`balanced`) paraméterek — kezdőértékek:**

| Paraméter | Érték | Megjegyzés |
|---|---|---|
| Csomópontszám | `min(90, floor(w*h / 15000))` | asztali cél ~70–90; mobil sapka ~40 |
| Sodródási sebesség | 8–14 px/s, véletlen irány | lassú „lélegzés" |
| Él-küszöbtávolság | 130 px | efölött nincs vonal két pont közt |
| Max él / csomópont | 5 | túlzsúfoltság ellen |
| Kurzor-hatósugár | 160 px | ezen belül fénylik + vonal a kurzorhoz |
| Kurzorvonal max | 4 | a legközelebbi néhány ponthoz |
| Impulzus gyakoriság | 2.5–4 s-enként 1 él | fény végigfut az élen (`--accent`) |
| DPR sapka | 2 | `Math.min(devicePixelRatio, 2)` |
| Parallaxis-eltolás | csomópontok ±6 px, kártya ±10 px | rétegenként eltérő = mélység |

**Színleképezés (a tokenekből olvasd ki `getComputedStyle`-lel, ne égesd be):**
csomópont-kitöltés súlyozottan `--primary` (60%), `--secondary` (30%), `--accent` (10%),
0.5–0.85 alfa; élek `--border` alacsony alfával; impulzus `--accent`. Így a háttér
**témával együtt vált** (világos/sötét), mert a tokeneket olvassa.

**Módok viselkedése:**
- `idle` — alap sodródás + kurzorreakció.
- `converge` — a sebességvektorokra rájátszik egy gyenge vonzás a canvas közepe (kártya)
  felé; az élek fényereje ~1.4×; az impulzusok befelé indulnak. Ezt a `connecting`
  állapot kapcsolja be.
- `ascend` — a `redirecting`-hez: egy felfelé haladó fénysáv söpör át a mezőn (a
  „világfán felfelé"), a pontok enyhén felfelé driftelnek.
- `settle` — a `error`-hoz: a vonzás megszűnik, a fényerő lecseng, a mező elcsendesedik.

**`reducedMotion: true` esetén:** ne indíts rAF-ciklust. Rajzolj **egy** statikus,
kiegyensúlyozott csillagképet (pontok + élek, impulzus és sodródás nélkül), a kurzor-
és parallaxisreakció kikapcsolva. A `setMode` ilyenkor csak a fényerőt/alfát állítja
egy azonnali (animáció nélküli) újrarajzolással.

**Teljesítmény:** egyetlen rAF ciklus; kerüld a per-frame allokációt (particle-pool,
előre lefoglalt tömbök); `stop()` a `visibilitychange`-re, ha a fül háttérben; a
kurzor-eseményt `pointermove`-ból mintavételezd (nem minden eseményre számolj újra
teljes szomszédságot).

---

## 5. Az állapotgép — `authMachine.js` spec

Ez adja a determinizmust: minden felületi állapot **meg van nevezve**, és csak
definiált eseményre, definiált átmenettel változik. Nincs „valahol a kódban egy
`if`, ami átvált" — minden átmenet itt, egy helyen él.

**Állapotok:** `loading` · `idle` · `connecting` · `redirecting` · `error`
**Kontextus:** `{ provider: "google"|"microsoft"|null, error: string|null }`

| Aktuális | Esemény | Következő | Mellékhatás (a view játssza le) |
|---|---|---|---|
| `loading` | `READY` | `idle` | belépő koreográfia lefutott, gombok élők |
| `idle` | `SELECT(provider)` | `connecting` | gomb morph + `converge` mód |
| `connecting` | `CONNECT_OK` | `redirecting` | `ascend` mód + kártya felúszik/halványul |
| `connecting` | `CONNECT_ERR(msg)` | `error` | `settle` mód + alert becsúszik, fókusz rá |
| `redirecting` | *(elnavigál)* | — | valódi OAuth redirect (lásd 6.) |
| `error` | `RETRY` | `idle` | alert kicsúszik, gomb visszaáll, `idle` mód |
| `connecting` | `CANCEL` | `idle` | (opcionális) megszakítás visszafelé |

**Minimál kontraktus (vanília, keret nélkül):**

```js
function createAuthMachine({ onTransition }) {
  let state = "loading";
  let context = { provider: null, error: null };
  const transitions = {
    loading:   { READY: () => "idle" },
    idle:      { SELECT: (p) => (context.provider = p, "connecting") },
    connecting:{ CONNECT_OK: () => "redirecting",
                 CONNECT_ERR: (m) => (context.error = m, "error"),
                 CANCEL: () => (context.provider = null, "idle") },
    error:     { RETRY: () => (context.error = null, "idle") }
  };
  function send(event, payload) {
    const next = transitions[state]?.[event]?.(payload);
    if (!next || next === state) return;      // ismeretlen esemény = no-op (nincs illegális ugrás)
    const prev = state; state = next;
    onTransition(state, prev, { ...context });  // a view innen koreografál
  }
  return { send, get state(){ return state; }, get context(){ return { ...context }; } };
}
```

Fontos: **ismeretlen esemény = no-op**, nem dob és nem ugrik érvénytelen állapotba.
Ez zárja ki a „random snap"-et is: ha egy késői kattintás `connecting` közben érkezik,
az FSM egyszerűen elnyeli.

---

## 6. Auth integráció (Google + Microsoft AD)

Az OAuth **átirányítással** működik — a mi oldalunk **sosem** kér jelszót vagy kezel
hitelesítő adatot; a hitelesítés a providernél történik. Ez egyben a helyes és
biztonságos minta.

- **Microsoft AD / Entra ID:** `@azure/msal-browser` (MSAL.js), `loginRedirect()`.
  Ha a „könyvtár nélküli" megkötés az MSAL-t is tiltja, alternatíva a nyers OAuth2
  Authorization Code + PKCE redirect kézzel az Entra `authorize` végpontjára — de az
  MSAL erősen ajánlott a token-életciklus miatt; egyeztesd a projektgazdával (lásd 9.).
- **Google:** Google Identity Services (GIS) redirect flow.

**Konfiguráció — PLACEHOLDER, titkot ide ne írj, environmentből jöjjön:**

```js
// login.config.js  — értékek build-időből / env-ből, NE commitold a valódit
export const AUTH = {
  google:    { clientId: "<GOOGLE_CLIENT_ID>", redirectUri: "<APP_ORIGIN>/auth/callback" },
  microsoft: { clientId: "<ENTRA_APP_CLIENT_ID>", tenantId: "<ENTRA_TENANT_ID>",
               redirectUri: "<APP_ORIGIN>/auth/callback" }
};
```

**A folyamat és az animáció összekötése (ez adja a „folyékony" hand-offot):**

1. `SELECT(provider)` → FSM `connecting` → a view lejátssza a gomb-morphot és a
   `converge` háttért. A providerhívás **előkészítése** (MSAL/GIS init) itt indul.
2. Amikor a redirect indítható, a view egy **minimum megjelenítési időt** tart
   (`--duration-slow`, ~400 ms), hogy a `connecting` koreográfia ne villanjon el —
   `Promise.all([providerReady, minDelay])`. Csak ezután `send("CONNECT_OK")`.
3. `redirecting` → `ascend` háttér + kártya felúszik → **majd** hívd a valódi
   `loginRedirect()` / GIS redirectet. A böngésző elnavigál; a felúszó animáció a
   navigáció előtti utolsó képkocka.
4. **Callback-útvonal** (`/auth/callback`): a visszatérő oldal a belépő koreográfiát
   **fordítva** játssza (fény lefelé, kártya vissza), majd — ha a meglévő prototípus
   engedi — **shared-element folytonossággal** viszi tovább a Táltos-jelet az app
   fejlécébe (közös `data-mark` elem/`view-transition`), hogy az app ne „vágódjon be".
5. Hiba (a provider elutasít / hálózat) → `CONNECT_ERR(üzenet)` → `error`.

**Hibaüzenet-leképezés** a Táltos hangján, a `--danger` alerttel (ikonnal, nem csak
színnel), user-központú szöveggel: pl. „Nem sikerült kapcsolódni a Microsoft-fiókhoz.
Próbáld újra, vagy válassz másik belépést." — sosem nyers hibakód a felületen.

---

## 7. Koreográfia állapotonként (időzítés/görbe tokenből)

Minden érték a design tokenekből: időtartam `--duration-fast|base|slow|slower`,
görbe `--ease-grow` (alap), `--ease-exit` kilépéshez. WAAPI-val (`element.animate`)
vagy `data-state`-hez kötött CSS-transitionnel. Csak `opacity`/`transform` animál
(kompozit-barát), a hely mindig fenntartva.

- **`loading` → belépés (`--duration-slower`, stagger):** kontúr/mező fade-in → a
  `constellation` pontjai kigyúlnak és élek rajzolódnak → `[data-mark]` világfa „kinő"
  (path-scale/stroke) → kártya `translateY(12px)→0` + fade → szövegek egymás után
  (`--duration-base`, ~60 ms stagger). A végén `send("READY")`.
- **`idle`:** ambient mező + kurzorreakció; kártya parallaxisa a `pointermove`
  normalizált értékéből (`--px/--py`, max ±10 px), `--ease-standard`-del simítva.
- **Hover gomb:** `translateY(-2px)` + logó `scale(1.04)`, `--duration-fast`; opcionális
  fényhullám a mező közeli élein a gomb felé (a `constellation` egy `pulseToward(x,y)`
  hívásával, ha implementálod).
- **`connecting`:** a kattintott gomb felirata átúszik „Kapcsolódás a Google-höz…"/
  „…a Microsofthoz…"-ra (crossfade, `--duration-base`), a gombon determinált ív telik
  meg (`--ease-grow`); a másik gomb `opacity:.5` + `disabled`; háttér `converge`.
- **`redirecting`:** kártya `translateY(-16px)` + fade-out (`--duration-slow`,
  `--ease-exit`), háttér `ascend`. Utána a valódi redirect.
- **`error`:** háttér `settle`; a gomb visszaalakul (`--duration-base`); az alert
  `translateY(8px)→0` + fade-in `--ease-grow`-val, és a fókusz az alertre/„Próbáld
  újra" gombra kerül.

---

## 8. Akadálymentesség & teljesítmény (kötelező floor)

- `prefers-reduced-motion: reduce`: a `constellation` statikus (lásd 4.); az
  állapotátmenetek rövid crossfade-re esnek vissza (nincs úsztatás/parallaxis). Ezt a
  media-queryt **JS-ből is** figyeld (a Canvas nem CSS), és add át a modulnak.
- Fókusz: valódi `<button>`-ök, látható `:focus-visible` (`--focus-ring`); a fókusz
  logikus sorrendben mozog; hibánál a fókusz az élő régióhoz/alerthez ugrik.
- Élő régió (`aria-live="polite"`) mondja ki a „Kapcsolódás…" és a hibaüzenetet.
- Kontraszt ≥ 4.5:1 a szövegre mindkét témában (a tokenek ezt tartják).
- `constellation.stop()` a `visibilitychange`-re (rejtett fül); `destroy()` a login
  elhagyásakor — nincs szivárgó rAF/listener.

---

## 9. Integrációs pontok & nyitott kérdések (a beépítés előtt tisztázd)

A meglévő prototípusról ezeket **erősítsd meg**, mielőtt kódot írsz:

1. **Mi a prototípus jelenlegi kerete és routere?** Ha van kliensoldali router, a
   `mount(container)` / `teardown()` életciklust ahhoz kösd; a callback-útvonal
   (`/auth/callback`) kezelése hol él ma?
2. **Engedélyezett-e az MSAL/GIS** a „könyvtár nélküli" megkötés mellett? Ezek nem
   UI-libek, de külső csomagok. Ha nem, a nyers OAuth2 + PKCE redirectre állunk (több
   meló, de működik). — Döntést kérünk.
3. **Van-e már provider app-regisztráció?** (Google OAuth kliens; Entra app + tenant
   ID + engedélyezett redirect URI-k.) Ezek nélkül a folyamat nem tesztelhető
   végponttól végpontig; a placeholderek helyére valódi env-értékek kellenek.
4. **Van-e app-fejléc, amibe a Táltos-jel átúszhat** (shared-element folytonosság)?
   Ha nincs közös elem/`view-transition`, a sikeres belépés utáni átmenet egyszerű
   crossfade-re esik vissza (még mindig snap-mentes, csak nincs jel-folytonosság).
5. **Tokenek betöltése:** a `:root` blokk és a fontok `<link>`-je már jelen van a
   prototípusban? Ha nem, a `taltos-design-system.md` 1–3. pontja alapján told be.

## 10. Elfogadási kritériumok (QA — kész előtt fusson végig)

- [ ] Nincs nyers hex/px a `login.css`-ben; minden érték `var(--…)`.
- [ ] Világos ↔ sötét téma működik `data-theme="dark"`-ra — **a Canvas háttér is vált**,
      mert tokent olvas; komponens-szintű dark-override nincs.
- [ ] Egyetlen állapotátmenet sem „snap": minden váltás megnevezett WAAPI/CSS
      koreográfiával fut; a layout nem ugrik (helyek fenntartva).
- [ ] Az FSM ismeretlen/kései eseményt no-opként nyel el (nincs illegális állapot).
- [ ] `connecting`-ben van minimum megjelenítési idő; a koreográfia nem villan el a
      redirect előtt.
- [ ] Mindkét provider elindítja a valódi redirectet; hiba esetén `--danger` alert
      ikonnal + user-központú szöveggel, fókusz odakerül.
- [ ] `prefers-reduced-motion`: statikus mező, rövid crossfade-ek, nincs parallaxis.
- [ ] Billentyűzettel teljesen kezelhető, látható fókusz; élő régió kimondja az
      állapotokat.
- [ ] 360px-ig működik; mobilon csökkentett részecskeszám, parallaxis ki.
- [ ] `visibilitychange`-re a rAF megáll; a login elhagyásakor `destroy()` takarít.

---

### Kapcsolódó fájlok
`CLAUDE.md` · `taltos-design-system.md` · `taltos-design-tokens.json` ·
`taltos-design-system.html` (vizuális referencia)
