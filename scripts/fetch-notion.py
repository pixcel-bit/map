"""Fetch all pages from a Notion database and write them to data.json."""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone


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


def main() -> None:
    api_key = os.environ.get("NOTION_API_KEY", "").strip()
    db_id   = os.environ.get("NOTION_DATABASE_ID", "").strip()

    if not api_key or not db_id:
        print("Error: NOTION_API_KEY and NOTION_DATABASE_ID must be set.", file=sys.stderr)
        sys.exit(1)

    print(f"Fetching Notion database {db_id[:8]}...")
    results = fetch_all(api_key, db_id)
    print(f"Total: {len(results)} spots")

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
