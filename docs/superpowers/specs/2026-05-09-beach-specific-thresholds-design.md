# Beach-Specific Report Thresholds

## Problem

The backend uses a single global `REPORT_THRESHOLD = 5` for all beaches. However, communities have different risk behaviours:

- **Safe communities** (Lampuuk, Ulee Lheue): trusted, easily convinced by fewer reports — threshold should be **3**
- **Unsafe communities** (Depok, Samas, Lhoknga): sceptical, need more evidence — threshold should be **5**

This mapping comes from the SHAP model's `community_rule_categorization.csv` `Overall Category` column.

## Solution

Add a per-beach threshold map in `config.ts` and look it up in the report route before calling `processReport()`.

### Beach Threshold Mapping

| Beach | Overall Category | Threshold |
|-------|-----------------|-----------|
| pantai_lampuuk | Safe | 3 |
| pantai_ulee_lheue | Safe | 3 |
| pantai_depok | Unsafe | 5 |
| pantai_samas | Unsafe | 5 |
| pantai_lhoknga | Unsafe | 5 |

### Changes

**`disaster-backend/src/config.ts`:**
- Add `BEACH_THRESHOLDS: Record<string, number>` with the mapping above
- Keep `REPORT_THRESHOLD` as fallback for unknown beaches

**`disaster-backend/src/routes/report.ts` (line ~144):**
- Replace `REPORT_THRESHOLD` with `BEACH_THRESHOLDS[beachLocation] ?? REPORT_THRESHOLD`
- Pass the resolved threshold to `processReport()`

### What doesn't change
- `processReport()` in `crowdsource.ts` — already accepts threshold as a parameter
- SHAP model — no changes
- OpenClaw broadcast — fires after threshold, no change needed
- Frontend — no changes
- `REPORT_WINDOW_MS` and `ACTIVE_WARNING_TTL_SECONDS` — stay global

### Testing
- Unit test: verify `BEACH_THRESHOLDS` lookup returns correct value per beach and falls back to `REPORT_THRESHOLD` for unknown beach
- Integration test: submit 3 reports to Lampuuk → triggers; submit 3 to Depok → does NOT trigger, submit 5 → triggers
