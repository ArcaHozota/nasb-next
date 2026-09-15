import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// standalone(Node.jsサーバー)構成。
// KOMORAN等のトークナイザをGo側で使う都合上バックエンドはLambda化を見送ったため、
// フロントエンドも静的エクスポート(output: "export")ではなく、
// 旧Next.js Dockerコンテナと同じくNode.jsサーバーを直接立てるstandalone構成に戻す。
//
// 「/api を剥がしてバックエンド(localhost:8277)へ転送する」のは旧 vite.config.ts
// と同じく `next dev` のときだけ。本番はこのコンテナの前段(nginx/CloudFront等)が
// /api を直接バックエンドコンテナへルーティングする想定で、このコンテナ自身は
// フロントエンドの配信にのみ専念する。
const nextConfig = (phase: string): NextConfig => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    output: "standalone",
    images: {
      unoptimized: true,
    },
    ...(isDev
      ? {
          async rewrites() {
            return [
              {
                source: "/api/:path*",
                destination: "http://localhost:8277/:path*",
              },
            ];
          },
        }
      : {}),
  };
};

export default nextConfig;
