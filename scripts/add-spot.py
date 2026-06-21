#!/usr/bin/env python3
import os
import json
import urllib.request
import urllib.error

api_key = os.environ['NOTION_API_KEY']
db_id   = os.environ['NOTION_DATABASE_ID']

def notion_post(path, data):
    body = json.dumps(data).encode()
    req  = urllib.request.Request(
        f'https://api.notion.com/v1{path}',
        data=body,
        method='POST',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())

def rich_text(text):
    return [{'text': {'content': text}}] if text else []

name        = os.environ.get('SPOT_NAME', '').strip()
category    = os.environ.get('SPOT_CATEGORY', '').strip()
area        = os.environ.get('SPOT_AREA', '').strip()
environment = os.environ.get('SPOT_ENVIRONMENT', '').strip()
map_url     = os.environ.get('SPOT_MAP_URL', '').strip()
has_vehicle  = os.environ.get('SPOT_HAS_VEHICLE', 'false') == 'true'
has_creature = os.environ.get('SPOT_HAS_CREATURE', 'false') == 'true'
age_group   = os.environ.get('SPOT_AGE_GROUP', '').strip()
visited     = os.environ.get('SPOT_VISITED', 'false') == 'true'
access_memo = os.environ.get('SPOT_ACCESS_MEMO', '').strip()
memo        = os.environ.get('SPOT_MEMO', '').strip()

if not name:
    raise ValueError('SPOT_NAME is required')

props = {
    'スポット名':       {'title': [{'text': {'content': name}}]},
    '乗り物要素あり':   {'checkbox': has_vehicle},
    '虫・生き物要素あり': {'checkbox': has_creature},
    '行ったことある':   {'checkbox': visited},
}
if map_url:      props['Google マップ URL'] = {'url': map_url}
if category:     props['カテゴリ']          = {'select': {'name': category}}
if area:         props['エリア']            = {'select': {'name': area}}
if environment:  props['屋内 / 屋外']       = {'select': {'name': environment}}
if age_group:    props['年齢適性']          = {'select': {'name': age_group}}
if access_memo:  props['アクセスメモ']      = {'rich_text': rich_text(access_memo)}
if memo:         props['メモ']             = {'rich_text': rich_text(memo)}

page = notion_post('/pages', {
    'parent': {'database_id': db_id},
    'properties': props,
})
print(f"Created Notion page: {page['id']}")
