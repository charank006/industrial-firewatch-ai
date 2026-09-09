from typing import List, Optional
from pydantic import BaseModel

class IncidentCreate(BaseModel):
    title: str
    type: str # Wildfire, Industrial Fire, Unknown Thermal Event, Agricultural Fire, Other
    severity: str = "HIGH"
    lat: float
    lng: float
    frp_mw: float = 85.0
    brightness_k: float = 330.0
    confidence: int = 90
    location_name: str = "Gujarat Sector"
    custom_radius_meters: float = 1000.0
    description: Optional[str] = None

class IncidentResponse(BaseModel):
    id: str
    title: str
    type: str
    status: str
    severity: str
    lat: float
    lng: float
    frp_mw: float
    brightness_k: float
    confidence: int
    source: str
    custom_radius_meters: float
    location_name: str
    suggested_action: Optional[str] = None
    created_at: str

class RiskAnalysisRequest(BaseModel):
    incident_id: str
    radius_meters: float = 1000.0

class AffectedUserSchema(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    distance_meters: float
    opt_in: bool

class EmergencyContactSchema(BaseModel):
    id: str
    name: str
    organization: str
    category: str
    phone: str
    email: str
    distance_meters: float

class AlertAuthorizeRequest(BaseModel):
    incident_id: str
    channels: List[str] = ["FCM", "SMS", "EMAIL"]
    custom_radius_meters: float = 1000.0

class NotificationRecipientSchema(BaseModel):
    id: str
    event_id: str
    recipient_name: str
    recipient_type: str
    channel: str
    status: str
    sent_at: Optional[str] = None
    delivered_at: Optional[str] = None
    read_at: Optional[str] = None
    acknowledged_at: Optional[str] = None

class SystemStatusResponse(BaseModel):
    status: str
    demo_mode: bool
    database: str
    postgis: str
    fcm: str
    twilio: str
    sendgrid: str
    map_tiles: str
