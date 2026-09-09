import json
import httpx
from shapely.geometry import shape, Point

def fetch_and_save_india_boundary():
    # 1. Try public countries GeoJSON
    urls = [
        "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
        "https://raw.githubusercontent.com/johan/world.geo.json/master/countries/IND.geo.json",
        "https://raw.githubusercontent.com/datameet/maps/master/Country/india-composite.geojson",
    ]
    
    for url in urls:
        try:
            print(f"Trying {url}...")
            resp = httpx.get(url, timeout=15, follow_redirects=True)
            if resp.status_code == 200:
                data = resp.json()
                if "features" in data:
                    for feat in data["features"]:
                        props = feat.get("properties", {})
                        name = props.get("ADMIN") or props.get("name") or props.get("NAME") or props.get("ISO_A3") or props.get("country")
                        if name in ["India", "IND"]:
                            print(f"Found India feature in {url}!")
                            with open("data/india_boundary.geojson", "w") as f:
                                json.dump(feat, f)
                            return True
                elif data.get("type") in ["Feature", "Polygon", "MultiPolygon", "FeatureCollection"]:
                    print(f"Found direct geometry in {url}!")
                    with open("data/india_boundary.geojson", "w") as f:
                        json.dump(data, f)
                    return True
        except Exception as e:
            print(f"Error fetching from {url}: {e}")

    return False

if __name__ == "__main__":
    fetch_and_save_india_boundary()
