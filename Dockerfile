# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# --- runtime stage ---
# output: "standalone" が生成する最小限のNode.jsサーバー一式だけをコピーする。
# node_modulesを丸ごと持ち込まないため、ビルドステージより大幅に軽量。
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

# 旧Next.jsコンテナ/nginxコンテナと同じポート3000のまま維持する。
EXPOSE 3000
CMD ["node", "server.js"]
