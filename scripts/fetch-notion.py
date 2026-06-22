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


HOME_ADDRESS = "東京都板橋区大谷口上男65"


def nominatim_geocode(query):
    encoded = urllib.parse.quote(query)
    url = f"https://nominatim.openstreetmap.org/search?q={encoded}&format=json&limit=1&countrycodes=jp"
    req = urllib.request.Request(
        url, headers={"User-Agent": "ryosei-map/1.0 (github.com/pixcel-bit/map)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        if data:
            return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception as e:
        print(f"  Nominatim error: {e}", file=sys.stderr)
    return None, None


def extract_coords_from_url(url):
    if not url:
        return None, None
    m = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url)
    if m:
        return float(m.group(1)), float(m.group(2))
    for param in ["ll", "q"]:
        m = re.search(rf"[?&]{param}=(-?\d+\.\d+),(-?\d+\.\d+)", url)
        if m:
            return float(m.group(1)), float(m.group(2))
    return None, None


def osrm_car_minutes(home_lat, home_lng, dest_lat, dest_lng):
    # OSRM uses lon,lat order
    url = (
        f"http://router.project-osrm.org/route/v1/car/"
        f"{home_lng},{home_lat};{dest_lng},{dest_lat}?overview=false"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "ryosei-map/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
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


def get_prop_str(page, prop_name, kind):
    props = page.get("properties", {})
    p = props.get(prop_name, {})
    if kind == "title":
        return "".join(t.get("plain_text", "") for t in p.get("title", []))
    if kind == "url":
        return p.get("url") or ""
    if kind == "select":
        return (p.get("select") or {}).get("name") or ""
    return ""


def fetch_all(api_key, db_id):
    results = []
    start_cursor = None

    while True:
        body = {"page_size": 100}
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


def main():
    api_key = os.environ.get("NOTION_API_KEY", "").strip()
    db_id   = os.environ.get("NOTION_DATABASE_ID", "").strip()

    if not api_key or not db_id:
        print("Error: NOTION_API_KEY and NOTION_DATABASE_ID must be set.", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching Notion database {db_id[:8]}...")
    results = fetch_all(api_key, db_id)
    print(f"Total: {len(results)} spots")

    # Geocode home address once
    print(f"Geocoding home: {HOME_ADDRESS}")
    home_lat, home_lng = nominatim_geocode(HOME_ADDRESS)
    time.sleep(1)  # Nominatim rate limit
    if home_lat and home_lng:
        print(f"  Home coords: {home_lat}, {home_lng}")
    else:
        print("  Could not geocode home address, skipping travel times", file=sys.stderr)

    # Calculate travel times for each spot
    for i, page in enumerate(results):
        name    = get_prop_str(page, "スポット名", "title")
        map_url = get_prop_str(page, "Google マップ URL", "url")
        area    = get_prop_str(page, "エリア", "select")

        dest_lat, dest_lng = extract_coords_from_url(map_url)

        # If no coords in URL, try geocoding by name
        if home_lat and (not dest_lat) and name:
            time.sleep(1)  # Nominatim rate limit
            query = f"{name} {area} 日本" if area else f"{name} 東京"
            dest_lat, dest_lng = nominatim_geocode(query)

        if home_lat and dest_lat and dest_lng:
            car_min = osrm_car_minutes(home_lat, home_lng, dest_lat, dest_lng)
            page["_car_minutes"] = car_min
            page["_transit_url"] = make_transit_url(dest_lat, dest_lng)
            page["_car_dir_url"]  = make_car_dir_url(dest_lat, dest_lng)
            print(f"  [{i+1}] {name}: 🚗 {car_min}分")
        else:
            page["_car_minutes"] = None
            page["_transit_url"] = None
            page["_car_dir_url"]  = None
            if name:
                print(f"  [{i+1}] {name}: coords unavailable")

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
