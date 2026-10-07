# Public rental — document verification and renter UI flow

## Previous flow (Stage 1)

On a valid driving licence, the UI showed **licence upload**, **full contract preview + renter FormBuilder** (many fields), and **passport capture** at the same time. Continue on passport jumped to contract review before a dedicated save step.

## New flow (Stage 1)

Top-level steps unchanged:

1. Document verification  
2. Contract review  
3. Completion  

Inside **Document verification**, a single derived sub-sequence:

| Sub-stage | Condition |
|-----------|-----------|
| `LICENSE` | Licence verification status is not `VALID` |
| `PASSPORT` | Licence `VALID`, passport number not `READY` |
| `RENTER_DETAILS` | Licence `VALID`, passport `READY` with number, contract still `AWAITING` |

After **Save details**, contract status becomes `FORM` and flow step `CONTRACT` → existing **Contract review** (sign/pay unchanged).

## State resolver

Frontend: `resolveDocumentVerificationSubStage(context)` in  
`APP/frontend/src/modules/public-rental/utils/document-verification-substage.ts`.

Backend flow step: `derivePublicRentalFlowStep` keeps `LICENSE_VERIFICATION` while `status === AWAITING` even when `identityReady` is true, until the renter form is saved.

## Source ownership

| Field | Source |
|-------|--------|
| Driving licence number / expiry | `DrivingLicenseVerification` (server on save) |
| Passport number | `PassportExtraction` / public identity passport fields |
| Name, nationality, address, mobile | Customer form (editable) |

Read-only verified values are **not** form controls; payload injects passport from context on submit.

## Gating

- Passport sub-step: licence `VALID` only.  
- Renter form: licence `VALID` **and** passport `READY` with extracted number.

## Renter form fields (UI)

Editable: full name, nationality, address, phone (mobile).  
Read-only block: passport number, licence number, licence expiry.

Removed from public UI only (still nullable in DB/API): date of birth, licence issue date, place of issue, email, identity number.

## Save and transition

`POST /contracts/rental/:token/form` → reload context → UI `goToStage("contract")` when save succeeds.

## Refresh / resume

| Persisted state | UI |
|-----------------|-----|
| Licence valid, no passport | Passport sub-stage |
| Licence + passport ready, no customer save | Renter details |
| Form saved (`FORM`) | Contract review |

## Responsive / i18n

Secondary progress: `DocumentVerificationProgress` (AR/EN). Shared Card, FormBuilder, Button, Icon; `VerifiedDocumentValue` for locked verified fields.

## Playwright

- `e2e/public-rental-documents-flow.spec.ts` — simulation happy path, refresh, signing smoke  
- Updated `driving-license-ocr.spec.ts`, `rental-contract.ts`, cash/electronic/finance flows  

## Impeccable

Refinements: secondary step strip, verified block on ivory surface, single-focus sub-stages (no stacked contract preview on Stage 1).

---

## PREMIUM UI REFINEMENT

### Impeccable BEFORE (rendered baseline)

1. **Hierarchy** — Stage-1 internal progress competed visually with the top stepper; renter verified block used light-theme fallbacks that clashed with onyx cards.  
2. **Spacing** — Mixed 16px gaps without a shared rhythm; summary rows felt cramped vs main cards.  
3. **Alignment** — Rental summary used `flex` + `space-between` per row, so values did not share a vertical column track across rows.  
4. **Tables/grids** — Licence status facts stacked without a shared grid definition.  
5. **Interaction** — Top stepper had no hover affordance; upload zones felt static.  
6. **RTL** — Summary values used `text-align: end` on flex rows instead of grid column tracks.  
7. **Mobile** — Verified fields could crowd at narrow widths.

### Changes made

- `public-rental-motion.module.css` — shared `--pr-duration` (220ms), ease, lift/tilt tokens on `.shell`.  
- **Top stepper** — hover lift ±0.6° tilt, gold border/shadow, active inset gold line, completed tone; `data-testid="rental-progress-step-*"`.  
- **Internal progress** — compact markers, connecting hairline, checkmarks for done steps.  
- **Field grid** — `public-rental-field-grid.module.css` for licence facts, passport fact, renter verified row.  
- **Rental summary** — single CSS grid (`38% / 62%`) with flat `dt`/`dd` pairs and alignment test ids.  
- **Verified values** — gold-tinted inset cells, shield-check indicator, dark Diamond tokens.  
- **Upload** — dashed border hover lift + gold emphasis.  
- **Renter form** — section divider, typography aligned to Card title language.

### Hover system

220ms `cubic-bezier(0.22, 1, 0.36, 1)`; stepper `translateY(-3px)` + alternating ±0.6° rotate; upload `translateY(-2px)`; respects `prefers-reduced-motion`.

### Table/grid alignment

**Root cause:** independent flex rows for label/value pairs.  
**Fix:** one `grid-template-columns` on the parent `dl`; each label/value is a direct grid item (summary) or a two-row cell (facts).

### Playwright headed verification

```bash
cd APP/frontend
npx playwright test e2e/public-rental-premium-ui.spec.ts --headed --workers=1
```

Helpers: `e2e/helpers/column-alignment.ts` (`expectLabelValueColumnAligned`, `expectStepHoverLift`).  
Screenshots: `e2e/__screens__/public-rental-premium/` (after states).

### Impeccable AFTER

- Motion is consistent and restrained; no new color families.  
- Summary and facts align on column tracks (verified in Playwright with Δx ≤ 5px on office row).  
- Second pass removed light-theme fallbacks from renter verified section for onyx consistency.

### Remaining UI notes

- Demo simulation visual spec (`demo-simulation.visual.spec.ts`) still targets legacy `contract-step` mock — out of scope for production rental polish.

### Top stepper v2 (horizontal luxury)

Replaced three boxed stage cards with a **horizontal stepper**: circular markers, gold connector hairlines, compact labels beneath, checkmarks for completed steps, active marker scale/glow. Hover: slight lift + marker border/shadow only (no box rotation).

### Rental summary v2 (booking-style)

Price hero under card title, inset details panel with shared **40% / 60%** label/value grid (`display: contents` rows), refined footer note — same fields and test ids preserved.

### RENTAL SUMMARY ALIGNMENT / PAGE BACKGROUND FIX

**Misaligned values:** `display: contents` row wrappers plus percentage columns let RTL/bidi and row borders shift perceived value starts. **Fix:** flat `dt`/`dd` children on one grid with `grid-template-columns: minmax(7.25rem, max-content) minmax(0, 1fr)` and explicit `grid-column: 1 | 2`.

**Office row:** removed from rental summary UI only (`summary-label-office` / office value gone). Vehicle, plate, duration, agreed amount remain; price hero unchanged.

**Card top alignment:** internal document-verification progress sat above the licence card in the main column only, lifting the workflow card below the summary. **Fix:** progress spans full layout width (`stageProgress`); `columns` row holds main + aside so first cards share the same top Y (Playwright Δy ≤ 3px).

**White background seam:** `html`/`body` both used `height: 100%` while body carried the gradient; scrolled content could expose an unpainted html band. **Fix:** `background: var(--diamond-page-bg)` + `background-attachment: fixed` on `html`, transparent `body`, public-rental `.root` `min-height: 100dvh` without overriding pattern.

**Playwright:** value/label column spread ≤ 3px, card top alignment, office absent, `expectPageBackgroundContinuous`.

---

## PROGRESS HIERARCHY + PASSPORT PREVIEW / REUPLOAD

### Main vs Stage-1 progress

- **Top stepper** (`rental-progress`) stays page-level: darker gold connector gradient, active marker depth, hover lift (≈220–240ms, no looping shimmer). Stronger than Stage-1 sub-progress.
- **Stage-1 sub-progress** (`stage1-sub-progress` / `document-verification-progress`) is workflow-level: smaller markers (16px), lighter connectors, 10px type. Rendered **immediately above** the active verification card (`active-stage-card`): licence card, passport card, or renter form. Verified licence/passport summaries sit **above** the sub-progress when those steps are complete.

### Passport preview source

- **During capture:** in-memory `blob:` URL from the selected file (same pattern as licence).
- **After persist / refresh:** `identity.passport.previewAvailable` + token-scoped `GET /contracts/rental/:token/passport/preview` (no attachment id exposed; `Cache-Control: private, no-store`). Frontend helper: `resolvePassportPreviewUrl`.

### Passport re-upload

- Success UI keeps image preview, read-only passport number (`VerifiedDocumentValue`), and **Upload Another Passport** / **رفع جواز آخر** (`PublicRental.passport.replace`).
- Re-upload runs existing `POST /contracts/rental/:token/passport`; superseded documents stay server-side. UI follows **current** context only (upload/processing phases override stale READY; failed retake clears verified fields per backend).
- Passport summary card remains on **Renter Details** so preview/re-upload match licence behaviour.

### Playwright

- Headed: `npx playwright test e2e/public-rental-premium-ui.spec.ts --headed --workers=1`
- Geometry: `expectStage1SubProgressAboveCard` — gap from sub-progress bottom to `active-stage-card` top ≤ **14px** (`STAGE1_SUB_PROGRESS_GAP_TOLERANCE_PX`).
- Passport happy path, re-upload (POST intercept for deterministic number change), mobile 390×844, main stepper hover.

### Minimal backend wiring (no OCR / Prisma changes)

- `PublicRentalContext.identity.passport.previewAvailable`
- `GET /contracts/rental/:token/passport/preview` streams the active non-superseded passport capture.

---

## FIXED STAGE-1 PROGRESS + ANIMATED MAIN CONNECTOR

### Design direction (references reviewed)

Reviewed premium stepper / connector patterns (Dribbble checkout wizards, CodePen animated step connectors). Diamond implementation is **original CSS**: continuous gold rail + travelling highlight on hover/focus — not a third-party component.

### Main rental progress

- Continuous **2px** connector rail (`rental-progress-connector`) between stage markers; shared tokens in `public-rental-motion.module.css`: `--diamond-progress-gold-base`, `--diamond-progress-gold-active`, `--diamond-progress-gold-comet`, `--diamond-progress-cycle` (**2.4s**).
- **Three layers:** base track (`railBase`), state fill (completed vs future gradient), always-on **Gold Comet** (`railPulseSegment`, `rentalConnectorCometLtr` / `rentalConnectorCometRtl`) — no hover required.
- Active stage marker: subtle `rentalActiveBreath` (~3.4s).
- `prefers-reduced-motion`: comet and breath disabled; static gold rail and state fills remain.

---

## CINEMATIC PROGRESS & SUCCESS TRANSITIONS

### Stage-1 sub-progress — Success Current

- Smaller travelling highlight on the **reached** segment only (`document-sub-progress-comet`, ~**2.8s** `--diamond-sub-progress-cycle`).
- Substages: Licence — local sweep + active marker pulse; Passport/Renter — comet on completed→current; Renter Details — full reached span when applicable.
- Fixed slot unchanged: `stage1-sub-progress` → `active-stage-card` → summaries below.

### Stage success interstitial

- Component: `StageSuccessTransition` (`data-testid="stage-success-transition"`), `STAGE_SUCCESS_DURATION_MS = 2000`.
- Shown **only after** successful `submitForm` (Documents verified / `تم التحقق من المستندات`) or contract sign (`تم توقيع العقد بنجاح`); then existing `goToStage` / post-sign routing.
- Full-viewport Diamond page background; inline SVG circle + check (`stroke-dashoffset` draw, one pulse); `role="status"` + `aria-live="polite"`.
- Reduced motion: restrained fade/static check; navigation timing unchanged.

### Playwright (headed)

- Main comet: `expectMainProgressAutoMotion` — `animation-play-state: running`, no hover; screenshots `main-progress-auto-t0.png` / `main-progress-auto-t1.png`.
- Sub comet: `expectSubProgressAutoMotion` at Licence / Passport / Renter.
- Documents save: transition visible before `contract-review`; SVG stroke animation; duration ~**1800–2300ms** measured from transition show to review.
- Contract sign: same component after `/official-contract/sign` success.
- `reducedMotion: "reduce"` project: travelling animations off.

```bash
cd APP/frontend
npx playwright test e2e/public-rental-premium-ui.spec.ts --headed --workers=1
```

### Fixed Stage-1 sub-progress

**Before:** sub-progress was rendered in different positions per substage (below licence summary on Passport/Renter), so **Y jumped**.

**After:** `stage1-workflow` renders once in `public-rental-screen`:

1. `stage1-sub-progress` (always first — stable **X/Y/width**)
2. `active-stage-card` (Licence / Passport / Renter dialog only)
3. `stage1-completed-summaries` (verified licence/passport summaries **below** the active dialog when past Licence)

Sub-progress width matches `active-stage-card` (same workflow column). Vertical gap sub-progress → active card ≤ **16px**; summaries no longer sit above the active dialog, so sub-progress does not jump between substages.

### Playwright (headed) — geometry

- `expectSubProgressStability` (X/width spread ≤ **3px**), `expectSubProgressAlignedToActiveCard` (Δx/Δwidth ≤ **4px**).
- Cinematic motion and success transitions: see **CINEMATIC PROGRESS & SUCCESS TRANSITIONS** above.
