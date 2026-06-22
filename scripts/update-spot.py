"""Update visited flag and/or memo for an existing Notion page."""

import json
import os
import sys
import urllib.error
import urllib.request


def main() -> None:
    api_key     = os.environ.get("NOTION_API_KEY", "").strip()
    spot_id     = os.environ.get("SPOT_ID", "").strip()
    visited_str = os.environ.get("SPOT_VISITED", "").strip()
    memo_str    = os.environ.get("SPOT_MEMO", "__SKIP__").strip()

    if not api_key:
        print("Error: NOTION_API_KEY must be set.", file=sys.stderr)
        sys.exit(1)
    if not spot_id:
        print("Error: SPOT_ID must be set.", file=sys.stderr)
        sys.exit(1)

    props = {}
    if visited_str in ("true", "false"):
        props["行ったことある"] = {"checkbox": visited_str == "true"}
    if memo_str != "__SKIP__":
        props["メモ"] = {
            "rich_text": [{"text": {"content": memo_str}}] if memo_str else []
        }

    if not props:
        print("Nothing to update.")
        return

    req = urllib.request.Request(
        f"https://api.notion.com/v1/pages/{spot_id}",
        data=json.dumps({"properties": props}).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
        },
        method="PATCH",
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        print(f"Updated page: {result['id']}")
    except urllib.error.HTTPError as e:
        body_bytes = e.read()
        print(f"Notion API error {e.code}: {body_bytes.decode('utf-8', errors='replace')}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
