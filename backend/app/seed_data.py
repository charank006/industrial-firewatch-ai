"""In-memory beta seed stores.

These back the legacy `/api/incidents` manual-trigger + notification endpoints.
They are demo fixtures, not the fire-intelligence pipeline's data source — that
arrives in Phase 2 as PostGIS-backed `fire_detections` / `fire_events` tables.

Timestamps are ISO-8601 UTC with a `Z` suffix. The original seed values carried
a literal `" IST"` suffix on `datetime.utcnow()` output, which labelled UTC
instants as IST and made every rendered time 5h30m wrong. The wall-clock intent
of the original values is preserved here by converting IST -> UTC.
"""

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
        "created_at": "2026-08-29T09:07:21Z",  # was 14:37:21 IST
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
        "created_at": "2026-08-29T06:45:00Z",  # was 12:15:00 IST
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
        "created_at": "2026-08-29T05:40:00Z",  # was 11:10:00 IST
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

RECIPIENT_RECORDS_DB: list[dict] = []

# Curated industrial asset registry. Mirrors frontend/src/data/mockFacilities.ts.
# Phase 2 seeds these into a PostGIS `facilities` table; Phase 4 enriches them
# with OSM tags. Deliberately NOT derived from OSM - real operations systems
# keep a curated registry, and OSM industrial polygons are unnamed/unreliable.
FACILITIES_DB = [
    {"id": "FAC-001", "name": "Surat Petrochemicals Complex", "type": "Refinery", "lat": 21.1702, "lng": 72.8311, "location": "Surat Industrial Zone, Gujarat", "status": "ANOMALY_DETECTED", "baseline_frp": 15.4, "current_frp": 184.6, "last_detected": "2026-08-27T16:12:00Z", "total_events_past_90_days": 14, "emergency_contact": "+91-261-2894-100", "risk_buffer_radius_km": 2.5},
    {"id": "FAC-002", "name": "Hazira LNG Terminal & Power Plant", "type": "LNG Terminal", "lat": 21.1118, "lng": 72.6358, "location": "Hazira Coastal Belt, Gujarat", "status": "ELEVATED", "baseline_frp": 45.0, "current_frp": 82.3, "last_detected": "2026-08-27T14:45:00Z", "total_events_past_90_days": 48, "emergency_contact": "+91-261-2850-200", "risk_buffer_radius_km": 3.0},
    {"id": "FAC-003", "name": "Dahej Petrochemical Industrial Estate", "type": "Chemical Complex", "lat": 21.7051, "lng": 72.5292, "location": "Dahej SEZ, Bharuch, Gujarat", "status": "NORMAL", "baseline_frp": 32.1, "current_frp": 30.5, "last_detected": "2026-08-27T13:00:00Z", "total_events_past_90_days": 62, "emergency_contact": "+91-2641-252-300", "risk_buffer_radius_km": 2.0},
    {"id": "FAC-004", "name": "Vapi Chemical Manufacturing Complex", "type": "Chemical Complex", "lat": 20.3721, "lng": 72.9038, "location": "Vapi GIDC, Valsad, Gujarat", "status": "ANOMALY_DETECTED", "baseline_frp": 8.2, "current_frp": 112.7, "last_detected": "2026-08-27T15:40:00Z", "total_events_past_90_days": 5, "emergency_contact": "+91-260-2431-400", "risk_buffer_radius_km": 1.5},
    {"id": "FAC-005", "name": "Jamnagar Export Refinery Complex", "type": "Refinery", "lat": 22.4707, "lng": 70.0577, "location": "Moti Khavdi, Jamnagar, Gujarat", "status": "NORMAL", "baseline_frp": 120.0, "current_frp": 118.4, "last_detected": "2026-08-27T14:20:00Z", "total_events_past_90_days": 120, "emergency_contact": "+91-288-2661-500", "risk_buffer_radius_km": 5.0},
    {"id": "FAC-006", "name": "Bharuch Fertilizer & Chemical Complex", "type": "Fertilizer Plant", "lat": 21.7000, "lng": 72.9900, "location": "Narmadanagar, Bharuch, Gujarat", "status": "NORMAL", "baseline_frp": 12.0, "current_frp": 14.2, "last_detected": "2026-08-27T11:10:00Z", "total_events_past_90_days": 18, "emergency_contact": "+91-2642-247-600", "risk_buffer_radius_km": 2.0},
]
