# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

# pnpm のストア(パッケージの実体の置き場)。下の --mount=type=cache でビルドをまたいで再利用する
ENV PNPM_CONFIG_STORE_DIR=/pnpm/store

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# pnpm は package.json の packageManager(pnpm@x.y.z)と同じ版を入れる(開発機・CI と同じ版になる)。
# Corepack は Node 25 以降に同梱されなくなったので使わず、どの環境でも同じ npm で入れる
# (npm なら pnpm 12 の OS ごとのネイティブバイナリ(optionalDependencies)も一緒に入る)
RUN npm install -g "$(node -p "require('./package.json').packageManager")"
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- runtime stage ---
# output: "standalone" が生成する最小限のNode.jsサーバー一式だけをコピーする。
# node_modulesを丸ごと持ち込まないため、ビルドステージより大幅に軽量。
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# standalone のサーバーは HOSTNAME で待ち受けるアドレスを決める。Docker では HOSTNAME が
# コンテナIDになり、そのアドレスでしか待ち受けないため、すべてのアドレスで待ち受けるようにする
# (コンテナ内からの HEALTHCHECK が localhost に届くようにするため)
ENV HOSTNAME=0.0.0.0

# root ではなく、node イメージに最初からある node ユーザーで動かす。
# ファイルの持ち主も node にしておく(Next.js が .next/cache に書き込めるように)
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node

# 旧Next.jsコンテナ/nginxコンテナと同じポート3000のまま維持する。
EXPOSE 3000

# /home はログイン不要の静的ページなので、バックエンドが落ちていても応答する(フロントエンド自身の生死だけを見る)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/home || exit 1

CMD ["node", "server.js"]
