# Táltos Design System — Agent Reference

> Ezt a fájlt **kötelező felolvasni minden UI/prototípus előtt**. Token-hatékony:
> a `:root` blokk közvetlenül beilleszthető. Vizuális referencia: `taltos-design-system.html`.
> Strukturált tokenek tooling számára: `taltos-design-tokens.json`.

## 0. Aranyszabályok (ezeket soha ne sértsd meg)

1. **Csak szemantikus token.** Komponensben SOHA nincs nyers hex vagy px. Használj `var(--primary)`, `var(--space-4)` stb. A primitív rampát (`--green-600`) csak szemantikus token hivatkozhatja.
2. **Kétréteg.** primitív (nyers érték) → szemantikus (jelentés). Komponens csak a szemantikus réteget látja.
3. **Téma ingyen jár.** Ha csak szemantikus tokent használsz, a sötét téma automatikusan működik. Ne írj külön sötét-stílust komponensre.
4. **A11y floor kötelező:** látható `:focus-visible`, ≥4.5:1 szövegkontraszt, jelentés sosem csak színnel, `prefers-reduced-motion` tisztelve.
5. **Hang:** cselekvő, felhasználói szemszög, segítő; nincs misztikus/„varázsló” narratíva, nincs rendszer-zsargon a felületen.

## 1. Fontok

```html
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

- `--font-display` Fraunces → **csak címek** (h1–h2, hero), mértékkel. Örökség/bölcsesség.
- `--font-body` Inter → törzs + minden UI. Technológia/tisztaság.
- `--font-mono` JetBrains Mono → adat, kód, token, azonosító.
- Mind teljes magyar ékezettel (á é í ó ö ő ú ü ű).

## 2. Tokenek — paste-ready `:root` (világos téma)

```css
:root {
  /* ---- PRIMITÍV: Világfa zöld (elsődleges) ---- */
  --green-50:#ECF5F1; --green-100:#D2E8DF; --green-200:#A6D0C1; --green-300:#71B29C; --green-400:#479079;
  --green-500:#2C7460; --green-600:#1F5C4C; --green-700:#194A3E; --green-800:#163C33; --green-900:#10281F;
  /* ---- PRIMITÍV: Sólyomkék (másodlagos) ---- */
  --blue-50:#ECF2F9; --blue-100:#D3E1F2; --blue-200:#A9C5E6; --blue-300:#79A3D6; --blue-400:#4E82C4;
  --blue-500:#3467AD; --blue-600:#29528C; --blue-700:#234471; --blue-800:#1E385C; --blue-900:#16273F;
  /* ---- PRIMITÍV: Csillagarany (akcentus) ---- */
  --gold-50:#FBF3E4; --gold-100:#F6E3BF; --gold-200:#EFCB86; --gold-300:#E7B356; --gold-400:#DD9C2E;
  --gold-500:#C9861A; --gold-600:#A66B14; --gold-700:#825313; --gold-800:#674214; --gold-900:#4A2F0F;
  /* ---- PRIMITÍV: Kéreg (meleg semleges) ---- */
  --bark-0:#FFFFFF; --bark-50:#F7F5F1; --bark-100:#EDE9E1; --bark-200:#DBD5C9; --bark-300:#BFB7A6;
  --bark-400:#9C9384; --bark-500:#7A7264; --bark-600:#5E574C; --bark-700:#46413A; --bark-800:#302C27;
  --bark-900:#1C1A16; --bark-950:#12100D;
  /* ---- PRIMITÍV: státusz ---- */
  --success-500:#2F855A; --success-600:#276749; --success-50:#E7F3EC;
  --warning-500:#C9861A; --warning-600:#A66B14; --warning-50:#FBF3E4;
  --danger-500:#C0492E;  --danger-600:#9E3A24;  --danger-50:#F9EAE6;
  --info-500:#3467AD;    --info-600:#29528C;    --info-50:#ECF2F9;

  /* ---- TÍPUS ---- */
  --font-display:"Fraunces",Georgia,serif;
  --font-body:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --font-mono:"JetBrains Mono","SF Mono",Menlo,monospace;
  --text-xs:.75rem; --text-sm:.875rem; --text-base:1rem; --text-lg:1.125rem; --text-xl:1.25rem;
  --text-2xl:1.5rem; --text-3xl:1.875rem; --text-4xl:2.25rem; --text-5xl:3rem; --text-6xl:3.75rem;
  --leading-tight:1.15; --leading-snug:1.3; --leading-normal:1.6; --leading-relaxed:1.75;
  --tracking-tight:-.02em; --tracking-normal:0; --tracking-wide:.04em; --tracking-wider:.14em;
  --weight-regular:400; --weight-medium:500; --weight-semibold:600; --weight-bold:700;

  /* ---- TÉRKÖZ (4px bázis) ---- */
  --space-0:0; --space-1:.25rem; --space-2:.5rem; --space-3:.75rem; --space-4:1rem; --space-5:1.25rem;
  --space-6:1.5rem; --space-8:2rem; --space-10:2.5rem; --space-12:3rem; --space-16:4rem; --space-20:5rem; --space-24:6rem;

  /* ---- FORMA ---- */
  --radius-none:0; --radius-sm:4px; --radius-md:8px; --radius-lg:12px; --radius-xl:16px; --radius-2xl:24px; --radius-full:9999px;

  /* ---- RÉTEG ---- */
  --z-base:0; --z-raised:10; --z-sticky:100; --z-overlay:1000; --z-modal:1100; --z-toast:1200;

  /* ---- MOZGÁS ---- */
  --ease-grow:cubic-bezier(.22,1,.36,1); --ease-standard:cubic-bezier(.4,0,.2,1);
  --ease-enter:cubic-bezier(0,0,.2,1); --ease-exit:cubic-bezier(.4,0,1,1);
  --duration-fast:150ms; --duration-base:250ms; --duration-slow:400ms; --duration-slower:600ms;

  /* ---- ELRENDEZÉS ---- */
  --content-max:1120px; --sidebar-w:264px; --read-width:70ch;

  /* ---- SZEMANTIKUS: világos ---- */
  --bg:var(--bark-50); --bg-contour:rgba(31,92,76,.05);
  --surface:var(--bark-0); --surface-raised:var(--bark-0); --surface-sunken:var(--bark-100); --surface-inverse:var(--green-900);
  --border:var(--bark-200); --border-strong:var(--bark-300); --border-focus:var(--blue-500);
  --text:var(--bark-900); --text-muted:var(--bark-600); --text-subtle:var(--bark-500); --text-inverse:var(--bark-0); --text-on-accent:var(--bark-950);
  --primary:var(--green-600); --primary-hover:var(--green-700); --primary-active:var(--green-800); --primary-soft:var(--green-50); --primary-soft-text:var(--green-700); --on-primary:#FFFFFF;
  --secondary:var(--blue-600); --secondary-hover:var(--blue-700); --secondary-soft:var(--blue-50); --on-secondary:#FFFFFF;
  --accent:var(--gold-500); --accent-hover:var(--gold-600); --accent-soft:var(--gold-50);
  --success:var(--success-600); --success-bg:var(--success-50);
  --warning:var(--warning-600); --warning-bg:var(--warning-50);
  --danger:var(--danger-600);   --danger-bg:var(--danger-50);
  --info:var(--info-600);       --info-bg:var(--info-50);
  --focus-ring:0 0 0 3px rgba(52,103,173,.35);
  --shadow-xs:0 1px 2px rgba(28,26,22,.06);
  --shadow-sm:0 1px 3px rgba(28,26,22,.08),0 1px 2px rgba(28,26,22,.05);
  --shadow-md:0 4px 10px rgba(28,26,22,.08),0 2px 4px rgba(28,26,22,.05);
  --shadow-lg:0 12px 28px rgba(28,26,22,.12),0 4px 8px rgba(28,26,22,.06);
  --shadow-xl:0 24px 48px rgba(28,26,22,.16);
}
```

## 3. Sötét téma — paste-ready remap (csak szemantikus tokent cserél)

```css
[data-theme="dark"] {
  --bg:var(--bark-950); --bg-contour:rgba(113,178,156,.06);
  --surface:#1C1A16; --surface-raised:#24211C; --surface-sunken:#16140F; --surface-inverse:var(--green-50);
  --border:#34302A; --border-strong:#47423A; --border-focus:var(--blue-300);
  --text:#F2EEE6; --text-muted:#B4AC9C; --text-subtle:#8A8272; --text-inverse:var(--bark-900); --text-on-accent:var(--bark-950);
  --primary:var(--green-300); --primary-hover:var(--green-200); --primary-active:var(--green-100); --primary-soft:rgba(44,116,96,.18); --primary-soft-text:var(--green-200); --on-primary:var(--green-900);
  --secondary:var(--blue-300); --secondary-hover:var(--blue-200); --secondary-soft:rgba(52,103,173,.18); --on-secondary:var(--blue-900);
  --accent:var(--gold-300); --accent-hover:var(--gold-200); --accent-soft:rgba(201,134,26,.16);
  --success:#6EC28E; --success-bg:rgba(47,133,90,.16);
  --warning:var(--gold-300); --warning-bg:rgba(201,134,26,.16);
  --danger:#E28468; --danger-bg:rgba(192,73,46,.18);
  --info:var(--blue-300); --info-bg:rgba(52,103,173,.16);
  --focus-ring:0 0 0 3px rgba(121,163,214,.45);
  --shadow-xs:0 1px 2px rgba(0,0,0,.4);
  --shadow-sm:0 1px 3px rgba(0,0,0,.45),0 1px 2px rgba(0,0,0,.35);
  --shadow-md:0 4px 12px rgba(0,0,0,.5);
  --shadow-lg:0 14px 32px rgba(0,0,0,.55);
  --shadow-xl:0 24px 50px rgba(0,0,0,.6);
}
```

## 4. Szemantikus token → mikor használd

| Cél | Token |
|---|---|
| Oldal háttér | `--bg` |
| Kártya/panel háttér | `--surface` |
| Mélyített háttér (input-hátsó, sor-hover) | `--surface-sunken` |
| Fő szöveg | `--text` · másodlagos: `--text-muted` · halvány: `--text-subtle` |
| Keret / elválasztó | `--border` · hangsúlyos: `--border-strong` |
| Elsődleges akció / márkaszín | `--primary` (+ `--on-primary`, `--primary-soft`, `--primary-soft-text`) |
| Másodlagos akció / linkek, technológia | `--secondary` |
| Kiemelés, jutalom, „figyelj ide” | `--accent` (szöveg rajta: `--text-on-accent`) |
| Státusz | `--success` / `--warning` / `--danger` / `--info` (+ `-bg` háttér) |
| Sötét felület világos szöveggel (tooltip, toast) | `--surface-inverse` + `--text-inverse` |

## 5. Tipográfiai skála (szerep → érték)

| Szerep | Család | Méret | Súly | Egyéb |
|---|---|---|---|---|
| Display/hero | display | `--text-5xl`–`6xl` | 600 | `--leading-tight` `--tracking-tight` |
| H1 | display | `--text-4xl` | 600 | tight |
| H2 | display | `--text-2xl` | 600 | `--leading-snug` |
| H3 | body | `--text-xl` | 600 | |
| Törzs | body | `--text-base` | 400 | `--leading-normal`, max `--read-width` |
| Kis szöveg | body | `--text-sm` | 400 | `--text-muted` |
| Címke/eyebrow | body | `--text-xs` | 600 | uppercase `--tracking-wide` |
| Adat/kód | mono | `--text-xs`–`sm` | 400 | |

## 6. Komponens-receptek (tömör — csak tokenekkel)

**Gomb** `height:40px(sm32/lg48); padding:0 var(--space-4); radius:--radius-md; font:600 --text-sm; transition:--duration-fast --ease-standard`
- elsődleges: `bg:--primary; color:--on-primary; hover:--primary-hover`
- másodlagos: `--secondary/--on-secondary` · akcentus: `--accent/--text-on-accent`
- körvonal: `bg:transparent; color:--text; border:1px --border-strong; hover-bg:--surface-sunken`
- szellem: `transparent; color:--text-muted; hover-bg:--surface-sunken`
- veszély: `--danger/#fff` · disabled: `opacity:.45` · fókusz: `box-shadow:--focus-ring`

**Input/Select/Textarea** `height:40px; padding:0 var(--space-3); radius:--radius-md; border:1px --border-strong; bg:--surface; color:--text; font:--text-sm`
- hover `border:--bark-400` · focus `border:--border-focus; box-shadow:--focus-ring; outline:none`
- hiba `border:--danger`, hint `--danger` · placeholder `--text-subtle`

**Checkbox/Radio** `20px; border:1px --border-strong; radius:--radius-sm(radio:full); checked bg+border:--primary`
**Switch** track `44×24 radius-full bg:--bark-300; checked:--primary`, thumb `18px #fff --shadow-sm; transition:--duration-base --ease-grow`

**Card** `bg:--surface; border:1px --border; radius:--radius-lg; --shadow-sm; padding:--space-5–8`
- interaktív hover: `translateY(-3px); --shadow-lg; --duration-base --ease-grow`

**Badge** `--text-xs 600; padding:2px var(--space-2); radius:--radius-full` → variáns = `{status}-bg` háttér + `{status}` szöveg. Neutral: `--surface-sunken/--text-muted`. Primary: `--primary-soft/--primary-soft-text`.
**Tag** `--text-xs; padding:3px var(--space-2); radius:--radius-sm; bg:--surface-sunken; color:--text-muted; border:1px --border`

**Alert** `display:flex; gap:--space-3; padding:--space-4; radius:--radius-md; bg:{status}-bg; border:1px color-mix(in srgb,var(--{status}) 30%,transparent); ikon:--{status}`

**Tabs** `border-bottom:1px --border`; fül `border-bottom:2px transparent; --text-muted`; aktív `--primary + border-bottom:--primary`
**Table** header `--surface-sunken; --text-xs uppercase --text-subtle`; cella `border-bottom:1px --border`; sor-hover `--surface-sunken`
**Tooltip/Toast** `bg:--surface-inverse; color:--text-inverse; radius:--radius-md; --shadow-md/lg`
**Modal** `bg:--surface; border:1px --border; radius:--radius-xl; --shadow-xl`; lábléc `--surface-sunken; border-top:1px --border`
**Progress** track `--surface-sunken`; kitöltés `linear-gradient(90deg,var(--green-500),var(--gold-500))`
**Avatar** kör, `color:#fff`, háttér primitív 600-as (green/blue/gold). Rang-koszorú: `2px --accent` gyűrű.

## 7. Elrendezés

- Tartalom max `--content-max` (1120px), olvasható szöveg max `--read-width` (70ch).
- Rács rése `--space-6` (24px). Szekció-térköz `--space-16`–`--space-20`.
- Töréspontok: sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536.
- Reszponzív floor: minden működjön 360px-től; a sidebar mobilon elrejthető.
- **Abszolút háttér-SVG csapda:** ha van `.hero>*{position:relative}` szabály, a háttérréteget zárd ki (`:not(.hero-contours)`), különben a flow-ba kerül és üres helyet nyit.

## 8. Ikonográfia

Vonalas, 24×24 rács, stroke 1.6–2, rounded cap/join. Funkcionális ikonokhoz bevett készlet (pl. Lucide). Márkajel-ikonokat (világfa, tudásgráf, csomó, csillag, „lát”) azonos rácson/vastagsággal rajzolj. Kerüld: agancs, sámándob, rovásírásos giccs.

## 9. Do / Don't

**Do:** csak szemantikus token · display font kizárólag címben · meleg (barnás) árnyék · státuszt ikon+szöveg is kíséri · cselekvő, felhasználó-központú szöveg · látható fókusz.
**Don't:** nyers hex/px komponensben · külön sötét-stílus komponensre · display font törzsben · hideg szürke árnyék · jelentés csak színnel · rendszer-zsargon a felületen · misztikus/fantasy vizuál.

## 10. Prototípus-megfelelőségi checklist (build után futtasd)

- [ ] Nincs nyers hex vagy px érték komponens-CSS-ben (csak `var(--…)`).
- [ ] Világos ↔ sötét téma működik `data-theme="dark"` váltásra, komponens-szintű override nélkül.
- [ ] Minden interaktív elemnek van `:focus-visible` állapota `--focus-ring`-gel.
- [ ] Szövegkontraszt ≥ 4.5:1 (nagy szöveg ≥ 3:1) mindkét témában.
- [ ] Státusz/jelentés sosem csak színnel közvetített.
- [ ] Display font csak címben; törzs Inter; adat mono.
- [ ] Térköz/sugár/árnyék a skálából; olvasható szöveg ≤ 70ch.
- [ ] Reszponzív 360px-ig; `prefers-reduced-motion` tisztelve.
- [ ] Szövegek cselekvők, felhasználó-központúak; nincs zsargon/misztikum.
