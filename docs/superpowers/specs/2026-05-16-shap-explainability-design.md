# SHAP Explainability Integration Design

## Context

The peringatan-cuaca system uses a rule-based inference engine ("SHAP Model API") to classify disaster risk from fisherman reports. The rules were derived from SHAP analysis of community survey data conducted during thesis research. Currently, the system produces risk classifications (safe/unsafe/unsafe-high) and action recommendations but provides **no explanation** for why a particular classification was made.

This design adds explainability to every prediction: which natural signs contributed, which community factors influenced the decision, and whether BMKG weather data agreed with the assessment.

## Goals

1. Every alert includes a machine-readable explanation with weighted contributions per factor
2. Frontend displays layered explanations: simple for fishermen, detailed for researchers/examiners
3. No changes to the existing report submission pipeline or alert distribution flow
4. Explanation is computed once at alert creation time and stored — no runtime recomputation

## Architecture

```
Fisherman reports !lapor
        |
        v
Crowdsource Queue (Redis, 5 reports / 10 min)
        |
        v  threshold met
ML Service POST /predict (ENHANCED)
  - Existing: risk classification, action recommendation
  - NEW: contribution weights per factor, community profile breakdown, NL summary
        |
        v
Backend stores explanation in shap_predictions.raw_response
        |
        v
Backend runs reassurance (SHAP vs BMKG cross-validation)
        |
        v
Alert created with embedded explanation data
        |
        v
Frontend renders layered explanation views
```

## Component 1: ML Service Enhancement

### File: `SHAP-model-api/src/engine/inference_engine.py`

Add `compute_contributions()` method to `InferenceEngine`.

### Weight Assignment Logic

**LIK sign weights** (based on action escalation level):

| Action Level | Label | Weight |
|---|---|---|
| 0 | Berhati-hati / Tingkatkan Kewaspadaan | 0.3 |
| 1 | Siaga Penuh / Amankan Alat Tangkap | 0.6 |
| 2 | Sesuaikan Jadwal Melaut | 0.9 |

**Community factor weights:**

| Factor Status | Weight |
|---|---|
| Unsafe | 0.5 |
| Safe | 0.0 (no contribution) |

### Normalization

All weights are normalized to sum to 1.0, producing a percentage contribution per factor.

### Example Calculation

Input: Pantai Samas, LIK codes [Wn-4, Wn-7]

```
Raw weights:
  Wn-4 (level 1)        = 0.6
  Wn-7 (level 0)        = 0.3
  Frequency (Unsafe)    = 0.5
  Duration (Unsafe)     = 0.5
  Experience (Unsafe)   = 0.5
  Interaction (Safe)    = 0.0
  LIK Combo (Safe)      = 0.0

Sum = 2.4

Normalized:
  Wn-4       = 25%
  Frequency  = 21%
  Duration   = 21%
  Experience = 21%
  Wn-7       = 12%
```

### Enhanced `/predict` Response

```json
{
  "active_warning": ["Wn-4", "Wn-7"],
  "sign_description": "...",
  "community_characteristics": "Actionable",
  "action_recommendation": "...",
  "triggered_lik_codes": ["Wn-4", "Wn-7"],
  "explanation": {
    "summary_id": "Bahaya karena ombak besar (25%), frekuensi pelaporan rendah (21%), durasi penggunaan singkat (21%), pengalaman bencana kurang (21%), dan angin kencang (12%)",
    "summary_en": "Danger due to high waves (25%), low reporting frequency (21%), short usage duration (21%), limited disaster experience (21%), and strong winds (12%)",
    "contributions": [
      {
        "factor": "Wn-4",
        "label_id": "Ombak Besar",
        "label_en": "High Waves",
        "category": "natural_sign",
        "weight": 0.25,
        "direction": "increases_risk",
        "detail_id": "Gelombang tinggi terdeteksi oleh nelayan",
        "detail_en": "High waves detected by fishermen"
      },
      {
        "factor": "frequency",
        "label_id": "Frekuensi Pelaporan",
        "label_en": "Reporting Frequency",
        "category": "community",
        "weight": 0.21,
        "direction": "increases_risk",
        "detail_id": "Nelayan jarang melapor (2.6x/bulan)",
        "detail_en": "Fishermen rarely report (2.6x/month)"
      }
    ],
    "community_profile": {
      "beach": "pantai_samas",
      "overall": "Unsafe",
      "factors": [
        {
          "key": "interaction",
          "label_id": "Interaksi Bencana",
          "label_en": "Disaster Interaction",
          "value": 2.13,
          "status": "Safe",
          "detail_id": "Cukup berinteraksi dengan bencana",
          "detail_en": "Adequate disaster interaction"
        },
        {
          "key": "frequency",
          "label_id": "Frekuensi Penggunaan",
          "label_en": "Usage Frequency",
          "value": 2.59,
          "status": "Unsafe",
          "detail_id": "Jarang menggunakan sistem",
          "detail_en": "Rarely uses the system"
        },
        {
          "key": "duration",
          "label_id": "Durasi Penggunaan",
          "label_en": "Usage Duration",
          "value": 4.97,
          "status": "Unsafe",
          "detail_id": "Durasi penggunaan singkat",
          "detail_en": "Short usage duration"
        },
        {
          "key": "lik_combination",
          "label_id": "Kombinasi LIK",
          "label_en": "LIK Combination",
          "value": 1.63,
          "status": "Safe",
          "detail_id": "Cukup mengenal tanda alam",
          "detail_en": "Adequate knowledge of natural signs"
        },
        {
          "key": "experience",
          "label_id": "Pengalaman Bencana",
          "label_en": "Disaster Experience",
          "value": 1.50,
          "status": "Unsafe",
          "detail_id": "Pengalaman bencana terbatas",
          "detail_en": "Limited disaster experience"
        }
      ]
    }
  }
}
```

## Component 2: Backend Changes

### No Schema Changes

The `shap_predictions` table already has a `raw_response` JSON column. The explanation data is stored there. The `reassurance_results` table already stores `details` JSON. No migration needed.

### New Endpoint: `GET /api/alerts/:id/explanation`

File: `src/routes/alerts.ts` (add to existing)

Extracts the explanation from stored alert data:
1. Look up alert in Redis stream by alertId
2. Extract `ml` and `decision` fields from the alert event
3. Extract reassurance result from `reassurance_results` table by reportId
4. Combine into a single explanation payload

Response:
```json
{
  "alertId": "e2daf758-...",
  "riskLevel": "unsafe-high",
  "beachLocation": "pantai_samas",
  "summary_id": "Bahaya karena...",
  "summary_en": "Danger due to...",
  "contributions": [...],
  "communityProfile": {...},
  "reassurance": {
    "shapRisk": "HIGH",
    "bmkgRisk": "HIGH",
    "agreed": true,
    "finalLevel": "HIGH",
    "bmkgDetails": {
      "waveHeight": 2.5,
      "windSpeed": 35,
      "hasWarning": false
    }
  },
  "createdAt": "2026-05-16T12:00:00Z"
}
```

### Existing Endpoints: Enhanced Alert Data

The existing `GET /api/alerts` response already includes `ml` and `decision` objects in each alert event. The frontend can extract explanation data directly from these without needing the separate explanation endpoint for the basic view.

For the full detailed view (including reassurance + BMKG details), the new `/api/alerts/:id/explanation` endpoint is needed.

## Component 3: Frontend Changes

### New Dependency

Add `recharts` for the contribution bar chart visualization.

### Modified Component: `alert-card.tsx`

Add an expandable "Kenapa?" section below the existing alert content:

```
Alert Card
  ├── Existing: icon, title, time, reporter count, signs list
  ├── NEW: "Kenapa bahaya?" expandable section
  │     ├── Bullet points from summary_id (top 3-5 factors)
  │     └── "Lihat Penjelasan Lengkap" button
  └── NEW: ExplanationPanel (shown when expanded)
        ├── ContributionBarChart (recharts horizontal bar)
        ├── CommunityProfileTable
        └── CrossValidationBadge
```

### New Component: `explanation-panel.tsx`

Contains three sub-sections:

1. **ContributionBarChart** — horizontal bar chart showing each factor's contribution percentage
   - Natural signs in red/orange tones
   - Community factors in blue/purple tones
   - Sorted by contribution descending
   - Labels in Indonesian

2. **CommunityProfileTable** — 5-row table showing community factors for the alert's beach
   - Each row: factor name, value, status badge (Safe=green, Unsafe=red)
   - Overall category displayed as header

3. **CrossValidationBadge** — compact visual showing SHAP vs BMKG agreement
   - Green checkmark if agreed
   - Yellow warning if disagreed
   - Shows both risk levels and final reconciled level

### Data Flow in Frontend

```
1. AlertCard renders with alert data from /api/alerts
2. Alert data already contains ml.sign_description, ml.community_characteristics,
   ml.triggered_lik_codes, decision fields
3. "Kenapa?" section reads these fields directly for the basic bullet points
4. When user taps "Lihat Penjelasan Lengkap":
   a. If alert has full explanation in ml field → render directly
   b. Otherwise → fetch GET /api/alerts/:id/explanation → render
5. ExplanationPanel renders chart + table + badge from the explanation data
```

## Thesis Value

### Research Contribution

The system demonstrates that SHAP-informed explainability can be integrated into a disaster early warning system for coastal communities, providing:

1. **Per-prediction transparency** — every alert comes with a factor-by-factor breakdown
2. **Community-aware risk assessment** — the system accounts for community preparedness, not just environmental data
3. **Cross-validation with authoritative sources** — BMKG data provides an independent verification layer
4. **Accessible explanations** — layered UI serves both end users (fishermen) and researchers

### Defensible Claims

- "The system uses SHAP-derived feature importance to provide real-time explainability for disaster risk predictions"
- "Contribution weights are derived from the SHAP analysis conducted during the research phase, where community characteristics and natural signs were ranked by their predictive importance"
- "The reassurance mechanism cross-validates community-based predictions with BMKG meteorological data"

## Implementation Order

1. **ML service**: Add `compute_contributions()` to inference engine, enhance `/predict` response
2. **Backend**: Add `/api/alerts/:id/explanation` endpoint, ensure explanation data flows through existing pipeline
3. **Frontend**: Add recharts, modify alert-card, create explanation-panel
4. **Testing**: Update ML service tests, add backend endpoint test, verify end-to-end with real alert

## Constraints

- No changes to report submission, crowdsource queue, or alert distribution
- No new database tables — explanation data stored in existing JSON columns
- No new infrastructure — same containers, same network
- Decoupled from bot/ESP32 layer — explanation is a read-only feature on stored data
- **Bot input/output is not affected**: The ML `/predict` response only gains an additional `explanation` field. All existing fields (`community_characteristics`, `action_recommendation`, `sign_description`, `triggered_lik_codes`) remain unchanged. The bot formats WhatsApp replies from existing fields and never reads `explanation`. The `GET /api/report/submit` route passes ML response through unchanged. Alert events published to Redis carry the same structure with extra data the bot ignores.
- **No changes to webhook processing**: `openclaw-webhook.ts` and `whatsapp-commands.ts` are untouched
- **No changes to OpenClaw bridge**: Redis outbound stream format remains identical
