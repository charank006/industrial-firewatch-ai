# GeoFlare AI — Dedicated Alert & Notification Dispatch Engine Architecture

## 1. Executive Overview

The GeoFlare AI Alert Engine (`backend/app/services/notifications/alert_engine.py`) provides an autonomous, decoupled alerting pipeline that evaluates risk rules following LightGBM classification and dispatches multi-channel emergency notices.

### Decoupled Pipeline
```
Thermal Anomaly Ingestion
           │
           ▼
7-Day Persistence Pre-filter ───[Persistent Source]───► Suppress Emergency Fire Alert
           │                                             (Severity: LOW / Routine)
     [Non-Persistent]
           │
           ▼
LightGBM 32-Feature Classifier (.predict_proba())
           │
           ▼
Beta Severity Engine (FRP, Class, Exposure)
           │
           ▼
Alert Rule Evaluation (Confidence, Radius, Facility)
           │
           ├──► [Cooldown Active < 60m] ──► Suppress Duplicate Notification
           │
           ▼
Multi-Channel Dispatcher (Webhook, SMS, Email, In-App SSE)
           │
           ▼
Persistent Audit Logging (`AlertRecord` table)
```

---

## 2. Industrial Fire Alert Rule Conditions

An emergency industrial fire alert is triggered **IF AND ONLY IF** all three criteria are satisfied:

$$\begin{cases} 
\text{predicted\_class} = \text{"industrial\_fire"} \\
\text{predicted\_probability} \ge \text{INDUSTRIAL\_ALERT\_CONFIDENCE\_THRESHOLD} & (\text{default: } 0.60) \\
\text{facility\_distance\_m} \le \text{INDUSTRIAL\_ALERT\_RADIUS\_METERS} & (\text{default: } 2000\text{ m})
\end{cases}$$

### Suppression Invariants
1. **Persistent Thermal Sources**: Any event flagged as `is_persistent = True` ($\ge 5$ of 7 active days within 500m) is categorized as routine industrial activity (furnace, flare stack) and **never** generates an emergency fire alert.
2. **Sub-Threshold Confidence**: If the model predicts `industrial_fire` but confidence is $< 0.60$ (or below `ML_CONFIDENCE_THRESHOLD = 0.40`), it is treated as uncertain and suppressed.
3. **Outside Facility Radius**: High-confidence industrial fire detections that are $> 2000\text{ m}$ from any known industrial infrastructure are flagged for manual operator review rather than automated emergency dispatch.

---

## 3. Cooldown Deduplication Engine

To avoid overwhelming plant operators and emergency responders with repeated notifications for the same ongoing incident during 15-minute satellite polling cycles:

- **Cooldown Period**: Governed by `ALERT_COOLDOWN_MINUTES = 60` (default: 60 minutes).
- **Lookup Query**:
  ```sql
  SELECT * FROM alert_records
  WHERE event_id = :event_id
    AND alert_type = :alert_type
    AND created_at >= NOW() - INTERVAL '60 minutes'
    AND status IN ('sent', 'pending')
  ORDER BY created_at DESC LIMIT 1;
  ```
- **Action on Match**: The alert is marked `status = "suppressed"`, channels are not dispatched, and an audit row records `"Alert suppressed: Cooldown active (60m)"`.

---

## 4. Multi-Channel Dispatch Adapters

The engine features four modular dispatch adapters:

### 1. Webhook Dispatcher (`dispatch_webhook`)
- **Transport**: Asynchronous HTTP POST via `httpx.AsyncClient` with 10-second timeout.
- **Headers**: `Content-Type: application/json`, optional `X-GeoFlare-Secret` signature.
- **Payload**: Full JSON schema with `alert_id`, `event_id`, `severity`, `frp_latest_mw`, `coordinates`, `facility_name`, and `confidence`.

### 2. SMS Dispatcher (`dispatch_sms`)
- **Transport**: Twilio REST API integration (`https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json`).
- **Authentication**: HTTP Basic Auth with `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
- **Payload**: Compact SMS message with incident severity, FRP, distance to facility, and coordinates.

### 3. Email Dispatcher (`dispatch_email`)
- **Transport**: SendGrid v3 Mail API (`https://api.sendgrid.com/v3/mail/send`).
- **Authentication**: Bearer token via `SENDGRID_API_KEY`.
- **Payload**: Styled HTML notification with key incident metrics, confidence %, and Google Maps / GIS coordinates.

### 4. In-App / SSE Real-time Broadcast
- Appends alert payload to the in-memory stream consumed by `/api/events/stream` and `/api/alerts/recent`.

---

## 5. Graceful Degradation & Unconfigured Channels

The engine guarantees that unconfigured or failing notification channels will **never crash** the ingestion pipeline or API requests:
- If credentials (`TWILIO_ACCOUNT_SID`, `SENDGRID_API_KEY`, or `ALERT_WEBHOOK_URL`) are empty:
  - Adapter returns `(False, "notification channel not configured")`.
  - Log level is set to `INFO`/`DEBUG`.
  - `AlertRecord.channel_statuses` explicitly logs `{"webhook": "notification channel not configured"}`.
  - The record is safely stored in PostGIS.

---

## 6. Database Audit Schema: `AlertRecord`

```sql
CREATE TABLE alert_records (
    id SERIAL PRIMARY KEY,
    event_id VARCHAR NOT NULL REFERENCES fire_events(id),
    alert_type VARCHAR NOT NULL DEFAULT 'industrial_fire',
    severity VARCHAR NOT NULL DEFAULT 'HIGH',
    reason TEXT NOT NULL,
    facility_id VARCHAR,
    facility_name VARCHAR,
    distance_meters FLOAT,
    confidence FLOAT,
    status VARCHAR NOT NULL DEFAULT 'pending', -- pending | sent | failed | suppressed | acknowledged | resolved
    channels_sent JSONB,                       -- ['webhook', 'sms', 'email']
    channel_statuses JSONB,                    -- {'webhook': 'HTTP 200 Delivered', 'sms': 'notification channel not configured'}
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_alerts_event_created ON alert_records(event_id, created_at);
CREATE INDEX ix_alerts_status ON alert_records(status);
CREATE INDEX ix_alerts_created_at ON alert_records(created_at);
```
