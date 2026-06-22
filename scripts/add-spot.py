"""Add a new spot to the Notion database."""

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> None:
    api_key = os.environ.get("NOTION_API_KEY", "").strip()
    db_id   = os.environ.get("NOTION_DATABASE_ID", "").strip()

    if not api_key or not db_id:
        print("Error: NOTION_API_KEY and NOTION_DATABASE_ID must be set.", file=sys.stderr)
        sys.exit(1)

    name        = os.environ.get("SPOT_NAME", "").strip()
    map_url     = os.environ.get("SPOT_MAP_URL", "").strip()
    lat         = os.environ.get("SPOT_LAT", "").strip()
    lng         = os.environ.get("SPOT_LNG", "").strip()
    category    = os.environ.get("SPOT_CATEGORY", "").strip()
    area        = os.environ.get("SPOT_AREA", "").strip()
    environment = os.environ.get("SPOT_ENVIRONMENT", "").strip()
    age_group   = os.environ.get("SPOT_AGE_GROUP", "").strip()
    has_vehicle = os.environ.get("SPOT_HAS_VEHICLE", "false").strip().lower() == "true"

    if not name:
        print("Error: SPOT_NAME is required.", file=sys.stderr)
        sys.exit(1)

    # If coordinates were extracted client-side, normalize the URL to ?q=lat,lng
    # so fetch-notion.py can extract coords without external geocoding
    if lat and lng:
        map_url = f"https://maps.google.com/?q={lat},{lng}"
        print(f"Coordinates provided: {lat},{lng} -> stored as {map_url}")
    elif map_url:
        print(f"No coordinates extracted, storing original URL: {map_url}")

    props = {
        "スポット名": {"title": [{"text": {"content": name}}]},
    }
    if map_url:
        props["Google マップ URL"] = {"url": map_url}
    if category:
        props["カテゴリ"] = {"select": {"name": category}}
    if area:
        props["エリア"] = {"select": {"name": area}}
    if environment:
        props["屋内 / 屋外"] = {"select": {"name": environment}}
    if age_group:
        props["年齢適性"] = {"select": {"name": age_group}}
    props["乗り物要素あり"] = {"checkbox": has_vehicle}

    body = {
        "parent": {"database_id": db_id},
        "properties": props,
    }

    req = urllib.request.Request(
        "https://api.notion.com/v1/pages",
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
            result = json.loads(resp.read().decode("utf-8"))
        print(f"Created page: {result['id']}")
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        print(f"Notion API error {e.code}: {body_bytes.decode('utf-8', errors='replace')}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
