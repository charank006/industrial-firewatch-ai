# GeoFlare AI Dataset Guide

This folder (`backend/data/raw/`) is the designated location for your input datasets (e.g. NASA FIRMS VIIRS/MODIS CSV files or custom labeled thermal anomaly datasets).

---

## 1. Where to Place Your Dataset

Place your `.csv` dataset file directly inside this directory:
```
backend/data/raw/<your_dataset_name>.csv
```
*Example:* `backend/data/raw/india_firms_2026.csv` or `backend/data/raw/nasafirmdata.csv`

---

## 2. Strict India Geofencing Constraint

GeoFlare AI strictly filters and validates all coordinates to remain inside India:
- **Latitude Range:** `6.5° N` to `37.5° N`
- **Longitude Range:** `68.0° E` to `97.5° E`

Any observation outside this geographical envelope is automatically detected and skipped during both **model training** and **live database ingestion**.

---

## 3. Supported CSV Column Formats

### Format A: NASA FIRMS Satellite CSV (VIIRS / MODIS)
```csv
latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type
21.1702,72.8311,365.4,0.4,0.4,2026-03-15,0830,N,VIIRS,90,2.0NRT,298.2,142.5,D,0
```

### Format B: Pre-Extracted Feature / Labeled Dataset
```csv
latitude,longitude,frp_latest_mw,brightness_k,forest_fraction,industrial_fraction,farmland_fraction,residential_fraction,factories_within_1km,gas_facilities_within_1km,temperature_c,humidity_pct,wind_speed_ms,event_id,label
21.8869,70.9833,62.29,387.33,0.01,0.51,0.02,0.19,5,0,31.62,65.27,8.59,FE-TRAIN-00001,industrial_fire
```

**Supported Target Labels:**
- `forest_fire` (Wildland / Canopy / Forest Fire)
- `agricultural_burning` (Crop Residue / Stubble Burning)
- `industrial_fire` (Factory / Chemical / Plant Structure Fire)
- `gas_oil_flare` (Routine Process Flare / Petrochemical Burn)
- `urban_other` (Urban Structure / Municipal Fire)
- `unknown` (Unclassified Anomaly)

---

## 4. How to Train, Validate & Test the Model on Your Dataset

Run the training pipeline from the `backend/` folder:

```bash
# Train strictly on your custom dataset inside India:
uv run python -m ml.train --dataset data/raw/your_dataset_name.csv --india-only

# Or generate a calibrated Indian regional benchmark dataset (2500 events):
uv run python -m ml.train --n-samples 2500 --india-only
```

### What Happens During Training:
1. **India Geofencing:** Out-of-bounds rows are filtered out.
2. **Canonical 32-Feature Extraction:** Training-inference parity is guaranteed.
3. **Leakage-Controlled Validation:** Evaluates across 4 independent splits:
   - **Event-Aware GroupKFold** (Primary)
   - **Spatial Holdout** (East vs West India)
   - **Temporal Holdout** (Chronological time split)
   - **Stratified Random Split** (Baseline)
4. **3-Model Comparison:** Evaluates Random Forest vs XGBoost vs LightGBM.
5. **Model Artifacts Saved to `backend/models/`:**
   - `geoflare_lightgbm.joblib` (Production model)
   - `geoflare_lightgbm.txt` (Booster format)
   - `model_metadata.json` (Spatial extents, provenance & parameters)
   - `metrics.json` (Accuracy, Macro-F1, Confusion Matrix, Per-class metrics)

---

## 5. How to Ingest Points & Update the Live Map

To load observations directly into the PostgreSQL / PostGIS database, evaluate 7-day persistence, classify non-persistent thermal events with LightGBM, and display them on the live frontend map:

```bash
uv run python -m app.services.ingestion.firms_csv_loader --csv data/raw/your_dataset_name.csv --india-only
```

Once ingested, the points appear immediately on the interactive map at `http://localhost:5173`.
