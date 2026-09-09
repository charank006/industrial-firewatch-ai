import json
from pathlib import Path
import httpx
from shapely.geometry import shape, Point
from shapely.prepared import prep

URLS = [
    "https://gist.githubusercontent.com/jbrobst/56c13bbbf9d97d187fea0155238cb5a8/raw/e388c42e20ed539c7397f75779a043d44a4ae7e7/india_states.geojson",
    "https://raw.githubusercontent.com/geohacker/india/master/state/india_state.geojson",
    "https://raw.githubusercontent.com/Subhash9325/GeoJson-Data-of-Indian-States/master/Indian_States",
]

def main():
    saved_data = None
    for u in URLS:
        try:
            print(f"Fetching from {u}...")
            r = httpx.get(u, timeout=25, follow_redirects=True)
            if r.status_code == 200:
                d = r.json()
                features = d.get("features", [])
                if len(features) >= 25:
                    print(f"Successfully retrieved GeoJSON with {len(features)} states/UTs from {u}!")
                    saved_data = d
                    break
        except Exception as e:
            print(f"Error fetching {u}: {e}")

    if not saved_data:
        print("Could not fetch from remote URLs, checking fallback...")
        return

    # Standardize state names in properties
    for feat in saved_data["features"]:
        props = feat.get("properties", {})
        name = (
            props.get("ST_NM")
            or props.get("NAME_1")
            or props.get("state_name")
            or props.get("NAME")
            or props.get("name")
        )
        props["state_name"] = name
        props["name"] = name

    backend_dest = Path("backend/data/india_states.geojson")
    frontend_dest = Path("frontend/public/india_states.geojson")
    backend_dest.parent.mkdir(parents=True, exist_ok=True)
    frontend_dest.parent.mkdir(parents=True, exist_ok=True)

    with open(backend_dest, "w", encoding="utf-8") as f:
        json.dump(saved_data, f)
    with open(frontend_dest, "w", encoding="utf-8") as f:
        json.dump(saved_data, f)

    print(f"Saved to {backend_dest} and {frontend_dest}")

if __name__ == "__main__":
    main()
