// Cloudflare Worker: Notion API proxy
// Environment variables required:
//   NOTION_API_KEY  ... Notion integration token (secret_xxx)

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return cors(null, 204);
    }

    const url = new URL(request.url);
    const notionUrl = 'https://api.notion.com/v1' + url.pathname + url.search;

    const body = ['POST', 'PATCH', 'PUT'].includes(request.method)
      ? await request.text()
      : undefined;

    let notionResp;
    try {
      notionResp = await fetch(notionUrl, {
        method: request.method,
        headers: {
          'Authorization': `Bearer ${env.NOTION_API_KEY}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body,
      });
    } catch (e) {
      return cors(JSON.stringify({ error: e.message }), 502);
    }

    const data = await notionResp.text();
    return cors(data, notionResp.status);
  },
};

function cors(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
