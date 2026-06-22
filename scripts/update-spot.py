#!/usr/bin/env python3
import os
import json
import urllib.request
import urllib.error

api_key  = os.environ['NOTION_API_KEY']
spot_id  = os.environ['SPOT_ID'].strip()
visited_str = os.environ.get('SPOT_VISITED', '').strip()
memo_str    = os.environ.get('SPOT_MEMO', '__SKIP__').strip()

if not spot_id:
    raise ValueError('SPOT_ID is required')

props = {}

if visited_str in ('true', 'false'):
    props['行ったことある'] = {'checkbox': visited_str == 'true'}

if memo_str != '__SKIP__':
    props['メモ'] = {'rich_text': [{'text': {'content': memo_str}}] if memo_str else []}

if not props:
    print("Nothing to update")
    exit(0)

req = urllib.request.Request(
    f'https://api.notion.com/v1/pages/{spot_id}',
    data=json.dumps({'properties': props}).encode(),
    method='PATCH',
    headers={
        'Authorization': f'Bearer {api_key}',
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
    },
)
try:
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
    print(f"Updated page: {result['id']}")
except urllib.error.HTTPError as e:
    body = e.read().decode('utf-8', errors='replace')
    print(f"Notion API error {e.code}: {body}")
    exit(1)
