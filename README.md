# NASB1995 フロントエンド (Next.js + Tailwind)

旧 nasb-vue-main (Vue 3 + Tailwind) を Next.js 15 (App Router) + Tailwind v4 へ移行したもの。
`output: "standalone"` で、Next.js自身のNode.jsサーバーが配信するDockerコンテナ構成。

- `npm run dev` : 開発サーバー起動 (`/api` は `http://localhost:8277` へプロキシ)
- `npm run build` : `.next/standalone` に最小限のNode.jsサーバー一式を生成
- `docker build .` : マルチステージビルドで軽量な実行用イメージを作成(ポート3000)

本番の `/api` ルーティングは、このコンテナの前段(nginx/CloudFront等)が
バックエンドコンテナへ直接転送する想定。
