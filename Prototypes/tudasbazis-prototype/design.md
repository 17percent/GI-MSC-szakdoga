# Design — Tudásbázis prototípus

Zárolt design system ehhez az alkalmazáshoz (Hallmark · redesign, 2026-07-19).
Minden későbbi felület-módosítás ezt a fájlt olvassa kód-emitálás előtt.
Nem oldalanként újragenerálandó — ha a rendszernek nőnie kell, ezt a fájlt kell bővíteni.

## Genre

modern-minimal (Cobalt regiszter: hűvös, műszerfal-szerű, kontrasztos)

## Macrostructure family

Alkalmazás-felület (app-scope) — a marketing-macrostruktúrák nem értelmezettek.

- App-váz: Workbench (fix oldalsáv + fejléces munkaterület; csak a `.scroll-area`
  konténerek görgetnek, az oldal soha)
- Login: egyetlen középre zárt kártya
- Tartalom (markdown olvasó/előnézet): tipográfia-vezérelt, enrichment nélkül

## Theme — Cobalt (light + dark)

A teljes token-készlet a `tokens.css`-ben él; a fő horgonyok:

| Token | Light | Dark |
|---|---|---|
| `--color-paper` (kártya) | `oklch(98% 0.005 250)` | `oklch(21% 0.016 256)` |
| `--color-paper-2` (oldal) | `oklch(95.2% 0.008 250)` | `oklch(15.5% 0.013 256)` |
| `--color-ink` | `oklch(20% 0.028 262)` | `oklch(93% 0.008 255)` |
| `--color-accent` | `oklch(49% 0.21 262)` | `oklch(67% 0.17 262)` |
| `--color-focus` | `oklch(56% 0.19 262)` | `oklch(72% 0.16 262)` |

Szabályok:
- A horgony-hue (~250–262, kobalt) módok közt NEM változik — csak L és C mozdul.
- Sötét módban az eleváció világosít (magasabb felület = +3–5% L), az akcent
  világosabb és kevésbé telített.
- Egyetlen akcent; az akcent jelölőeszköz (aktív nav, fókuszgyűrű, primér gomb,
  aktív fül), nem háttérszín. Nincs tiszta #000 / #fff sehol.
- Minden színérték nevesített token — inline hex/oklch a komponens-CSS-ben tilos.

## Typography

- Display: Space Grotesk, 600–700, normal (soha nem italic) — címek, brand,
  dokumentumcímek, kártya-címek. Tracking: −0.015…−0.025em.
- Body: Inter, 400–600.
- Mono: JetBrains Mono, 400–500 — hash, repo-út, frontmatter, kódblokk,
  panel-címkék (uppercase, +0.08em tracking), git-státusz.
- Betöltés: Google Fonts `<link>` az index.html-ben.

## Spacing

4 pontos skála (`--space-3xs` … `--space-xl`) a tokens.css-ben.
Komponensek nevesített tokent használnak, nyers px-t nem (kivétel: 1px vonalak).

## Rádiuszok

`--radius-input: 6px` (gombok, inputok, jelvény-doboz) · `--radius-card: 10px`
(kártyák, panelek) · `--radius-pill: 999px` (címkék, chipek, userchip, toast).

## Motion *(bővítve — 3. kör: fluid UX)*

- Easingek: `--ease-out` (belépő) · `--ease-in` (kilépő) · `--ease-in-out` (állapotváltás).
  Időtartamok: `--dur-short: 160ms` (hover/fókusz) · `--dur-med: 260ms` (modal, nézet-belépés)
  · `--dur-toast: 400ms`. Kilépés mindig a belépés ~60–75%-a.
- Csak `transform` és `opacity` (+ szín/árnyék-átmenetek) animálódik; layout-tulajdonság soha.
- **Egyetlen komponált belépés:** route- vagy fülváltáskor a tartalmi konténer
  (`.view-enter`) 8px-es fade+slide-dal érkezik — szűrés/gépelés közbeni újra-render
  NEM indítja újra. Scroll-triggerelt reveal továbbra sincs.
- Téma-váltáskor 260ms-os szín-áttűnés (`html.theme-anim`, JS kapcsolja fel/le).
- `prefers-reduced-motion: reduce` → minden átmenet ≤1ms.
- A fókuszgyűrű megjelenése SOHA nem animált.

## Microinteractions stance *(bővítve — 3. kör)*

- Csendes siker; ünneplő animáció soha.
- Gomb: hover = −1px emelés + árnyék (160ms) · active = +1px lenyomás (100ms) · disabled = 45% opacitás.
- Kártyák (doc-row, create-card): hover = −2px emelés + `--shadow-lift` + akcent-keret.
- Szövegmezők: fókuszra a keret akcentre vált + 3px puha gyűrű úszik be (200ms) — a mező „életre kel", mielőtt gépelnél.
- Modal: belépés 260ms scale(0.96→1)+fade (`--ease-out`), kilépés 180ms (`--ease-in`) — a
  bezárás megvárja az animációt.
- Toast: 400ms beúszás alulról, 3,2s várakozás, 240ms kilépés lefelé.
- Tooltip: egyetlen JS-vezérelt lebegő elem; hover: **700ms késleltetés**, fókusz: **0ms**;
  150ms fade+4px slide; Escape zárja.
- `:focus-visible`: 2px `--color-focus` gyűrű, 2px offsettel, minden interaktív elemen.

## CTA voice

- Primér: akcent-kitöltés, `--color-accent-ink` szöveg, 6px rádiusz, 500-as súly.
- Szekunder: `--color-paper` felület + `--color-rule-strong` keret.
- Veszélyes: körvonalas, `--color-danger` szöveg; kitöltést csak hoverre kap (soft).

## Dark mode mechanika

- A `<html data-theme="light|dark">` attribútum vezérli; a tokens.css két blokkja adja a két palettát.
- Bootstrap: inline script a `<head>`-ben (CSS előtt) — localStorage (`tb-theme`),
  ennek híján `prefers-color-scheme`.
- Váltó: fejléc ikongomb (🌙/☀️) + a login-kártya sarka; a választás localStorage-ba kerül.

## Amit minden nézetnek osztania kell

- A Workbench-váz, a token-készlet, a fontpárosítás, a CTA-hang, a fókuszgyűrű.
- Státusz-címke színkód: draft = semleges · review = borostyán · tesztelt = kobalt ·
  publikált = zöld — mindkét módban token-párokból (`--st-*-bg/fg`).

## Amiben a nézetek eltérhetnek

- A munkaterület belső elrendezése (lista / kétpaneles olvasó / split-szerkesztő / táblázat).
- Mono-címkék sűrűsége (technikai nézeteken — verziók, audit — több megengedett).

## Exports

### tokens.css
A teljes, kanonikus token-fájl a projektgyökérben: [`tokens.css`](tokens.css) —
light + dark paletta, tipográfia, térköz, rádiusz, motion tokenek, valamint az
örökölt alias-réteg (`--bg`, `--surface`, `--border`, …) az app.js inline hivatkozásaihoz.
