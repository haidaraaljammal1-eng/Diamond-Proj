# MRZ-A21 nationality code dataset

Static validation data for TD3 line 2 **holder nationality** cells (indices 10–12).

| Field | Value |
|-------|--------|
| **ICAO source** | Doc 9303 Part 3 Section 5 (8th Edition, 2021) |
| **ISO source** | ISO 3166-1 alpha-3 via [ISO 3166 country codes](https://www.iso.org/iso-3166-country-codes.html) (249 codes in this file) |
| **ICAO Part A (non-ISO nationality)** | `GBD`, `GBN`, `GBO`, `GBP`, `GBS`, `RKS` |
| **ICAO Part E (special nationality/status)** | `XXA`, `XXB`, `XXC`, `XXX` |
| **MRZ physical slot exception** | `D<<` → canonical `D` (Germany; three MRZ cells) |
| **Excluded from this file** | Part D issuing-authority codes (`XBA`, `XCC`, …); Part B `EUE` (not holder nationality) |
| **Entry count** | **260** nationality-slot keys |
| **Runtime network** | None |

Machine-readable table: `data/icao_mrz_nationality_codes.json`.

Correction (`scripts/mrz_nationality_slot.py`): constrained **O↔0** toggles only; accept raw slot if in dataset; auto-correct only when **exactly one** authoritative candidate exists; otherwise **REVIEW**. No issuing-state inference, no fuzzy or nearest-country repair.
