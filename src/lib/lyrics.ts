// src/lib/lyrics.ts
// ホーム画面の「歌詞の照合」用: 検索キーワードの分解・歌詞の取得・一致箇所の分割。
import type { QueryClient } from "@tanstack/react-query";
import api from "@/api/axios";

/**
 * 検索キーワードから、歌詞と照合する語の一覧を取り出す。
 * バックエンドの LyricSnippets.extractTerms と同じ規則:
 * 先頭の * ★ #(絞り込み記号)を外し、& / && で区切って、前後の空白を除いた空でない語(重複なし)。
 */
export function extractTerms(keyword: string): string[] {
  let body = keyword.normalize("NFC").trim();
  if (body.startsWith("*") || body.startsWith("★") || body.startsWith("#")) {
    body = body.slice(1);
  }
  const terms = body
    .split("&")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return [...new Set(terms)];
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type TextPart = { text: string; hit: boolean };

/** 文字列を「一致した部分」と「それ以外」に分ける(大文字・小文字は区別しない) */
export function splitByTerms(text: string, terms: string[]): TextPart[] {
  const normalized = text.normalize("NFC");
  if (terms.length === 0) return [{ text: normalized, hit: false }];
  // 長い語を先に試し、短い語に一部だけ食われないようにする
  const pattern = [...terms]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const re = new RegExp(`(${pattern})`, "giu");
  return normalized
    .split(re)
    .filter((s) => s.length > 0)
    .map((s) => ({
      text: s,
      hit: terms.some((t) => t.toLowerCase() === s.toLowerCase()),
    }));
}

/** 一致した箇所の数 */
export const countHits = (text: string, terms: string[]) =>
  splitByTerms(text, terms).filter((p) => p.hit).length;

export const lyricQueryKey = (id: number | string) =>
  ["lyric", String(id)] as const;

/** 歌詞(GET /hymns/{id}/lyric、未ログインでも可)。歌詞はめったに変わらないので5分キャッシュする */
export const lyricQueryOptions = (id: number | string) => ({
  queryKey: lyricQueryKey(id),
  queryFn: async () => {
    const { data } = await api.get<{ id: string; lyric: string }>(
      `/hymns/${id}/lyric`,
    );
    return data.lyric ?? "";
  },
  staleTime: 5 * 60 * 1000,
});

export const invalidateLyric = (
  queryClient: QueryClient,
  id: number | string,
) => queryClient.invalidateQueries({ queryKey: lyricQueryKey(id) });
