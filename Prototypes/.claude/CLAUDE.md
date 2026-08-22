# CLAUDE.md — Táltos projekt

Ez a projekt a **Táltos** szervezeti tudásplatform. A termék koncepciója: a tudás
őrzője, összekapcsolója, értelmezője és útmutatója. Minden felület ezt a szellemet
viszi tovább — megőriz, összeköt, továbbad.

---

## ⚠️ Legfontosabb szabály: prototípus = design system megfelelőség

**Bármilyen UI-t vagy prototípust készítesz (HTML, React, vázlat, mockup, „gyors demó”),
kötelező a Táltos Design Systemhez igazodnod.** Ez nem opcionális, és a „csak prototípus”
nem mentesít alóla. Egy nem megfelelő prototípus rosszabb, mint a semmi: hamis vizuális
nyelvet rögzít, amit később nehéz visszabontani.

A megfelelőség konkrétan azt jelenti, hogy **minden vizuális érték a design tokenekből
származik**, és a felület a rendszer komponens-receptjeit követi.

---

## Kötelező munkafolyamat UI/prototípus előtt

Minden alkalommal, mielőtt egyetlen sor felületi kódot írnál, ezt a sorrendet tartsd:

1. **Olvasd fel:** `taltos-design-system.md`. Ez a token-hatékony, agent-optimalizált
   referencia — tartalmazza a paste-ready `:root` tokenblokkot, a sötét téma remapet,
   a komponens-recepteket és a szabályokat. **Ez az elsődleges forrás.**
2. **Szükség esetén:** `taltos-design-tokens.json` — ugyanezek a tokenek strukturáltan,
   build-tooling / programozott felhasználás céljából (Style Dictionary-barát).
3. **Vizuális referenciaként:** `taltos-design-system.html` — a teljes, renderelt rendszer.
   Nézd meg, hogyan néznek ki a komponensek élőben, ha kételyed van.
4. **Építés:** illeszd be a `:root` (és a `[data-theme="dark"]`) tokenblokkot, majd építs
   **kizárólag szemantikus tokenekkel**. Kövesd a komponens-recepteket.
5. **Ellenőrzés:** futtasd le a lenti megfelelőségi checklistet, mielőtt kész-nek nyilvánítod.

> Ha nem fér hozzá mindhárom fájl, a `taltos-design-system.md` önmagában elegendő
> egy megfelelő prototípushoz. A JSON és a HTML kiegészítő.

---

## A rendszer alapelvei (röviden)

- **Kétréteg.** primitív (nyers érték) → szemantikus (jelentés). Komponens csak a
  szemantikus réteget látja: `var(--primary)`, `var(--surface)`, `var(--space-4)`.
- **Téma ingyen jár.** Csak szemantikus tokent használva a világos↔sötét téma
  automatikus a `data-theme="dark"` attribútummal. Komponensre soha ne írj külön sötét stílust.
- **Tokenekből minden.** Szín, betűméret, térköz, sugár, árnyék, mozgás, z-index — mind skálából.
- **Hang.** Cselekvő, felhasználó-központú, segítő. Nincs misztikus/„varázsló” narratíva
  és nincs rendszer-zsargon a felületen.
- **Fontok:** Fraunces (display, csak címben) · Inter (törzs + UI) · JetBrains Mono (adat).
  Betöltő `<link>` a `taltos-design-system.md` 1. pontjában.

---

## Prototípus-megfelelőségi checklist (build után KÖTELEZŐ)

- [ ] **Nincs nyers érték.** Komponens-CSS-ben nincs hex vagy px — csak `var(--…)`.
- [ ] **Csak szemantikus token.** Primitív rampát (`--green-600`) közvetlenül nem hivatkozol.
- [ ] **Téma működik.** `data-theme="dark"` váltásra minden helyes, komponens-override nélkül.
- [ ] **Fókusz.** Minden interaktív elemen látható `:focus-visible` (`--focus-ring`).
- [ ] **Kontraszt.** Szöveg ≥ 4.5:1 (nagy szöveg ≥ 3:1) mindkét témában.
- [ ] **Nem csak szín.** Státusz/jelentés ikonnal vagy felirattal is jelölt.
- [ ] **Tipográfia.** Display font csak címben; törzs Inter; adat mono; skálából méretezve.
- [ ] **Ritmus.** Térköz/sugár/árnyék a skálából; olvasható szöveg ≤ 70ch; tartalom ≤ 1120px.
- [ ] **Reszponzív.** Működik 360px-ig; `prefers-reduced-motion` tisztelve.
- [ ] **Szöveg.** Cselekvő, felhasználó-központú; nincs zsargon, nincs misztikum.

Ha bármelyik pont bukik, javítsd ki, mielőtt átadod.

---

## Gyakori hibák, amiket kerülj

- Nyers hex/px „csak most az egyszer”. → Mindig token.
- Külön `.dark` variáns egy komponensre. → A szemantikus token intézi.
- Display (Fraunces) font törzsszövegben. → Csak címben.
- Hideg, szürke `box-shadow`. → A rendszer árnyékai melegek (barnás); használd a `--shadow-*` tokeneket.
- Jelentés kizárólag színnel. → Kísérd ikonnal/felirattal.
- Abszolút pozicionált háttér-SVG, amit egy `*`-alapú szabály visszatol a flow-ba. → Zárd ki a háttérréteget (`:not(...)`), különben üres helyet nyit.
- **Egy osztály felülírná az elem+attribútum alapreceptet.** `input[type="search"]` (0,1,1) **erősebb**, mint `.sajat-input` (0,1,0), így a recept `padding` shorthandje visszaírja a te `padding-left`-edet — az ikon ráül a placeholderre. → Emeld a specificitást (`.wrapper .sajat-input`), ne `!important`-tal told át.
- Konténer-padding kinullázása „full-bleed" tartalomhoz úgy, hogy a fejléc is a konténer gyermeke. → A fejlécnek külön add vissza a térközt, különben a cím a sidebar szegélyéhez tapad.
- **`position:fixed` popover `backdrop-filter`/`filter`/`transform`-os szülő alatt.** Ezek **containing blockot** csinálnak a fixed leszármazottnak, így a panel a SZÜLŐ boxához igazodik, nem a viewporthoz — a `getBoundingClientRect()` koordinátái viszont viewport-alapúak, tehát a panel elcsúszik. → Portálozd a panelt a `<body>`-ba (és utána kézzel kezeld a kívülre-kattintást, az Escape-et és a `destroy()`-t).
- Folklorisztikus/fantasy vizuál (agancs, sámándob, rovásírás-giccs). → Kerüld; a rendszer visszafogott és professzionális.

---

## Fájlok

| Fájl | Szerep | Mikor |
|---|---|---|
| `taltos-design-system.md` | Agent-optimalizált, token-hatékony referencia | **Minden UI/prototípus előtt felolvasni** |
| `taltos-design-tokens.json` | Strukturált tokenek build-toolinghoz | Programozott felhasználáskor |
| `taltos-design-system.html` | Teljes renderelt rendszer | Vizuális referenciaként |
| `CLAUDE.md` | Ez a fájl — operatív szabályok | Mindig érvényes |
