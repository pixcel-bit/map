"""Fetch all pages from a Notion database and write them to data.json."""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone


HOME_ADDRESS = "東京都板橋区大谷口上町65"
HOME_LAT = 35.7317
HOME_LNG = 139.6878


def photon_geocode(query):
    """Geocode using Photon (Komoot) — free, no key, OSM-based."""
    encoded = urllib.parse.quote(query)
    url = f"https://photon.komoot.io/api/?q={encoded}&limit=1"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "ryosei-map/1.0 (github.com/pixcel-bit/map)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        features = data.get("features", [])
        if features:
            coords = features[0]["geometry"]["coordinates"]
            return float(coords[1]), float(coords[0])  # lat, lng
    except Exception as e:
        print(f"  photon error for '{query}': {e}", file=sys.stderr)
    return None, None


def extract_coords_from_url(map_url):
    if not map_url:
        return None, None
    # @lat,lng pattern (standard Google Maps share URL)
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", map_url)
    if m:
        return float(m.group(1)), float(m.group(2))
    # ?q=lat,lng or &q=lat,lng pattern
    m = re.search(r"[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)", map_url)
    if m:
        return float(m.group(1)), float(m.group(2))
    # ll=lat,lng pattern
    m = re.search(r"ll=(-?\d+\.\d+),(-?\d+\.\d+)", map_url)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None


def osrm_car_minutes(home_lat, home_lng, dest_lat, dest_lng):
    url = (
        f"http://router.project-osrm.org/route/v1/car/"
        f"{home_lng},{home_lat};{dest_lng},{dest_lat}?overview=false"
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "ryosei-map/1.0 (github.com/pixcel-bit/map)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        if data.get("code") == "Ok" and data.get("routes"):
            return round(data["routes"][0]["duration"] / 60)
    except Exception as e:
        print(f"  OSRM error: {e}", file=sys.stderr)
    return None


def make_transit_url(dest_lat, dest_lng):
    origin = urllib.parse.quote(HOME_ADDRESS)
    return (
        f"https://www.google.com/maps/dir/?api=1"
        f"&origin={origin}"
        f"&destination={dest_lat},{dest_lng}"
        f"&travelmode=transit"
    )


def make_car_dir_url(dest_lat, dest_lng):
    origin = urllib.parse.quote(HOME_ADDRESS)
    return (
        f"https://www.google.com/maps/dir/?api=1"
        f"&origin={origin}"
        f"&destination={dest_lat},{dest_lng}"
        f"&travelmode=driving"
    )


def fetch_all(api_key: str, db_id: str) -> list:
    results = []
    start_cursor = None

    while True:
        body: dict = {"page_size": 100}
        if start_cursor:
            body["start_cursor"] = start_cursor

        req = urllib.request.Request(
            f"https://api.notion.com/v1/databases/{db_id}/query",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Notion-Version": "2022-06-28",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body_bytes = e.read()
            print(f"Notion API error {e.code}: {body_bytes.decode('utf-8', errors='replace')}", file=sys.stderr)
            sys.exit(1)

        results.extend(data.get("results", []))
        print(f"  fetched {len(results)} pages so far...")

        if not data.get("has_more"):
            break

        start_cursor = data.get("next_cursor")

    return results


def enrich_travel(pages):
    print(f"Home coords: {HOME_LAT}, {HOME_LNG}")

    for page in pages:
        props = page.get("properties", {})

        name = ""
        for t in props.get("スポット名", {}).get("title", []):
            name += t.get("plain_text", "")

        area = props.get("エリア", {}).get("select", {}).get("name", "")
        map_url = props.get("Google マップ URL", {}).get("url", "")

        dest_lat, dest_lng = extract_coords_from_url(map_url)

        if dest_lat is None and name:
            query = f"{name} {area}".strip()
            print(f"  Geocoding '{query}' via Photon...")
            time.sleep(1)
            dest_lat, dest_lng = photon_geocode(query)

        if dest_lat is not None:
            print(f"  {name}: coords={dest_lat},{dest_lng}")
            car_min = osrm_car_minutes(HOME_LAT, HOME_LNG, dest_lat, dest_lng)
            page["_car_minutes"] = car_min
            page["_transit_url"] = make_transit_url(dest_lat, dest_lng)
            page["_car_dir_url"] = make_car_dir_url(dest_lat, dest_lng)
        else:
            print(f"  {name}: could not determine coords, skipping travel time", file=sys.stderr)
            page["_car_minutes"] = None
            page["_transit_url"] = None
            page["_car_dir_url"] = None

    return pages


def main() -> None:
    api_key = os.environ.get("NOTION_API_KEY", "").strip()
    db_id   = os.environ.get("NOTION_DATABASE_ID", "").strip()

    if not api_key or not db_id:
        print("Error: NOTION_API_KEY and NOTION_DATABASE_ID must be set.", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching Notion database {db_id[:8]}...")
    results = fetch_all(api_key, db_id)
    print(f"Total: {len(results)} spots")

    print("Calculating travel times...")
    results = enrich_travel(results)

    output = {
        "results":    results,
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }

    out_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Saved to {out_path}")


if __name__ == "__main__":
    main()
