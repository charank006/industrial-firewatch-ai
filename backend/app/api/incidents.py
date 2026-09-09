"""Legacy manual-beta-trigger and notification endpoints.

Moved verbatim from app/main.py at their original paths so nothing that depends
on `/api/incidents/...` breaks. This is a separate concern from the
fire-intelligence pipeline, which lands under `/api/fires/...`.

Notification dispatch is deferred until the prediction pipeline is good enough.
"""

import datetime
import uuid
from typing import List

from fastapi import APIRouter, HTTPException

from app.schemas.schemas import (
    AlertAuthorizeRequest,
    IncidentCreate,
    IncidentResponse,
    RiskAnalysisRequest,
)
from app.seed_data import (
    EMERGENCY_CONTACTS_DB,
    INCIDENTS_DB,
    RECIPIENT_RECORDS_DB,
    USERS_DB,
)
from app.services.notifications.notification_service import (
    dispatch_incident_alert_sequence,
)
from app.services.spatial.spatial_service import (
    find_affected_users_in_radius,
    find_emergency_contacts_in_radius,
)

router = APIRouter(tags=["incidents"])


def _utc_now_iso() -> str:
    """ISO-8601 UTC with a Z suffix.

    Replaces `datetime.utcnow().strftime(...) + " IST"`, which labelled UTC
    instants as IST and made every rendered timestamp 5h30m wrong.
    """
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@router.get("/api/incidents", response_model=List[IncidentResponse])
async def get_incidents():
    return INCIDENTS_DB


@router.get("/api/incidents/{incident_id}", response_model=IncidentResponse)
async def get_incident_by_id(incident_id: str):
    found = next((i for i in INCIDENTS_DB if i["id"] == incident_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Incident not found")
    return found


@router.post("/api/incidents", response_model=IncidentResponse)
async def create_manual_beta_incident(payload: IncidentCreate):
    """Trigger a Manual Beta Fire Event from Operator Landing Page or Admin Console."""
    new_id = f"FW-BETA-{uuid.uuid4().hex[:4].upper()}"

    new_item = {
        "id": new_id,
        "title": payload.title,
        "type": payload.type,
        "status": "ACTIVE",
        "severity": payload.severity,
        "lat": payload.lat,
        "lng": payload.lng,
        "frp_mw": payload.frp_mw,
        "brightness_k": payload.brightness_k,
        "confidence": payload.confidence,
        "source": "MANUAL_BETA_EVENT",
        "custom_radius_meters": payload.custom_radius_meters,
        "location_name": payload.location_name,
        "suggested_action": payload.description
        or f"MANUAL BETA TRIGGER: Initiated manual emergency response sequence for {payload.title}.",
        "created_at": _utc_now_iso(),
    }

    INCIDENTS_DB.insert(0, new_item)
    return new_item


@router.post("/api/incidents/{incident_id}/risk-analysis")
async def perform_risk_analysis(incident_id: str, req: RiskAnalysisRequest):
    found = next((i for i in INCIDENTS_DB if i["id"] == incident_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Incident not found")

    radius = req.radius_meters or found.get("custom_radius_meters", 1000.0)
    affected_users = find_affected_users_in_radius(USERS_DB, found["lat"], found["lng"], radius)
    emergency_services = find_emergency_contacts_in_radius(
        EMERGENCY_CONTACTS_DB, found["lat"], found["lng"], radius
    )

    return {
        "incident_id": incident_id,
        "radius_meters": radius,
        "affected_users_count": len(affected_users),
        "affected_users": affected_users,
        "emergency_services_count": len(emergency_services),
        "emergency_services": emergency_services,
    }


@router.post("/api/incidents/{incident_id}/alerts/authorize")
async def authorize_alert_dispatch(incident_id: str, req: AlertAuthorizeRequest):
    found = next((i for i in INCIDENTS_DB if i["id"] == incident_id), None)
    if not found:
        raise HTTPException(status_code=404, detail="Incident not found")

    radius = req.custom_radius_meters or found.get("custom_radius_meters", 1000.0)
    affected_users = find_affected_users_in_radius(USERS_DB, found["lat"], found["lng"], radius)
    emergency_services = find_emergency_contacts_in_radius(
        EMERGENCY_CONTACTS_DB, found["lat"], found["lng"], radius
    )

    all_recipients = emergency_services + affected_users
    dispatched = dispatch_incident_alert_sequence(found, all_recipients, req.channels)

    event_id = f"NOTIF-EVT-{incident_id}"
    # Mutate in place rather than rebinding, so the imported module-level list
    # stays the single shared store.
    RECIPIENT_RECORDS_DB[:] = [
        r for r in RECIPIENT_RECORDS_DB if r["event_id"] != event_id
    ] + dispatched

    return {
        "status": "AUTHORIZED",
        "event_id": event_id,
        "incident_id": incident_id,
        "dispatched_recipients_count": len(dispatched),
        "recipients": dispatched,
    }


@router.get("/api/incidents/{incident_id}/notifications")
async def get_incident_notifications(incident_id: str):
    evt_id = f"NOTIF-EVT-{incident_id}"
    return [r for r in RECIPIENT_RECORDS_DB if r["event_id"] == evt_id]


@router.post("/api/notifications/{recipient_id}/acknowledge")
async def acknowledge_notification(recipient_id: str):
    for r in RECIPIENT_RECORDS_DB:
        if r["id"] == recipient_id:
            r["status"] = "ACKNOWLEDGED"
            r["acknowledged_at"] = _utc_now_iso()
            return r
    raise HTTPException(status_code=404, detail="Recipient notification record not found")
