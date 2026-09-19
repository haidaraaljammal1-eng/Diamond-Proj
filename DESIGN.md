---
name: Diamond Rent Car
description: Pearl Ivory operations desk for a luxury car rental office in Dubai. Warm ivory surfaces, champagne-gold hairlines, bilingual RTL/LTR.
colors:
  pearl-base: "#faf8f2"
  pure-surface: "#ffffff"
  raised-cream: "#fffdf8"
  champagne-gold: "#c9a15c"
  deep-antique-gold: "#8a6630"
  espresso-heading: "#2b2417"
  espresso-body: "#262015"
  warm-taupe: "#756b57"
  faded-taupe: "#9a8f78"
  status-ok: "#2e9e63"
  status-warn: "#b27a17"
  status-danger: "#c2453c"
  gold-line: "#c9a15c52"
  bronze-hair: "#85642d24"
  on-gold-ink: "#231a08"
typography:
  display:
    fontFamily: "Marcellus, Georgia, 'Times New Roman', serif"
    fontSize: "39px"
    fontWeight: 400
    letterSpacing: "0.02em"
    fontFeature: "\"tnum\" 1"
  headline:
    fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif"
    fontSize: "16px"
    fontWeight: 600
  body:
    fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, sans-serif"
    fontSize: "11px"
    fontWeight: 600
rounded:
  chip: "4px"
  frame: "6px"
  control: "9px"
  option: "10px"
  button: "12px"
  panel: "14px"
  sheet-mobile: "16px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "12px"
  lg: "17px"
  xl: "22px"
components:
  button-primary:
    textColor: "{colors.on-gold-ink}"
    rounded: "{rounded.button}"
    padding: "14px 16px"
    height: "50px"
  button-primary-md:
    textColor: "{colors.on-gold-ink}"
    rounded: "{rounded.button}"
    padding: "0 18px"
    height: "38px"
  button-secondary:
    textColor: "{colors.deep-antique-gold}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  button-secondary-strong:
    backgroundColor: "{colors.raised-cream}"
    textColor: "{colors.deep-antique-gold}"
    rounded: "{rounded.control}"
    height: "36px"
  input-field:
    textColor: "{colors.espresso-heading}"
    rounded: "0"
    padding: "0 6px"
    height: "46px"
  select-field:
    textColor: "{colors.espresso-heading}"
    rounded: "0"
    padding: "0 6px"
    height: "46px"
  select-ghost:
    textColor: "{colors.deep-antique-gold}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "36px"
  select-panel:
    rounded: "{rounded.panel}"
    padding: "6px"
  select-option:
    textColor: "{colors.espresso-body}"
    rounded: "{rounded.option}"
    padding: "9px 10px"
  chip:
    textColor: "{colors.warm-taupe}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    padding: "3px 10px"
  card:
    backgroundColor: "{colors.pure-surface}"
    rounded: "{rounded.frame}"
    padding: "17px"
  dialog:
    rounded: "{rounded.frame}"
    padding: "22px"
    width: "min(480px, 100%)"
  dialog-xl:
    width: "min(960px, 100%)"
  dialog-2xl:
    width: "min(1320px, 100%)"
  dialog-wide:
    width: "min(1640px, 100%)"
    height: "calc(100dvh - 40px)"
---

# Design System: Diamond Rent Car

## 1. Overview

**Creative North Star: "The Concierge's Ledger"**

Diamond is a working ledger kept by a luxury concierge: pearl-white paper, espresso ink, and gold used the way a jeweller uses it, as a hairline, an engraved corner, a single seal. The system comes from the Demo's final "PEARL IVORY" cascade (`/demo.html`) and is implemented in `APP/frontend/src/styles/tokens.css`. The surface is light because the primary user is office staff at a desk monitor in a bright Dubai office during the working day, reading contracts, amounts and evidence for long stretches; espresso-on-ivory is the calm, paper-like answer to that scene.

Density is operational, not airy: body text is 14px, controls sit at 36 to 46px, and cards pad at 17px. Luxury is carried by craft details rather than volume: art-deco corner brackets on cards and dialogs, a gold hairline across the top of every modal, the diamond rhombus used as status dot and selection marker, a slow ambient aurora and rhombus lattice behind the stage. The system rejects the generic SaaS admin (PRODUCT.md anti-reference): no default blue, no flat gray tables, no stock component library look, no hero-metric gradient cards.

Arabic RTL is the default direction and English LTR is equal. Every layout is authored once with logical properties; `dir` is set only on `<html>`.

**Key Characteristics:**
- Warm ivory stage (`--diamond-page-bg`) with champagne radial glows; never a flat white page.
- Espresso ink for all reading text; gold reserved for accents, lines and the one primary action.
- Hairline borders (1px, gold or bronze at 14 to 32% alpha) instead of heavy dividers.
- Art-deco corner brackets and the rhombus marker as the signature ornaments.
- Calm motion: 0.25s ease state changes, expo-out entrances, reduced-motion always honored.
- Breakpoints actually used: 1080, 900 (rail becomes drawer), 560, 430, 400px. Public customer pages are mobile-first at 375/390/430.

## 2. Colors: The Pearl Ivory Palette

A restrained palette: tinted ivory neutrals, espresso ink, and one champagne-gold accent family, plus three muted status hues.

**Read the value, not the name.** The token names come from an earlier dark "noir/onyx" Demo layer and were never renamed when the Demo switched to Pearl Ivory. Several now mean the opposite of what they say. Always pick a token by the value and role below.

| Token | Real value | Actual role | Uses (var refs) |
|---|---|---|---|
| `--diamond-noir` | `#faf8f2` (light pearl) | page base color; unused directly, the stage uses `--diamond-page-bg` | 0 |
| `--diamond-onyx` | `#ffffff` (white) | elevated surface: Card background | 20 |
| `--diamond-onyx2` | `#fffdf8` (cream) | raised surface | 12 |
| `--diamond-raise` | `#fffdf8` | duplicate of onyx2 | 0 |
| `--diamond-gold` | `#c9a15c` | champagne gold: focus outline, icon strokes, dots, gradients | 52 |
| `--diamond-gold-hi` | `#8a6630` (dark) | deep antique gold: gold **text**, selected options, secondary buttons. Despite "hi", it is the darker gold | 72 |
| `--diamond-gold-lo` | `#8a6630` | identical to gold-hi; Button focus outline | 5 |
| `--diamond-champagne` | `#2b2417` (near black) | headings and strong text. Not a champagne color | 73 |
| `--diamond-ivory` | `#262015` (near black) | body text (`body { color }`). Not an ivory color | 39 |
| `--diamond-ink` | `#2b2417` | same value as champagne; input and select field text | 40 |
| `--diamond-muted` | `#756b57` | secondary text, labels, descriptions | 142 |
| `--diamond-dim` | `#9a8f78` | tertiary text, hints, disabled options | 56 |
| `--diamond-ok` / `-warn` / `-danger` | `#2e9e63` / `#b27a17` / `#c2453c` | status dots, invalid underline, error text | 4 / 13 / 34 |
| `--diamond-line` | `rgba(201,161,92,.32)` | gold hairline separators | 10 |
| `--diamond-hair` | `rgba(133,100,45,.14)` | bronze hairline dividers (list rows, integration rows) | 93 |

### Primary
- **Champagne Gold** (`champagne-gold`): the brand accent. Focus rings (`:focus-visible` 2px outline), icon strokes, status dots, the rhombus marker, and the base of the gold gradient. Never used for text: 2.26:1 on pearl fails AA.
- **Deep Antique Gold** (`deep-antique-gold`): the only gold allowed for text and small glyphs (4.91:1 on pearl, passes AA). Secondary button labels, selected Select options, ghost controls.
- **Gold Gradient** (`--diamond-gold-gradient`, 100deg `#8a6630 → #c9a15c 30% → #f2e0b4 50% → #c9a15c 72% → #8a6630`): the one fill for the primary action, the selected rhombus, and the dialog close hover. Text on it is always `on-gold-ink` (7.14:1).

### Neutral
- **Pearl Base** (`pearl-base`) and the stage composition `--diamond-page-bg` (two champagne radial glows over a `#fdfcf8 → #f8f4ec` vertical wash): the page.
- **Pure Surface** (`pure-surface`): card faces. **Raised Cream** (`raised-cream`): raised layers and the top of secondary-strong buttons.
- **Espresso Heading** (`espresso-heading`, 14.46:1) and **Espresso Body** (`espresso-body`, 15.21:1): all reading text.
- **Warm Taupe** (`warm-taupe`, 4.95:1): secondary text; the lowest-contrast color allowed for body-size text.
- **Faded Taupe** (`faded-taupe`, 3.01:1): hints, disabled, meta at 11px and below only when non-essential. It fails AA for normal text.
- **Gold Line** and **Bronze Hair**: 1px separators. Bronze hair for dense rows, gold line where the separator itself carries brand.
- Shell glass: `--diamond-topbar-bg`, `--diamond-rail-bg` (near-opaque white-to-cream gradients) and `--diamond-scrim-bg` (`rgba(88,70,40,.32)`, warm umber scrim, never black).

### Status
Status chips pair tone with a label and a rhombus dot. Contract statuses: AWAITING/FORM/RETOUT warn, SIGNED/PAID/REVIEW gold, ACTIVE ok, CLOSED neutral. Warn (3.48:1) and ok (3.20:1) are dot and border colors; chip text uses darker in-chip values, which currently live as literals (see drift).

### Named Rules
**The Read-the-Value Rule.** A token's name is history, its value is the truth. `--diamond-ivory` and `--diamond-champagne` are dark ink; `--diamond-noir` and `--diamond-onyx` are light surfaces; `--diamond-gold-hi` is the darker gold. Choosing by name produces invisible text.

**The Gold-Is-Not-Text Rule.** `#c9a15c` never carries text at body or label size. Gold text is `--diamond-gold-hi`.

**The One Gradient Rule.** The gold gradient exists once, in `--diamond-gold-gradient`. It is never re-typed, never applied to text (`background-clip: text` is forbidden).

### Drift register (hardcoded colors that must move to tokens)

Recorded as of 2026-09-19. Not fixed; each item is a future tokenization task.

| Literal | Occurrences | Meaning | Should become |
|---|---|---|---|
| `rgba(201, 161, 92, α)` and `rgb(201 161 92 / α)` | 331 + 26 hits in 73 + 8 files | gold at alphas .03 to .8 (washes, borders, glows) | an alpha scale, e.g. `--diamond-gold-a08/-a14/-a18/-a30/-a40/-a55` |
| `rgba(133, 100, 45, α)` | 14 hits, 10 files | bronze borders (`.18`) | `--diamond-hair` family (`--diamond-hair-strong`) |
| `rgba(122, 96, 48, α)` | 20 hits, 10 files | shadow color literals outside the two shadow tokens | shadow tokens (see Elevation) |
| `#231a08` | 12 hits, 10 files | text on gold, selection text | `--diamond-on-gold` |
| `#ffffff` / `#fff` | 32 hits, 19 files | surfaces, inset highlights, print | `--diamond-onyx` or a named highlight token |
| `#fffdf8` | 10 hits, 4 files | cream, typed directly | `--diamond-onyx2` (already exists) |
| `#f4e6c8`, `#efe0bc`, `#fbf6eb`, `#fdfaf3`-family | Button secondaryStrong, Dialog background | champagne sheet tints | `--diamond-champagne-tint-*` |
| `#b3a78d`, `#a79b83`, `rgba(138,102,48,.6)` | 4+ files (Input, Select, Chip) | placeholder and inactive dot | `--diamond-placeholder` (and fix contrast, 2.24:1) |
| `#85642d`, `#6e6553` | Chip | neutral chip tint and text | chip tokens |
| `#2e9e63`/`rgba(70,191,127,α)`, `#b07f1f`/`rgba(223,169,59,α)`, `#c0524a`/`rgba(223,91,82,α)` | Chip tone classes | status text and washes, not derived from `--diamond-ok/-warn/-danger` | status tokens with text/wash/border steps |
| `#2b6d4f` | `modules/contracts/forms/car-out/car-out-dialog.module.css` lines 39, 41 | a second, darker "saved" green unrelated to `--diamond-ok` | `--diamond-ok-text` (a status-ok text step) |
| `rgba(70, 56, 32, .38)` | Dialog scrim | a second scrim value beside `--diamond-scrim-bg` | `--diamond-scrim-bg` |

Largest concentrations: `app-header.module.css` (35), `sidebar.module.css` (26), `button.module.css` (20), `select.module.css` (18), `date-range-picker.module.css` (14), `road-liability-row.module.css` (13).

## 3. Typography

**Display Font:** Marcellus (with Georgia, Times New Roman, serif)
**Body Font:** IBM Plex Sans Arabic (with Segoe UI, Tahoma, sans-serif)

Both load from Google Fonts in `tokens.css`: Marcellus (single weight, 400) and IBM Plex Sans Arabic 300 to 700.

**Character:** An engraved Roman capital voice for the wordmark and numerals, paired with a clean bilingual humanist sans that carries both scripts at the same color and rhythm.

**What happens to Arabic in the display font.** Marcellus contains Latin glyphs only. When `--diamond-font-display` is applied to Arabic text, the browser skips Marcellus and Georgia (no Arabic glyphs) and falls through to the next family that has them: Times New Roman's Arabic on Windows, and whatever the platform maps to `serif` on phones. The result is an unbranded, often Naskh-style serif that does not match IBM Plex Sans Arabic, with different metrics, so RTL headings shift weight and height versus their LTR twins. This affects every public rental, return and renewal page title (e.g. `license-step .title`, `payment-step .methodsTitle`) and the login title, which all set the display font on translated strings. Safe uses today: the `DIAMOND` wordmark, Latin-only codes, and numerals (StatCard number, donut center value, date range digits).

### Hierarchy
- **Display** (Marcellus 400, 39px, 0.02em, tabular numerals): KPI numbers and the wordmark. Latin and digits only.
- **Headline** (Plex 700, 21px, -0.01em): page header title (shared `PageHeader`).
- **Title** (Plex 600, 16px; 15px under 560px): dialog titles. Card titles are 13.5px 600.
- **Body** (Plex 400, 14px, line-height 1.65): all reading and form text. Field values 14px.
- **Label** (Plex 600, 11px): chips; 12.5px 600 for compact buttons and ghost controls; 11.5px for dialog descriptions and compact integration labels.

The body scale is tight (11 / 12.5 / 13 / 14 / 16 / 21 / 39). Hierarchy relies on weight and the espresso-vs-taupe color step more than size.

### Named Rules
**The Latin-Only Display Rule.** `--diamond-font-display` is for the wordmark, numerals and Latin-only strings. Any element whose text comes from `messages/ar.json` uses `--diamond-font-body`. Existing violations are drift.

**The Isolated Numbers Rule.** Contract numbers, plates, VINs, amounts and license numbers are LTR-isolated inside Arabic text and use tabular numerals where they align in columns.

## 4. Elevation

A hybrid system: tonal ivory layering plus warm, low-opacity umber shadows (`rgba(122,96,48,…)`, never gray or black). Surfaces at rest carry a soft ambient shadow; interaction deepens it. Glass (backdrop blur) is reserved for the shell topbar and rail, the Select and Popover panels, and the dialog scrim.

### Shadow Vocabulary
- **Near** (`--diamond-shadow-near`: `0 4px 16px rgba(122,96,48,.10)`): small raised controls. 11 uses.
- **Far** (`--diamond-shadow-far`: `0 24px 64px rgba(122,96,48,.20)`): large floating layers. 1 use.
- **Card rest** (`0 12px 34px rgba(122,96,48,.12)` + faint inset): every Card. Literal, not tokenized.
- **Card hover / focus-within** (`0 26px 64px rgba(122,96,48,.18)` + inner gold glow `inset 0 0 22px rgba(201,161,92,.05)`).
- **Floating panel** (`0 18px 48px rgba(122,96,48,.18), inset 0 1px 0 #fff`): Select and Popover.
- **Dialog** (`0 40px 100px rgba(80,60,30,.24)`): the modal.
- **Gold glow** (`drop-shadow(0 6px 18px rgb(201 161 92 / 28%))`, smaller at md/sm): only under the primary gold button.

### Motion (folded here as depth-in-time)
- `--diamond-transition: 0.25s ease` for color, border, shadow and filter changes (21 uses).
- Entrances use expo-out curves: Dialog rise `0.4s cubic-bezier(0.16,1,0.3,1)` with a 4px blur-in; Drawer `0.32s cubic-bezier(0.22,0.9,0.3,1)`; Card lift `0.34s cubic-bezier(0.2,0.8,0.25,1)`.
- Ambient stage: aurora 26s and rhombus lattice drift 110s; both stop under `prefers-reduced-motion`.
- Integration "processing" is a 1.9s opacity breath, never a spinner.

### Named Rules
**The Warm Shadow Rule.** Shadows are umber (`122,96,48`), never neutral gray or black. A gray shadow on ivory reads as dirt.

**The Earned Glass Rule.** Backdrop blur appears only on layers that float over moving content (shell chrome, dropdown panels, scrims). Cards and page sections are never glass.

## 5. Components

### Buttons
Tactile and quiet: one gold action per view, everything else champagne-washed.
- **Shape:** gently rounded (12px for primary and md; 9px for secondary, ghost and sm).
- **Primary** (`variant="primary"`): gold gradient fill (`background-size: 230%`), `on-gold-ink` text, 700 weight, 0.04em tracking, gold drop-shadow glow. Size `lg` is 50px and full width (the login submit only); `md` is 38px inline for toolbars and dialog footers; `sm` is 36px.
- **Secondary** (`variant="secondary"`): gold wash `rgba(201,161,92,.09)`, 1px bronze border `.18`, deep antique gold text, 12.5px 600. Hover doubles the wash to `.18` and warms the border.
- **Secondary Strong** (`variant="secondaryStrong"`): cream-to-champagne vertical gradient, 1.5px gold border `.55`, 700 text, near shadow. For important secondary actions over photos or hero chrome. Never a pill, never gold-filled.
- **Ghost** (`variant="ghost"`): legacy alias visually identical to secondary; prefer `secondary`.
- **Hover / Focus / Active:** primary brightens 1.08 to 1.1; focus is a 2px `--diamond-gold-lo` outline at 3px offset (primary) or a gold border plus 3px `.14` ring (secondary family); active presses 1px down. Disabled is 0.7 opacity. `loading` replaces children with "..." and disables.

### Dialog
The Demo modal, reserved for committed, focused tasks (Car-Out, Close, Reconcile).
- **Frame:** 6px radius, 1px gold border `.30`, white-to-`#fbf6eb` gradient, four art-deco corner brackets, a 1.5px gold hairline across the top edge (inset 18% each side), dialog shadow. 16px radius and 18px padding under 560px.
- **Sizes:** `default` 480px; `xl` 960px; `2xl` 1320px (max-height `min(94dvh,1080px)`); `wide` 1640px, full-height column (`calc(100dvh - 40px)`), overflow hidden so the caller owns one scroll region and a fixed footer (Car-Out).
- **Presentation:** `default` renders title (16px 600 espresso) and description (11.5px taupe); `flush` removes padding and hides the title visually for full-bleed detail layouts.
- **Close:** 30px chamfered square (clipped corners), gold wash, taupe glyph; hover fills with the gold gradient. Floats to inline-end (physical `float` with an explicit `[dir="ltr"]` override).
- **Behavior:** body portal, z-index 110 (above Drawer 95/96), warm scrim with 6px blur, focus trap, Escape closes only the top-most dialog, focus returns to the opener, body scroll locked.

### Select (the only dropdown)
- **Field** (`variant="field"`, 46px): mirrors the shared Input. Transparent, no box, 1px gold underline `.30`; hover `.50`; focus or open turns the underline deep antique gold with a rising gold wash. Invalid turns the underline danger.
- **Ghost** (`variant="ghost" size="sm"`, 36px): the champagne capsule matching secondary buttons, for shell chrome (locale switcher) and filters.
- **Caret:** a CSS chevron, physical on purpose (always points down, rotates 180deg when open).
- **Panel:** body portal, fixed, z-index 200, 14px radius, near-opaque pearl glass (18px blur), gold border `.26`, floating-panel shadow, flips upward when space below is short. Max height 300px with a thin gold scrollbar.
- **Options:** 10px radius rows, 13px text; active row gets a diagonal gold wash; selected row turns deep antique gold 600 and shows the gold-gradient **rhombus marker** with a soft glow. Optional in-panel search for lookups; optional clear control; translated empty state.
- Native `<select>` is banned system-wide. In forms use `SelectField` or FormBuilder `select`.

### Inputs / Fields
- **Style:** underline only (46px, 1px gold `.30` bottom border, no radius, transparent), espresso 14px text.
- **Focus:** underline becomes deep antique gold with a bottom-up gold wash (10%). No outline box.
- **Error / Disabled:** danger underline; disabled text drops to taupe. Autofill keeps the transparent ground.

### Chips
- **Style:** 4px radius, 3px 10px, 11px 600, translucent tinted fill with a 1px tinted border and a 6px **rhombus dot**.
- **Tones:** `neutral` (bronze), `gold`, `ok`, `warn`, `bad`. `solid` switches to an opaque `color-mix` fill plus shadow for chips over photography.

### Cards / Containers
- **Corner Style:** 6px, with two art-deco corner brackets (top-right, bottom-left).
- **Background:** `--diamond-onyx` (white). **Border:** 1px gold `.14`. **Shadow:** card rest; interactive cards lift to card hover; `selected` strengthens the border to `.55`.
- **Internal Padding:** 17px default, 12px compact, 0 none. Titles 13.5px 600 espresso with a 16px gold-stroked icon.

### Icon
- One entry point: `<Icon name="mdi:…" />` from `src/shared/components/ui/icon` over `@iconify/react`. Default 16px, `currentColor`, baseline-nudged `-0.15em`. Decorative by default (`aria-hidden`); pass `label` for meaningful icons (`role="img"`).
- No emoji, no inline SVG in feature code. The rail artwork in `modules/navigation/navigation.icons.tsx` is the one sanctioned exception (traced Demo art).

### IntegrationStatusRow
Signature read-only row for external integrations (TARS).
- Label (12.5px taupe) on the inline-start, a dotted `Chip` on the inline-end, 7px vertical padding, bronze hairline between rows (`border-block-start`, none on the first).
- `compact` drops the separator and shrinks the label to 11.5px for inline use inside workflow dialogs.
- `syncing` applies the slow 1.9s opacity breath to the chip. It renders no action by design; it can sit beside any workflow control without changing it.

### Navigation (AppShell)
- Icon rail docked to the inline-start edge with the `DIAMOND` wordmark (Marcellus) and `RENT CAR · DUBAI` subtitle; floating glass topbar capsule. At 900px the rail becomes an off-canvas drawer with a warm scrim. Dock edges come only from `--rail-inset-*` / `--main-inset-*` in `app-shell.module.css`.

### Mandatory direction and rendering rules (from `APP/frontend/CLAUDE.md`)
1. **Logical properties only:** `inset-inline-*`, `margin-inline-*`, `padding-inline-*`, `border-inline-*`, `text-align: start|end`. A physical value needs a comment explaining why (the Select caret, the Dialog close `float`).
2. **`translateX()` never flips with `dir`.** Every horizontal slide needs a `:global([dir="ltr"])` (or rtl) counterpart, as the mobile rail drawer does.
3. **The shell dock edge lives in one file** (`app-shell.module.css`). Never set inset values on `.rail` or `.main` separately.
4. **Directional glyphs mirror** with `:global([dir="rtl"]) { transform: scaleX(-1) }`, not a second icon.
5. **No directional box-shadow offsets;** use symmetric shadows or per-`dir` rules.
6. **`-webkit-backdrop-filter` is written before `backdrop-filter`.** The CSS pipeline keeps one of the pair; with the unprefixed one first, the blur disappears in Chrome. Verify with `getComputedStyle(el).backdropFilter`.

Rule drift found (not fixed): the unprefixed-first order still exists in `select.module.css` (panel), `popover.module.css` and `app-shell.module.css` (scrim); `chip.module.css` has `backdrop-filter` with no prefixed line at all. The Dialog close renders a literal `✕` and the Select clear a literal `×` instead of the shared `Icon`.

## 6. Do's and Don'ts

### Do:
- **Do** pick tokens by value: body text `--diamond-ivory` (`#262015`), headings `--diamond-champagne` (`#2b2417`), gold text `--diamond-gold-hi` (`#8a6630`), surfaces `--diamond-onyx` / `--diamond-onyx2`.
- **Do** keep one gold-filled primary action per view; everything else is secondary (champagne wash, 1px bronze border).
- **Do** use 1px hairlines (`--diamond-hair`, `--diamond-line`) for separation, and the rhombus as dot and marker.
- **Do** use `--diamond-font-body` for anything translated; reserve Marcellus for the wordmark, numerals and Latin-only codes.
- **Do** author RTL first with logical properties, then check `/ar` and `/en` side by side.
- **Do** keep text at AA: `--diamond-muted` (`#756b57`) is the lightest color for body-size text.
- **Do** add a token (and remove the literal) whenever you touch a file listed in the drift register.
- **Do** respect `prefers-reduced-motion` in every new animation and use expo-out curves for entrances.

### Don't:
- **Don't** make it look like a generic SaaS admin (PRODUCT.md anti-reference): no Bootstrap or Material look, no default blue buttons, no flat gray tables, no hero-metric KPI cards with gradient accents, no identical card grids.
- **Don't** use a native `<select>` or native date input anywhere; use the shared Select and DateRangePicker.
- **Don't** inline SVG or put emoji in UI or translation strings; use the shared `Icon`.
- **Don't** set `#c9a15c` (or `--diamond-dim` / `#9a8f78`, or placeholder `#b3a78d`) on essential text; they fail AA on ivory.
- **Don't** type new `rgba(201,161,92,…)`, `#fffdf8`, `#231a08`, `#2b6d4f` or other literals; every new color goes through `--diamond-*`.
- **Don't** apply the gold gradient to text (`background-clip: text`), and don't re-type the gradient stops.
- **Don't** use gray or black shadows, or black scrims; shadows and scrims are warm umber.
- **Don't** use `border-left`/`border-right` accent stripes, and don't use `left`/`right`/`translateX` without a direction counterpart.
- **Don't** add glass to cards or page sections; blur is for floating chrome only.
- **Don't** open a modal where an inline step or the Drawer would do; the wide Dialog is for committed workflows like Car-Out.
- **Don't** ship a change without a `DOCU/CHANGELOG.md` entry and its `DOCU/` page note.
