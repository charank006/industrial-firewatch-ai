# GeoFlare AI — Automated Background Scheduler & Ingestion Engine Architecture

## 1. System Overview

The GeoFlare AI background scheduler (`backend/app/workers/scheduler.py` and `backend/app/workers/jobs.py`) is an asynchronous, fault-tolerant cron and polling subsystem built on `apscheduler.schedulers.asyncio.AsyncIOScheduler`.

It automates the ingestion, event linking, 7-day persistence pre-filtering, LightGBM machine learning inference, severity evaluation, and alert dispatch across sovereign Indian territory.

---

## 2. Scheduler Jobs & Cadence Configuration

| Job ID | Job Name | Default Interval | Setting / Configuration | Target Function |
| :--- | :--- | :--- | :--- | :--- |
| `firms_ingest` | NASA FIRMS Telemetry Ingestion | **900 seconds** (15 min) | `FIRMS_POLL_INTERVAL_SECONDS = 900`<br>`FIRMS_POLL_MINUTES = 15`<br>`FIRMS_ENABLED = True` | `app.workers.jobs.ingest_job` |
| `event_analysis` | Contextual Analysis & ML Pipeline | **120 seconds** (2 min) | `ANALYSIS_POLL_MINUTES = 2` | `app.workers.jobs.analysis_job` |
| `containment_sweep` | Stale Event Containment Sweep | **3600 seconds** (1 hour) | `CONTAINMENT_SWEEP_HOURS = 1` | `app.workers.jobs.containment_job` |

### Environment Variables & Controls
- `FIRMS_ENABLED` (bool, default `True`): Toggles FIRMS background polling.
- `SCHEDULER_ENABLED` (bool, default `True`): Master toggle for the entire background worker.
- `FIRMS_POLL_INTERVAL_SECONDS` (int, default `900`): Ingestion interval in seconds (recommended 900s to 1800s to balance satellite overpass freshness and polite API consumption).
- `effective_scheduler_enabled`: Evaluates `SCHEDULER_ENABLED and FIRMS_ENABLED`.
- `effective_firms_poll_interval_seconds`: Resolves `FIRMS_POLL_INTERVAL_SECONDS` or falls back to `FIRMS_POLL_MINUTES * 60`.

---

## 3. Concurrency Protection & Overlapping Run Prevention

Because NASA FIRMS downloads and PostGIS bulk insertions can take variable amounts of time depending on satellite batch size and network throughput, concurrent overlapping executions must be prevented:

```python
_ingest_lock = asyncio.Lock()

async def ingest_job(day_range: Optional[int] = None) -> Dict[str, Any]:
    if _ingest_lock.locked():
        logger.info("ingest_job already running; skipping overlapping execution")
        return {"ok": True, "skipped": "already_running"}

    async with _ingest_lock:
        # Ingestion execution begins
```

- **Lock Primitive**: In-memory `asyncio.Lock` guarantees that if a 15-minute scheduled tick fires while a prior ingestion run is still streaming or inserting records, the tick cleanly skips without deadlocking or thrashing the database.

---

## 4. Incremental Checkpointing & Idempotency

To ensure reliable, restart-safe polling without duplicate work:
1. **Checkpoint Entity (`IngestionCheckpoint`)**:
   - `source`: String unique key (`"nasa_firms_viirs"`).
   - `last_acquired_at`: Maximum `acquisition_time` timestamp observed among processed detections.
   - `records_processed`: Cumulative count of observations parsed.
   - `updated_at`: UTC timestamp of the last checkpoint update.
2. **Deduplication Key (`uq_fire_detections_identity`)**:
   - Every satellite pixel is hashed to a deterministic SHA-256 key:
     `SHA256("{latitude:.4f}_{longitude:.4f}_{acq_time}_{satellite}_{instrument}")`
   - Inserter uses `INSERT ... ON CONFLICT (detection_key) DO NOTHING` or pre-queries existing keys in memory.
   - Any duplicate detection is safely bypassed (`duplicates_ignored = fetched - inserted`).

---

## 5. Execution Logging & Structured Telemetry

Every scheduler tick records structured metrics to both stdout/logging and the persistent `seed_runs` audit table:
- **`started_at` & `finished_at`**: Precise execution duration.
- **`detections_fetched`**: Raw count of pixel rows parsed from FIRMS CSV.
- **`detections_inserted`**: New unique detections committed to PostGIS.
- **`duplicates_ignored`**: Deduplicated redundant rows.
- **`events_created`**: New `FireEvent` clusters formed.
- **`events_updated`**: Existing active clusters linked with new detections.
- **`events_marked_contained`**: Stale events transitioned to `contained`.
- **`ok`**: Boolean success indicator.
- **`detail`**: Diagnostic details or exception trace if failed.

In `analysis_job`:
- **`total_analysed`**: Total events processed.
- **`persistent_sources`**: Events meeting 7-day persistence ($\ge 5/7$ active days within 500m) with LightGBM bypassed.
- **`non_persistent_to_ml`**: Episodic events routed to LightGBM 32-feature classifier.
- **`predictions_created`**: Total classification records stored.
- **`alerts_generated`**: Emergency notifications generated and dispatched.

---

## 6. Failure Recovery & Process Isolation

Scheduled jobs must never terminate the application process or leave uncommitted transactions open:
- If an uncaught exception occurs during ingestion:
  1. Active database session is rolled back: `await session.rollback()`.
  2. A new, isolated recovery session records the failure in `seed_runs`:
     ```python
     async with get_sessionmaker()() as recovery:
         recovery.add(SeedRun(..., ok=False, detail=f"{type(exc).__name__}: {str(exc)[:400]}"))
         await recovery.commit()
     ```
  3. The exception is logged with full traceback (`logger.exception`).
  4. The job returns `{"ok": False, "error": ...}`, leaving the scheduler intact for subsequent polling ticks.
