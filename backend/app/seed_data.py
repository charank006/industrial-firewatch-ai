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

# The curated facility registry was removed: it could only ever describe the
# region it was seeded for, and shipped with six Gujarat plants while the
# pipeline polled Telangana. "Nearest industrial site" is derived from the OSM
# enrichment instead - see osm/features.py industrial_sites.
