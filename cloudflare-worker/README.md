# Cloudflare Worker セットアップ手順

## 1. Cloudflareアカウント作成
https://cloudflare.com で無料アカウントを作成

## 2. Workerを作成
1. ダッシュボード → Workers & Pages → Create
2. 「Hello World」テンプレートで作成
3. `worker.js` の内容を貼り付けてデプロイ

## 3. 環境変数を設定
Workerの Settings → Variables → Add variable
- 変数名: `NOTION_API_KEY`
- 値: Notionインテグレーションのトークン（`secret_xxx...`）
- **必ず「Encrypt」をONにする**

## 4. Worker URLをメモ
`https://xxxx.workers.dev` のようなURLが発行される

## 5. PWAに設定
アプリを開くと設定画面が表示されるのでWorker URLを入力
