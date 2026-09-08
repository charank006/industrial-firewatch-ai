# Industrial FireWatch v2 — Technical Architecture & Provider Decisions

This document details all technical decisions requiring environment configuration, tile provider configurations, backend database connections, notification API credentials, and user privacy enforcement rules.

---

## 1. Map & GIS Tile Providers

| Configuration Item | Decision / Provider | Status | Environment Variable |
| :--- | :--- | :--- | :--- |
| **Dark Vector GIS Basemap** | Carto Dark Matter (`https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`) | **ACTIVE (FALLBACK READY)** | `VITE_MAP_STYLE_URL` |
| **Satellite Imagery Layer** | Esri World Imagery (`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`) | **ACTIVE** | `VITE_SATELLITE_TILE_URL` |
| **NASA GIBS Tile Layer** | NASA GIBS Near Real-Time MODIS / VIIRS true color imagery | **READY** | `VITE_NASA_GIBS_URL` |

> [!NOTE]
> If custom tile provider credentials are required in production, specify `VITE_MAP_STYLE_URL` in `frontend/.env`. If omitted, the application uses the default Carto Dark and Esri World Imagery fallback services.

---

## 2. Spatial Database & Backend Setup

| Service | Technology | Status | Connection String / Config |
| :--- | :--- | :--- | :--- |
| **Backend Framework** | Python 3.11+ / FastAPI | **IMPLEMENTED (`backend/app/main.py`)** | `uvicorn app.main:app --port 8000` |
| **Spatial Database** | PostgreSQL + PostGIS | **READY (SRID 4326)** | `DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/firewatch_db` |
| **Spatial Querying** | PostGIS `ST_DWithin` & Haversine | **ACTIVE (`spatial_service.py`)** | Spatial queries calculate 500m, 1km, 2km, and custom admin radii |

---

## 3. Emergency Notification Services & Demo Mode

| Channel | Provider | Configuration Variables | Demo Mode Behavior |
| :--- | :--- | :--- | :--- |
| **Push Notifications** | Firebase Cloud Messaging (FCM) | `FCM_PROJECT_ID`, `FCM_CREDENTIALS` | Logs simulated FCM push payloads when credentials are unconfigured |
| **SMS Emergency Broadcast** | Twilio SMS API | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Logs simulated SMS dispatch when credentials are unconfigured |
| **Email Dispatch** | SendGrid v3 Mail API | `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` | Logs simulated Email dispatch when credentials are unconfigured |

### Notification Lifecycle States
All emergency alerts follow an explicit state lifecycle:
$$\text{QUEUED} \longrightarrow \text{SENT} \longrightarrow \text{DELIVERED} \longrightarrow \text{READ} \longrightarrow \text{ACKNOWLEDGED}$$

In **Demo Mode**, the backend generates realistic state progression while clearly labeling all alerts with `DEMO MODE / BETA SIMULATION` to prevent false emergency claims.

---

## 4. User Privacy & Safety Rules

1. **Opt-in Enforcement**: Only users with `notification_opt_in = True` are included in public risk radius alerts.
2. **Contact Masking**: Personal phone numbers and email addresses are masked (`+91 98250 XXX23`) in public UI views to protect user privacy.
3. **Admin Alert Authorization**: Alert dispatch requires explicit admin/operator authorization (`POST /api/incidents/{id}/alerts/authorize`). Accidental map clicks will not trigger public alerts.

---

## 5. Fire Source Classifier — Tuning Log

The model is `backend/app/services/classifier/rules_v1.json`. `model_version`
is `rules-v1.<sha256(file)[:6]>`, so every weight change is traceable and
needs no redeploy. Phase 8 swaps the whole file for a trained model behind an
identical output contract (`{prediction, confidence, probabilities,
model_version, model_kind}`).

### Design

An additive log-evidence model (hand-weighted multinomial logit), not an
if/elif cascade. `score_c = bias_c + Σ w[i][c]·f_i`, then `softmax(score/T)`.
Every evidence term `f_i` is bounded to [0,1] so weights stay comparable.

`unknown` carries a bias and **no** evidence terms, so it wins by construction
when nothing else scores — there is no special-case default branch.

### Tuning changes

| Change | Reason |
| :--- | :--- |
| `temperature` 1.0 → **1.3** | Hand weights with a raw softmax are badly overconfident. A textbook industrial case scored **0.90** against the spec's own worked example of 0.81; T=1.3 brings it to ~0.83. |
| `gas_tags.gas_oil` 3.0 → **4.5**, `gas_tags.industrial` +0.3 → **−1.0** | Gas/Oil was unreachable in practice: industrial's own terms (`inside_industrial` + `industrial_area` + `factory_near` ≈ 4.9) always outweighed a single positive gas signal. Heavy hydrocarbon tagging must pull *away* from generic industrial, not reinforce it. |
| `suggested_action` prefix keyed on **severity**, not class | Keying urgency on class alone emitted "CRITICAL ALERT" on a MEDIUM-severity event — an urgency the assessment did not support. |

### Deliberate constraints

- **Weather barely discriminates class** (spec Rule 2). Temperature and VPD
  anomalies are evidence of unusual *conditions*, not of a fire's *source*, so
  their class weights are small and they are routed into severity instead.
  Giving ΔT a large industrial weight produces confidently wrong answers.
- **Flare vs Industrial** turns on `frp_stable` — stability against the site's
  **own** historical median — not an absolute megawatt threshold. The retired
  `classificationEngine.ts` used `frpMw > 100`, which is exactly the mistake.
- **Urban carries a −1.4 bias** and needs both residential density *and* low
  vegetation, or every peri-urban agricultural fire in a dense country returns
  Urban.
- **Gas/Oil requires specific tags** (`petroleum_well`, `storage_tank`,
  `gasometer`, `flare`, `industrial=oil|gas|refinery`), never generic industry.
- **Probability floor 0.02**: no class is ever exactly zero (spec Rule 8).
- **Confidence** blends `p_top`, margin and normalised entropy, then multiplies
  by a data-quality factor that deducts for sparse OSM, a partial weather
  baseline, and single-observation events — so thin inputs visibly lower
  confidence rather than silently passing as certainty.

### Known limitation

`recurrence_count` is the strongest flare-vs-fire signal and starts at **zero**
on day one: FIRMS `day_range` maxes at 10 and true archive access needs a
manual request form. Until history accumulates, genuine flares will tend to
score as industrial. The UI reports recurrence as "N in the last D days of
system history" with a real D rather than implying 180.

---

## 6. Background Scheduling & Operations

Jobs run in-process on the FastAPI event loop via APScheduler, started and
stopped by the app lifespan. The frontend never drives the pipeline (spec §24).

| Job | Interval | Purpose |
| :--- | :--- | :--- |
| `firms_ingest` | 15 min | Poll 4 FIRMS sources, dedupe, cluster into events |
| `event_analysis` | 2 min | Drain `analysis_status='pending'` through weather + OSM + classifier |
| `containment_sweep` | 6 h | Mark events with no detection for 24 h as contained |

### Why these settings

- **`max_instances=1`, `coalesce=True`.** Overpass can take a full minute per
  event, so an analysis pass can outlast its own 2-minute interval. Without
  these, overlapping runs compete for the same pending rows and multiply load
  on the service that was already slow.
- **Small batch, frequent** rather than large batch, rare — a long batch holds
  a database session open for minutes.
- **15-minute FIRMS cadence** is ~384 requests/day against a ~5,000-per-10-min
  limit. Cadence is not the constraint; politeness is.
- **Failures are recorded, not raised.** A job that raises is logged and
  dropped by APScheduler. Every ingest writes to `ingest_runs` whether it
  succeeded or failed, and `/api/system/status` reports that history — because
  the failure mode that matters is *silence*, where the API keeps serving
  yesterday's data and nothing looks broken.

### Single-instance assumption

Running more than one uvicorn worker starts **one scheduler per worker**, so
FIRMS would be polled N times over. For multi-worker deployments set
`SCHEDULER_ENABLED=false` and run the jobs from their own process.

### Credential handling

The FIRMS `MAP_KEY` is a **URL path segment**, and httpx logs full request URLs
at INFO — which wrote the key in plaintext into every log file and any pasted
traceback. Both entry points now set `httpx`/`httpcore` loggers to WARNING.
This is pinned by a test, because the leak is invisible until someone shares a log.

### Operations CLI

```
python -m app.workers.cli backfill [days]   # seed history; FIRMS caps at 10
python -m app.workers.cli ingest            # one ingest pass
python -m app.workers.cli analyse [limit]   # enrich pending events
python -m app.workers.cli status            # last ingest result
```

`backfill` matters for the cold start: recurrence is the strongest
flare-vs-fire signal and is meaningless until history accumulates. Deeper than
10 days needs FIRMS's manual archive request form.
