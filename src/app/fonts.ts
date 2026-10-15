// src/app/fonts.ts
// フォントはすべてビルド時にネットワークへ出ずに自前配信する。
// (next/font/google はビルド中に Google へ数百件を並列取得するため、
//  Colima 上の Jenkins ビルドで接続数制限にかかり ETIMEDOUT で失敗していた)
//
// 日本語・韓国語: Fontsource(npm パッケージ)の CSS を読み込む。
//   Google Fonts と同じく unicode-range ごとに分割された woff2 が入っており、
//   ブラウザは画面に出ている文字の分だけを取得する(従来の挙動と同じ)。
//   font-display: swap、preload なし、自動フォールバックなし(従来の
//   preload: false / adjustFontFallback: false と同じ状態)。
//   CSS 変数は globals.css の :root で「フォント名だけ」を定義している。
import "@fontsource/noto-serif-jp/400.css";
import "@fontsource/noto-serif-jp/600.css";
import "@fontsource/noto-serif-jp/700.css";
import "@fontsource/noto-serif-kr/400.css";
import "@fontsource/noto-serif-kr/600.css";
import "@fontsource/noto-serif-kr/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";

import localFont from "next/font/local";

// ロゴ(.effect-shine)用。ラテン文字だけの小さいファイルなので next/font/local で先読みする
export const niconne = localFont({
  src: "../../node_modules/@fontsource/niconne/files/niconne-latin-400-normal.woff2",
  weight: "400",
  display: "swap",
  variable: "--font-niconne",
});

// <html> に付ける。Noto 系の変数は globals.css の :root で定義
export const fontVariables = niconne.variable;
