# 01 — Repository flow (baseline)

**Audit:** D-OCR-A1 (read-only). **Date:** 2026-10-04.

## Git baseline (evidence)

| Item | Value |
|------|--------|
| Repo root | `C:\Users\Rw\Documents\DIAMOND-SYSTEM` |
| Branch | `main` |
| HEAD | `96cbce6a9c2a8ae44044c5732304dc6e5497cf02` |
| vs `origin/main` | **ahead 1** (local commit not pushed) |

**Uncommitted work (not modified by this audit):** Passport Document Engine integration + `dev-with-passport-api.ts`, `DOCUMENT-ENGINE/PASSPORT/`, `document-engine` client, docs, tests, i18n. See `git status` / `git diff --stat` at audit time.

## Top-level layout

| Path | Role |
|------|------|
| `APP/backend` | Fastify 5 + Prisma + contracts/public rental (approved backend) |
| `APP/frontend` | Next.js 16 public rental + staff AppShell |
| `DOCU/` | Shared documentation |
| `DOCUMENT-ENGINE/` | Internal Python engines (Passport live; `LICENSE/` reserved) |
| `PRODUCT.md` | Product narrative (public rental steps) |

No root `package.json`. Dev: `APP/backend` → `npm run dev` (orchestrates Passport API when configured); `APP/frontend` → `npm run dev` (port 3100).

## Public rental flow (verified in code)

Progress steps (`rental-progress.tsx`): **`license` → `contract` → `payment`** (+ `handover` after payment).

1. **License step:** upload driving licence + passport capture on same stage UI (`public-rental-screen.tsx`).
2. **Contract step:** customer form + terms (`contract-step.tsx`); official A4 review/sign later in flow.
3. **Payment / handover:** collection mode dependent.

Flow step is **backend-derived** (`derivePublicRentalFlowStep` + `public-rental-context.ts`), not a frontend-only state machine.

## Document processing today

| Document | Production path |
|----------|-----------------|
| Passport | `extractPassportNumberFromImage` → HTTP Passport API (`DOCUMENT-ENGINE/PASSPORT`) |
| Driving licence | `analyzeDrivingLicenseDocument` → **NOT_CONFIGURED** (fail-closed) |

See `02_CURRENT_LICENSE_UPLOAD_FLOW.md` and `03_OCR_EXISTING_CODE_AUDIT.md`.

## External OCR (out of repo, read-only reference)

| Project | Path |
|---------|------|
| Crop V1 frozen | `C:\Users\Rw\UAE_LICENSE_CROP_V2` (`DYNAMIC_CROP_V1` release) |
| OCR English V1.1 | `C:\Users\Rw\UAE_LICENSE_OCR_V1` (`release/OCR_ENGLISH_V1_1_RUNTIME`) |

Not copied into Diamond in this audit.
