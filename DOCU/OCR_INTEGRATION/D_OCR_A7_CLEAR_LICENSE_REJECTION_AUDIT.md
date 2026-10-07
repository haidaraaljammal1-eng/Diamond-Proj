# D-OCR-A7 — Clear Licence Rejected (Root Cause Audit)

**Phase:** D-OCR-A7 (audit only — **0 production changes**)  
**Baseline:** `D_OCR_V1_3_FULLY_VERIFIED` / `OCR_ENGLISH_V1_3_TWO_FIELD`  
**Scoring-only ground truth (not stored in repo):** licence number `5128524`, expiry `30/01/2028` (future → **VALID** if both fields read)

**Local diagnostics:** `DOCUMENT-ENGINE/LICENSE/output/a7_khader_sample/` (gitignored)  
**Runner:** `DOCUMENT-ENGINE/LICENSE/scripts/a7_clear_license_rejection_audit.py`

---

## Executive summary

The **attached clear licence photograph** (JPEG, 1024×626) **does not fail** V1.3 or Diamond. It **ACCEPTs** on `:8020` and produces **`DrivingLicenseVerification.status = VALID`** through the real backend upload path.

The Diamond **“تعذر قراءة الرخصة”** UI is the correct rendering of backend **`UNREADABLE`**, but that state **was not reproduced** with the attached source JPEG. It **was reproduced** when sending a **wide UI screenshot** (1024×437, aspect **2.34**) to `:8020`: **Crop V1 input validation fails** before OCR → Fastify maps to **`UNREADABLE`**.

**Primary root cause (for observed product failure class):** **input framing / aspect-ratio gate (Crop V1 validation)** — not V1.3 number OCR, not expiry OCR, not Diamond policy on a successful engine read.

**Verdict:** `D_OCR_A7_ROOT_CAUSE_FOUND`

---

## 1. Reproduction matrix

| Input | `:8020` HTTP | `document_status` | Diamond smoke (`b6f-live-smoke-once`) |
|--------|--------------|-------------------|----------------------------------------|
| Attached **licence photo** (`input.jpg`) | **200** | **ACCEPT** | **VALID**, number + expiry persisted |
| **UI screenshot** (`ui_screenshot.png`) | **422** | — (crop never completes) | Not run (engine error) |

Diamond UI screenshot shows unreadable **while displaying a preview** of a licence-like image — consistent with **engine/adapter UNREADABLE** on a **failed crop/OCR path**, not a frontend bug.

---

## 2. Direct `:8020` (attached photo)

- **HTTP:** 200  
- **`document_status`:** ACCEPT  
- **`license_number`:** 5128524 (ACCEPT, `ppocrv5_en_stability`)  
- **`expiry_date`:** 30/01/2028 (ACCEPT, `date_policy`)  
- **`engine_release`:** OCR_ENGLISH_V1_3_TWO_FIELD  

---

## 3. Geometry gate (attached photo)

| Check | Value |
|--------|--------|
| Image size | 1024 × 626 |
| Aspect ratio | **1.636** (within Crop V1 **[1.25, 2.1]**) |
| `handoff_quality` | INPUT_OK_FOR_CROP_AND_OCR |
| Table status | TABLE_OK |
| Table width / image | **0.78** |
| Table height / image | **0.60** |
| Geometry verdict | **GEOMETRY_OK** |
| **Rejected before OCR?** | **NO** |

### UI screenshot (failure proxy)

| Check | Value |
|--------|--------|
| Aspect ratio | **2.343** |
| Validation | **INPUT_INVALID** — aspect outside [1.25, 2.1] |
| **Rejected before OCR?** | **YES** |

---

## 4. Deskew / perspective (attached photo)

- **Deskew applied:** yes (~−0.98° detected, −0.52° applied)  
- **Final angle:** ~0°  
- Row lines usable; row-1 / row-7 crops **CROP_CLEAN**  
- Visible **perspective** (card tilt) remains but **does not block** this sample after deskew + table detect  

System handles **rotation deskew**, not full **perspective warp** — not the limiting factor for this JPEG.

---

## 5. Row 1 (licence number)

| Metric | Value |
|--------|--------|
| Row size | 801 × 54 px |
| Trim size | 478 × 54 px |
| Digit height (trim) | **~26 px** |
| Classification | **CROP_CLEAN** |
| Hologram | Over table; number band readable; all digits in trim |

### V1.3 PP stability (production path)

| Variant | Digits | Confidence |
|---------|--------|------------|
| RAW | 5128524 | ~0.86 |
| CLAHE | 5128524 | ~0.93 |
| OTSU | 5128524 | ~0.98 |

**Stable PP:** 5128524 (3/3 agree)

### Independent veto readers (UP2 crop)

| Engine | Digits |
|--------|--------|
| Tesseract | 56 (garbage partial) |
| RapidOCR | 5128524 |

**Veto triggered?** **NO** (Tess ≠ Rapid)  
**Final number:** **ACCEPT** / 5128524  

---

## 6. Row 7 (expiry)

- Trim **463 × 46**, CROP_CLEAN  
- **ACCEPT** `30/01/2028` (normalized calendar **2028-01-30** in Diamond DB)

---

## 7. Engine aggregation

Both required fields ACCEPT → **`document_status` = ACCEPT** (orchestrator rule unchanged).

---

## 8. Diamond backend chain (attached photo)

`uploadDrivingLicense` → `analyzeDrivingLicenseDocument` → `:8020` → `evaluateDrivingLicenseOcr`:

- **`ocr.ok`:** true  
- **`licenseNumber`:** 5128524  
- **`expiryDate`:** 2028-01-30 (ISO)  
- **`verification.status`:** **VALID**  
- **`engineDocumentStatus`:** ACCEPT  

No adapter/policy remapping error when engine succeeds.

### On engine HTTP error (422 crop)

`extractDrivingLicenseFromImage` → error → `mapClientError` → **`ok: false`, reason UNREADABLE** → policy stores **UNREADABLE**, null number/expiry.

---

## 9. Frontend

`licensePanelFromStatus("UNREADABLE")` → **`license-unreadable`** — display-only; **does not cause** engine failure.

---

## 10. Comparison vs Mohamed / Marlon

| | Mohamed | Marlon | This sample (photo) |
|--|---------|--------|---------------------|
| Digit height | ~11 px | ~17 px | **~26 px** |
| V1.3 outcome | ACCEPT (after upgrade) | ACCEPT | **ACCEPT** |
| Failure mode in corpus | Wrong V1.2 digits | — | N/A (passes) |

This licence is **easier** numerically than Mohamed (larger digits, stable PP). Failure is **not** explained by V1.3 conservatism on the attached JPEG.

---

## 11. V1.3 conservatism on this sample

**NO** — stable PP + no Tess/Rapid veto; not a false reject.

---

## 12. Experimental recovery (Step 23)

**N/A** — production path already reads **5128524**; no local OCR experiments required.

---

## 13. Recommended next action (one)

**A. NO OCR CHANGE** — enforce/clarify **framing**: full licence photo within aspect ratio **[1.25, 2.1]**; avoid **screenshots**, ultra-wide crops, or images where the card is a small fraction of the frame. Optional product copy already mentions re-upload with full licence visible.

Alternative if user insists on screenshot uploads: future **B. geometry / input validation** work (out of scope for A7).

---

## 14. Future implementation tests (if framing UX changes)

- This sample (full JPEG) → **VALID**, 5128524, 2028-01-30  
- Wide aspect / screenshot → **UNREADABLE** (no false numeric accept)  
- Mohamed / Marlon regressions unchanged  
- `:8020`, backend bridge, Playwright EXPIRED/VALID/UNREADABLE  

---

## 15. Privacy

Real plate image only under `output/a7_khader_sample/` — **gitignored**, not in DOCU/fixtures.

---

## 16. Gaps / not captured

- **Exact bytes** of the user’s failing browser upload were not available; audit used attached photo + UI screenshot proxy.  
- **DB row** for the failing rental token was not inspected (no token provided).
