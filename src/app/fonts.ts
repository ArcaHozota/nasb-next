// src/app/fonts.ts
// Google Fonts は next/font で読み込む(ビルド時にダウンロードして自前サーバーから配信する)。
// 以前は globals.css の @import url("https://fonts.googleapis.com/...") で読み込んでいたが、
// HTML → CSS → Google の CSS → woff2 と直列に待つため初回描画が遅れていた。
//
// 日本語・韓国語フォントは文字数が多く、Google 側で unicode-range ごとに細かく分割されている。
// next/font は分割をそのまま保ち、ブラウザは画面に出ている文字の分だけを取得する。
// これらは「先読み(preload)すべき1ファイル」が決まらないため preload: false にしている
// (Next.js の subsets にも japanese / korean は無い)。
// また adjustFontFallback: false にして、CSS 変数を「フォント名だけ」にしている。
// 既定の自動フォールバック(Times New Roman 等)が変数に入ると、"Noto Serif JP" に無いハングルが
// 次の "Noto Serif KR" より先にそのフォールバックで描かれてしまうため。
import { Niconne, Noto_Sans_JP, Noto_Serif_JP, Noto_Serif_KR } from "next/font/google";

// ロゴ(.effect-shine)用。ラテン文字だけなので先読みする
export const niconne = Niconne({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-niconne",
});

export const notoSerifJp = Noto_Serif_JP({
  weight: ["400", "600", "700"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-noto-serif-jp",
});

export const notoSerifKr = Noto_Serif_KR({
  weight: ["400", "600", "700"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-noto-serif-kr",
});

export const notoSansJp = Noto_Sans_JP({
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  variable: "--font-noto-sans-jp",
});

// <html> に付けると、上記4つの CSS 変数がアプリ全体で使えるようになる
export const fontVariables = [
  niconne.variable,
  notoSerifJp.variable,
  notoSerifKr.variable,
  notoSansJp.variable,
].join(" ");
