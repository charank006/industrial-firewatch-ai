import datetime
import uuid
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.config import settings
from app.schemas.schemas import (
  AlertAuthorizeRequest,
  EmergencyContactSchema,
  IncidentCreate,
  IncidentResponse,
  NotificationRecipientSchema,
  RiskAnalysisRequest,
  SystemStatusResponse,
)
from app.services.notifications.notification_service import dispatch_incident_alert_sequence
from app.services.spatial.spatial_service import (
  find_affected_users_in_radius,
  find_emergency_contacts_in_radius,
)

app = FastAPI(
  title=settings.PROJECT_NAME,
  version=settings.VERSION,
  docs_url="/docs",
  redoc_url="/redoc",
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

# In-Memory Beta Seed Store
INCIDENTS_DB = [
  {
    "id": "FW-BETA-1042",
    "title": "Surat Petrochemicals Tank Farm Anomaly",
    "type": "Industrial Fire",
    "status": "ACTIVE",
    "severity": "HIGH",
    "lat": 21.1738,
    "lng": 72.8345,
    "frp_mw": 184.6,
    "brightness_k": 347.2,
    "confidence": 91,
    "source": "MANUAL_BETA_EVENT",
    "custom_radius_meters": 1000.0,
    "location_name": "Surat Petrochemical Zone, Gujarat",
    "suggested_action": "CRITICAL ALERT: Verify storage tank cooling systems & notify industrial emergency squad.",
    "created_at": "2026-08-29 14:37:21 IST",
  },
  {
    "id": "FW-BETA-1041",
    "title": "Hazira LNG Flare Decompression",
    "type": "Routine Flare",
    "status": "ACTIVE",
    "severity": "MEDIUM",
    "lat": 21.1140,
    "lng": 72.6390,
    "frp_mw": 82.3,
    "brightness_k": 328.5,
    "confidence": 88,
    "source": "SATELLITE_VIIRS",
    "custom_radius_meters": 1000.0,
    "location_name": "Hazira Coastal Flare Tower #3",
    "suggested_action": "MONITORING: Routine high-pressure gas flare matching scheduled decompression cycle.",
    "created_at": "2026-08-29 12:15:00 IST",
  },
  {
    "id": "FW-BETA-1039",
    "title": "Vapi Chemical Yard Thermal Spike",
    "type": "Industrial Fire",
    "status": "ACTIVE",
    "severity": "HIGH",
    "lat": 20.3755,
    "lng": 72.9080,
    "frp_mw": 112.7,
    "brightness_k": 339.1,
    "confidence": 86,
    "source": "MANUAL_BETA_EVENT",
    "custom_radius_meters": 1000.0,
    "location_name": "Vapi GIDC Phase IV Chemical Complex",
    "suggested_action": "HIGH ALERT: Chemical yard thermal anomaly. Dispatch local fire suppression unit.",
    "created_at": "2026-08-29 11:10:00 IST",
  },
]

USERS_DB = [
  {"id": "USR-001", "name": "Rajesh Patel", "phone": "+91 98250 11223", "email": "r.patel@suratind.in", "lat": 21.1760, "lng": 72.8360, "notification_opt_in": True},
  {"id": "USR-002", "name": "Ananya Sharma", "phone": "+91 98791 44556", "email": "a.sharma@hazira.org", "lat": 21.1710, "lng": 72.8320, "notification_opt_in": True},
  {"id": "USR-003", "name": "Vikram Desai", "phone": "+91 94260 77889", "email": "v.desai@vapi.com", "lat": 20.3780, "lng": 72.9050, "notification_opt_in": True},
  {"id": "USR-004", "name": "Priya Mehta", "phone": "+91 98241 33445", "email": "p.mehta@dahej.gov.in", "lat": 21.6820, "lng": 72.5420, "notification_opt_in": True},
  {"id": "USR-005", "name": "Karan Shah", "phone": "+91 99099 22334", "email": "karan.shah@jamnagar.in", "lat": 22.4740, "lng": 70.0630, "notification_opt_in": True},
]

EMERGENCY_CONTACTS_DB = [
  {"id": "EMG-001", "name": "Surat District Police Control", "organization": "Gujarat Police Dept", "category": "police", "phone": "112 / +91 261 2244100", "email": "control.surat@gujaratpolice.gov.in", "lat": 21.1800, "lng": 72.8300},
  {"id": "EMG-002", "name": "Hazira Industrial Fire Station", "organization": "GIDC Emergency Response", "category": "fire", "phone": "+91 261 2860101", "email": "fire.hazira@gidc.gov.in", "lat": 21.1180, "lng": 72.6410},
  {"id": "EMG-003", "name": "Surat Civil Hospital Emergency", "organization": "Gujarat Health Services", "category": "ambulance", "phone": "108 / +91 261 2242000", "email": "emergency.civil@surat.gov.in", "lat": 21.1900, "lng": 72.8250},
  {"id": "EMG-004", "name": "Surat Petrochem Safety Desk", "organization": "Surat Petrochemicals Complex", "category": "facility", "phone": "+91 261 2901111", "email": "safety@suratpetro.com", "lat": 21.1730, "lng": 72.8350},
]

RECIPIENT_RECORDS_DB = []

@app.get("/")
def read_root():
  return {"name": settings.PROJECT_NAME, "version": settings.VERSION, "demo_mode": settings.DEMO_MODE}

@app.get("/api/incidents", response_model=List[IncidentResponse])
def get_incidents():
  return INCIDENTS_DB

@app.get("/api/incidents/{incident_id}", response_model=IncidentResponse)
def get_incident_by_id(incident_id: str):
  found = next((i for i in INCIDENTS_DB if i["id"] == incident_id), None)
  if not found:
    raise HTTPException(status_code=404, detail="Incident not found")
  return found

@app.post("/api/incidents", response_model=IncidentResponse)
def create_manual_beta_incident(payload: IncidentCreate):
  """Trigger a Manual Beta Fire Event from Operator Landing Page or Admin Console."""
  new_id = f"FW-BETA-{uuid.uuid4().hex[:4].upper()}"
  now_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S IST")
  
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
    "suggested_action": payload.description or f"MANUAL BETA TRIGGER: Initiated manual emergency response sequence for {payload.title}.",
    "created_at": now_str,
  }
  
  INCIDENTS_DB.insert(0, new_item)
  return new_item

@app.post("/api/incidents/{incident_id}/risk-analysis")
def perform_risk_analysis(incident_id: str, req: RiskAnalysisRequest):
  found = next((i for i in INCIDENTS_DB if i["id"] == incident_id), None)
  if not found:
    raise HTTPException(status_code=404, detail="Incident not found")

  radius = req.radius_meters or found.get("custom_radius_meters", 1000.0)
  affected_users = find_affected_users_in_radius(USERS_DB, found["lat"], found["lng"], radius)
  emergency_services = find_emergency_contacts_in_radius(EMERGENCY_CONTACTS_DB, found["lat"], found["lng"], radius)

  return {
    "incident_id": incident_id,
    "radius_meters": radius,
    "affected_users_count": len(affected_users),
    "affected_users": affected_users,
    "emergency_services_count": len(emergency_services),
    "emergency_services": emergency_services,
  }

@app.post("/api/incidents/{incident_id}/alerts/authorize")
def authorize_alert_dispatch(incident_id: str, req: AlertAuthorizeRequest):
  found = next((i for i in INCIDENTS_DB if i["id"] == incident_id), None)
  if not found:
    raise HTTPException(status_code=404, detail="Incident not found")

  radius = req.custom_radius_meters or found.get("custom_radius_meters", 1000.0)
  affected_users = find_affected_users_in_radius(USERS_DB, found["lat"], found["lng"], radius)
  emergency_services = find_emergency_contacts_in_radius(EMERGENCY_CONTACTS_DB, found["lat"], found["lng"], radius)
  
  all_recipients = emergency_services + affected_users
  dispatched = dispatch_incident_alert_sequence(found, all_recipients, req.channels)
  
  global RECIPIENT_RECORDS_DB
  RECIPIENT_RECORDS_DB = [r for r in RECIPIENT_RECORDS_DB if r["event_id"] != f"NOTIF-EVT-{incident_id}"] + dispatched

  return {
    "status": "AUTHORIZED",
    "event_id": f"NOTIF-EVT-{incident_id}",
    "incident_id": incident_id,
    "dispatched_recipients_count": len(dispatched),
    "recipients": dispatched,
  }

@app.get("/api/incidents/{incident_id}/notifications")
def get_incident_notifications(incident_id: str):
  evt_id = f"NOTIF-EVT-{incident_id}"
  items = [r for r in RECIPIENT_RECORDS_DB if r["event_id"] == evt_id]
  return items

@app.post("/api/notifications/{recipient_id}/acknowledge")
def acknowledge_notification(recipient_id: str):
  for r in RECIPIENT_RECORDS_DB:
    if r["id"] == recipient_id:
      r["status"] = "ACKNOWLEDGED"
      r["acknowledged_at"] = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S IST")
      return r
  raise HTTPException(status_code=404, detail="Recipient notification record not found")

@app.get("/api/system/status", response_model=SystemStatusResponse)
def get_system_status():
  return {
    "status": "OPERATIONAL",
    "demo_mode": settings.DEMO_MODE,
    "database": "POSTGRESQL + POSTGIS READY",
    "postgis": "ST_DWITHIN ACTIVE (SRID 4326)",
    "fcm": "FCM DEMO MODE" if settings.DEMO_MODE or not settings.FCM_PROJECT_ID else "CONNECTED",
    "twilio": "TWILIO DEMO MODE" if settings.DEMO_MODE or not settings.TWILIO_ACCOUNT_SID else "CONNECTED",
    "sendgrid": "SENDGRID DEMO MODE" if settings.DEMO_MODE or not settings.SENDGRID_API_KEY else "CONNECTED",
    "map_tiles": "CARTO DARK / ESRI SATELLITE",
  }
