import httpx

map_key = "b3cc086d1ec2bfe06e27631b3858c61f"
sources = ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "VIIRS_SNPP_NRT", "MODIS_NRT"]

for src in sources:
    # Test Country URL for India (IND) with day_range 2
    url_country = f"https://firms.modaps.eosdis.nasa.gov/api/country/csv/{map_key}/{src}/IND/2"
    try:
        resp = httpx.get(url_country, timeout=30.0)
        lines = resp.text.strip().splitlines()
        print(f"[{src}] Country IND (2 days): Status={resp.status_code}, Rows={len(lines)-1}")
        if len(lines) > 1:
            print("   Sample:", lines[1])
    except Exception as e:
        print(f"[{src}] Error: {e}")

# Also test area with day_range 3
for src in sources[:2]:
    url_area = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{map_key}/{src}/68.0,6.5,97.5,37.5/3"
    try:
        resp = httpx.get(url_area, timeout=30.0)
        lines = resp.text.strip().splitlines()
        print(f"[{src}] Area BBox India (3 days): Status={resp.status_code}, Rows={len(lines)-1}")
        if len(lines) > 1:
            print("   Sample:", lines[1])
    except Exception as e:
        print(f"[{src}] Area Error: {e}")
