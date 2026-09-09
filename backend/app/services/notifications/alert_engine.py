"""GeoFlare AI — Dedicated Notification & Alert Dispatch Engine.

Implements the decoupled architecture:
  LightGBM -> Source Classification -> Severity Engine -> Alert Engine -> Notification Channels

Alert Conditions:
  IF predicted_class == "industrial_fire"
  AND predicted_probability >= INDUSTRIAL_ALERT_CONFIDENCE_THRESHOLD (default: 0.60)
  AND facility distance <= INDUSTRIAL_ALERT_RADIUS_METERS (default: 2000m)
  THEN create alert and dispatch via configured notification providers.

Deduplication / Cooldown:
  ALERT_COOLDOWN_MINUTES (default: 60) prevents spamming notifications for recurring observation batches.
"""

from __future__ import annotations

import datetime
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.models import AlertRecord, FireEvent, FirePrediction

logger = logging.getLogger(__name__)


@dataclass
class AlertEvaluationResult:
    should_alert: bool
    reason: str
    alert_type: str = "industrial_fire"
    severity: str = "HIGH"
    facility_id: Optional[str] = None
    facility_name: Optional[str] = None
    distance_meters: Optional[float] = None
    confidence: Optional[float] = None
    is_suppressed_by_cooldown: bool = False
    alert_record_id: Optional[int] = None
    channels_dispatched: List[str] = field(default_factory=list)
    channel_statuses: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "should_alert": self.should_alert,
            "reason": self.reason,
            "alert_type": self.alert_type,
            "severity": self.severity,
            "facility_id": self.facility_id,
            "facility_name": self.facility_name,
            "distance_meters": self.distance_meters,
            "confidence": self.confidence,
            "is_suppressed_by_cooldown": self.is_suppressed_by_cooldown,
            "alert_record_id": self.alert_record_id,
            "channels_dispatched": self.channels_dispatched,
            "channel_statuses": self.channel_statuses,
        }


async def evaluate_alert_conditions(
    db: AsyncSession,
    event: FireEvent,
    prediction: Optional[FirePrediction] = None,
    features: Optional[Dict[str, Any]] = None,
) -> Tuple[bool, str, str, str, Optional[str], Optional[str], Optional[float], Optional[float]]:
    """Evaluates whether an anomaly triggers an industrial fire alert.

    Returns:
      (should_alert, reason, alert_type, severity, facility_id, facility_name, distance_m, confidence)
    """
    # 1. Persistent thermal sources do NOT generate emergency fire alerts
    if event.is_persistent:
        return (
            False,
            f"Event {event.id} is confirmed Persistent Thermal Source ({event.active_days_7d}/7 days). Emergency alert suppressed.",
            "persistent_source",
            "LOW",
            event.nearest_industrial_site,
            event.nearest_industrial_site,
            event.nearest_industrial_distance_m,
            1.0,
        )

    # 2. Extract classification, probability, and facility proximity
    predicted_class = prediction.predicted_class if prediction else (event.classification or "unknown")
    confidence = prediction.confidence if prediction else 0.0
    severity = prediction.severity if prediction else "MEDIUM"

    facility_name = event.nearest_industrial_site or (features.get("nearest_facility_name") if features else None)
    facility_type = event.nearest_industrial_type or (features.get("nearest_facility_type") if features else None)
    distance_m = event.nearest_industrial_distance_m
    if distance_m is None and features:
        distance_m = features.get("nearest_industrial_distance_m") or features.get("nearest_factory_distance_m")

    # 3. Rule Check: Industrial Fire Alert
    radius_limit = settings.INDUSTRIAL_ALERT_RADIUS_METERS
    conf_threshold = settings.INDUSTRIAL_ALERT_CONFIDENCE_THRESHOLD

    is_industrial_class = predicted_class == "industrial_fire"
    meets_confidence = confidence >= conf_threshold
    in_facility_radius = (distance_m is not None) and (distance_m <= radius_limit)

    if is_industrial_class:
        if not meets_confidence:
            return (
                False,
                f"Industrial fire predicted but confidence ({confidence:.2f}) is below threshold ({conf_threshold:.2f}).",
                "industrial_fire",
                severity,
                facility_name,
                facility_name,
                distance_m,
                confidence,
            )
        if not in_facility_radius:
            dist_desc = f"{distance_m:.0f}m" if distance_m is not None else "unknown"
            return (
                False,
                f"Industrial fire predicted with high confidence ({confidence:.2f}), but facility distance ({dist_desc}) exceeds alert radius ({radius_limit:.0f}m).",
                "industrial_fire",
                severity,
                facility_name,
                facility_name,
                distance_m,
                confidence,
            )

        # Rule Matched!
        reason = (
            f"CRITICAL INDUSTRIAL ALERT: High-confidence industrial fire ({confidence*100:.0f}%) detected "
            f"within {distance_m:.0f}m of {facility_name or 'industrial installation'} "
            f"(threshold <= {radius_limit:.0f}m, confidence >= {conf_threshold*100:.0f}%)."
        )
        return (
            True,
            reason,
            "industrial_fire",
            "CRITICAL" if severity == "CRITICAL" else "HIGH",
            facility_name,
            facility_name,
            distance_m,
            confidence,
        )

    # Secondary check: High/Critical severity thermal anomaly directly inside or within 500m of facility
    if severity in {"HIGH", "CRITICAL"} and distance_m is not None and distance_m <= 500.0:
        reason = (
            f"ELEVATED INDUSTRIAL RISK: {severity} thermal anomaly ({event.frp_latest_mw:.1f} MW) "
            f"detected within {distance_m:.0f}m of {facility_name or 'industrial facility'}."
        )
        return (
            True,
            reason,
            "facility_proximity_alert",
            severity,
            facility_name,
            facility_name,
            distance_m,
            confidence,
        )

    return (
        False,
        f"Event class '{predicted_class}' with confidence {confidence:.2f} did not meet industrial fire alert criteria.",
        "none",
        severity,
        facility_name,
        facility_name,
        distance_m,
        confidence,
    )


async def check_alert_cooldown(
    db: AsyncSession,
    event_id: str,
    alert_type: str,
    cooldown_minutes: Optional[int] = None,
) -> Tuple[bool, Optional[AlertRecord]]:
    """Checks if an equivalent alert was recently dispatched for this event within the cooldown window."""
    cooldown_mins = cooldown_minutes if cooldown_minutes is not None else settings.ALERT_COOLDOWN_MINUTES
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=cooldown_mins)

    stmt = (
        select(AlertRecord)
        .where(
            AlertRecord.event_id == event_id,
            AlertRecord.alert_type == alert_type,
            AlertRecord.created_at >= cutoff,
            AlertRecord.status.in_(["sent", "pending"]),
        )
        .order_by(desc(AlertRecord.created_at))
        .limit(1)
    )
    result = await db.execute(stmt)
    recent_alert = result.scalar_one_or_none()
    is_suppressed = recent_alert is not None
    return is_suppressed, recent_alert


# --- MODULAR NOTIFICATION DISPATCH CHANNELS ---

async def dispatch_webhook(payload: Dict[str, Any], webhook_url: Optional[str] = None) -> Tuple[bool, str]:
    """Dispatches alert to generic external webhook endpoint."""
    url = webhook_url or settings.ALERT_WEBHOOK_URL
    if not url:
        return False, "notification channel not configured"

    headers = {"Content-Type": "application/json", "User-Agent": "GeoFlare-AI-AlertEngine/1.0"}
    if settings.ALERT_WEBHOOK_SECRET:
        headers["X-GeoFlare-Secret"] = settings.ALERT_WEBHOOK_SECRET

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in {200, 201, 202, 204}:
                return True, f"HTTP {resp.status_code} Delivered"
            return False, f"HTTP {resp.status_code}: {resp.text[:200]}"
    except Exception as exc:
        logger.error("Webhook dispatch failed for %s: %s", url, exc)
        return False, f"Delivery error: {exc}"


async def dispatch_sms(message_body: str, to_number: Optional[str] = None) -> Tuple[bool, str]:
    """Dispatches SMS via Twilio API adapter. Fails gracefully if not configured."""
    account_sid = settings.TWILIO_ACCOUNT_SID
    auth_token = settings.TWILIO_AUTH_TOKEN
    from_number = settings.TWILIO_FROM_NUMBER
    to_phone = to_number or settings.TWILIO_TO_NUMBER

    if not (account_sid and auth_token and from_number and to_phone):
        return False, "notification channel not configured"

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = {"From": from_number, "To": to_phone, "Body": message_body}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, data=data, auth=(account_sid, auth_token))
            if resp.status_code in {200, 201}:
                return True, "SMS Dispatched via Twilio"
            return False, f"Twilio HTTP {resp.status_code}: {resp.text[:200]}"
    except Exception as exc:
        logger.error("SMS dispatch failed: %s", exc)
        return False, f"SMS error: {exc}"


async def dispatch_email(
    subject: str,
    html_content: str,
    to_email: Optional[str] = None,
) -> Tuple[bool, str]:
    """Dispatches email via SendGrid API adapter. Fails gracefully if not configured."""
    api_key = settings.SENDGRID_API_KEY
    from_email = settings.SENDGRID_FROM_EMAIL
    recipient = to_email or settings.ALERT_RECIPIENT_EMAIL

    if not (api_key and from_email and recipient):
        return False, "notification channel not configured"

    url = "https://api.sendgrid.com/v3/mail/send"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "personalizations": [{"to": [{"email": recipient}]}],
        "from": {"email": from_email, "name": "GeoFlare AI Alerts"},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_content}],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            if resp.status_code in {200, 202}:
                return True, "Email Dispatched via SendGrid"
            return False, f"SendGrid HTTP {resp.status_code}: {resp.text[:200]}"
    except Exception as exc:
        logger.error("Email dispatch failed: %s", exc)
        return False, f"Email error: {exc}"


# In-memory real-time event broadcast list for SSE and connected frontends
_RECENT_BROADCAST_ALERTS: List[Dict[str, Any]] = []


def get_recent_broadcast_alerts() -> List[Dict[str, Any]]:
    return list(_RECENT_BROADCAST_ALERTS[-50:])


async def process_event_alerts(
    db: AsyncSession,
    event: FireEvent,
    prediction: Optional[FirePrediction] = None,
    features: Optional[Dict[str, Any]] = None,
) -> AlertEvaluationResult:
    """Core entrypoint: Evaluates rules, creates AlertRecord, checks cooldown, and dispatches notifications."""
    (
        should_alert,
        reason,
        alert_type,
        severity,
        facility_id,
        facility_name,
        distance_m,
        confidence,
    ) = await evaluate_alert_conditions(db, event, prediction, features)

    if not should_alert:
        return AlertEvaluationResult(
            should_alert=False,
            reason=reason,
            alert_type=alert_type,
            severity=severity,
            facility_id=facility_id,
            facility_name=facility_name,
            distance_meters=distance_m,
            confidence=confidence,
        )

    # Check Cooldown
    is_suppressed, prior_alert = await check_alert_cooldown(db, event.id, alert_type)
    if is_suppressed:
        created_str = (
            prior_alert.created_at.isoformat()
            if prior_alert and getattr(prior_alert, "created_at", None)
            else "recently"
        )
        cooldown_msg = (
            f"Alert suppressed: Equivalent '{alert_type}' alert was recently sent at {created_str} "
            f"(cooldown period: {settings.ALERT_COOLDOWN_MINUTES}m)."
        )
        logger.info("Event %s: %s", event.id, cooldown_msg)

        # Still create an audit record recording the suppression
        suppressed_record = AlertRecord(
            event_id=event.id,
            alert_type=alert_type,
            severity=severity,
            reason=f"{reason} [SUPPRESSED: Cooldown active]",
            facility_id=facility_id,
            facility_name=facility_name,
            distance_meters=distance_m,
            confidence=confidence,
            status="suppressed",
            channels_sent=[],
            channel_statuses={"cooldown": "suppressed_duplicate_within_cooldown"},
        )
        db.add(suppressed_record)
        await db.flush()

        return AlertEvaluationResult(
            should_alert=True,
            reason=cooldown_msg,
            alert_type=alert_type,
            severity=severity,
            facility_id=facility_id,
            facility_name=facility_name,
            distance_meters=distance_m,
            confidence=confidence,
            is_suppressed_by_cooldown=True,
            alert_record_id=suppressed_record.id,
            channels_dispatched=[],
            channel_statuses={"cooldown": "suppressed"},
        )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    # 1. Create DB AlertRecord in 'pending' status
    alert_record = AlertRecord(
        event_id=event.id,
        alert_type=alert_type,
        severity=severity,
        reason=reason,
        facility_id=facility_id,
        facility_name=facility_name,
        distance_meters=distance_m,
        confidence=confidence,
        status="pending",
        created_at=now_utc,
    )
    db.add(alert_record)
    await db.flush()

    # 2. Build payload for dispatch
    payload = {
        "alert_id": alert_record.id,
        "event_id": event.id,
        "alert_type": alert_type,
        "severity": severity,
        "reason": reason,
        "latitude": event.latitude,
        "longitude": event.longitude,
        "frp_latest_mw": event.frp_latest_mw,
        "frp_max_mw": event.frp_max_mw,
        "facility_id": facility_id,
        "facility_name": facility_name,
        "distance_meters": distance_m,
        "confidence": confidence,
        "created_at": (alert_record.created_at or now_utc).isoformat(),
    }

    # 3. Dispatch to modular notification channels
    channel_statuses: Dict[str, str] = {}
    channels_sent: List[str] = []

    # Channel A: Webhook
    webhook_ok, webhook_msg = await dispatch_webhook(payload)
    channel_statuses["webhook"] = webhook_msg
    if webhook_ok:
        channels_sent.append("webhook")

    # Channel B: SMS
    sms_body = f"[GeoFlare ALERT] {severity} {alert_type}: FRP {event.frp_latest_mw:.1f}MW within {distance_m:.0f}m of {facility_name}. {reason[:100]}"
    sms_ok, sms_msg = await dispatch_sms(sms_body)
    channel_statuses["sms"] = sms_msg
    if sms_ok:
        channels_sent.append("sms")

    # Channel C: Email
    email_subj = f"[GeoFlare {severity}] Industrial Thermal Alert: {facility_name or event.id}"
    email_html = f"""
    <h2>GeoFlare AI — Critical Thermal Anomaly Alert</h2>
    <p><strong>Alert Type:</strong> {alert_type}</p>
    <p><strong>Severity:</strong> {severity}</p>
    <p><strong>FRP:</strong> {event.frp_latest_mw:.1f} MW (Max: {event.frp_max_mw:.1f} MW)</p>
    <p><strong>Nearest Facility:</strong> {facility_name} ({distance_m:.0f}m)</p>
    <p><strong>Confidence:</strong> {confidence*100:.0f}%</p>
    <p><strong>Coordinates:</strong> {event.latitude:.4f}, {event.longitude:.4f}</p>
    <p><strong>Details:</strong> {reason}</p>
    """
    email_ok, email_msg = await dispatch_email(email_subj, email_html)
    channel_statuses["email"] = email_msg
    if email_ok:
        channels_sent.append("email")

    # Channel D: In-App / SSE Broadcast
    _RECENT_BROADCAST_ALERTS.append(payload)
    channel_statuses["in_app_broadcast"] = "Delivered to in-memory real-time stream"
    channels_sent.append("in_app_broadcast")

    # 4. Update AlertRecord status
    any_external_ok = any(ch in channels_sent for ch in ["webhook", "sms", "email"])
    alert_record.status = "sent" if any_external_ok else "sent"  # in_app broadcast delivered
    alert_record.channels_sent = channels_sent
    alert_record.channel_statuses = channel_statuses
    alert_record.sent_at = datetime.datetime.now(datetime.timezone.utc)
    await db.flush()

    logger.info(
        "AlertRecord %d created for event %s. Channels: %s. Statuses: %s",
        alert_record.id,
        event.id,
        channels_sent,
        channel_statuses,
    )

    return AlertEvaluationResult(
        should_alert=True,
        reason=reason,
        alert_type=alert_type,
        severity=severity,
        facility_id=facility_id,
        facility_name=facility_name,
        distance_meters=distance_m,
        confidence=confidence,
        is_suppressed_by_cooldown=False,
        alert_record_id=alert_record.id,
        channels_dispatched=channels_sent,
        channel_statuses=channel_statuses,
    )
