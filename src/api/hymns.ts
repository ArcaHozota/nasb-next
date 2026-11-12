// src/api/hymns.ts
// 賛美歌まわりの型・取得関数・React Query のキーを一か所にまとめる。
// 画面ごとに同じ型や GET /hymns の呼び出しを書かないようにし、
// 追加・編集・削除のあとは invalidateHymns() で関係する画面のキャッシュをまとめて捨てる。
import type { QueryClient } from "@tanstack/react-query";
import api from "@/api/axios";

/**
 * 一致度。CADMIUM=よく一致 / BURGUNDY=一致 / NAPLES=やや一致 / SNOWY=関連(一致なし)。
 * サーバーが将来ほかの値を返しても壊れないよう string も受ける。
 */
export type LineNumber = "CADMIUM" | "BURGUNDY" | "NAPLES" | "SNOWY" | (string & {});

/** 一覧・検索・ランダム選択で返る1曲分 */
export type HymnSummary = {
  /** Snowflake ID(19桁)は文字列のまま扱う(number にすると桁が丸まる) */
  id: string;
  nameJp: string;
  nameKr: string;
  link: string;
  lineNumber: LineNumber;
  /** 検索キーワードを含む歌詞の一行(検索したときだけサーバーが付ける) */
  snippet?: string | null;
};

/** GET /hymns の応答 */
export type HymnPage = {
  records: HymnSummary[];
  totalRecords: number;
};

/** GET /hymns/{id}(編集用) */
export type HymnDetail = {
  id: string;
  nameJp: string;
  nameKr: string;
  link: string;
  lyric: string;
  classic: boolean;
  updatedTime: string;
  updatedUser: string;
};

export type HymnPageParams = {
  pageNum: number;
  pageSize: number;
  keyword: string;
};

/** React Query のキー。先頭をすべて "hymns" にして、invalidateHymns() でまとめて捨てられるようにする */
export const hymnKeys = {
  all: ["hymns"] as const,
  page: (p: HymnPageParams) => ["hymns", "page", p] as const,
  infinite: (pageSize: number, keyword: string) =>
    ["hymns", "infinite", pageSize, keyword] as const,
  detail: (id: string) => ["hymns", "detail", String(id)] as const,
  random: (path: string, keyword: string, nonce: string) =>
    ["hymns", "random", path, keyword, nonce] as const,
  searchIndex: ["hymns", "search-index"] as const,
};

/** 検索キーワードはハングルの表記ゆれ(NFD)をそろえて送る */
const normalizeKeyword = (keyword: string) => keyword.normalize("NFC");

/** GET /hymns(一覧・検索) */
export async function fetchHymnPage({
  pageNum,
  pageSize,
  keyword,
}: HymnPageParams): Promise<HymnPage> {
  const { data } = await api.get<HymnPage>("/hymns", {
    params: { pageNum, pageSize, keyword: normalizeKeyword(keyword) },
  });
  return data;
}

/** GET /hymns/{id}(編集用の1曲) */
export async function fetchHymnDetail(id: string): Promise<HymnDetail> {
  const { data } = await api.get<HymnDetail>(`/hymns/${id}`);
  return data;
}

/**
 * ランダム選択。
 *   /hymns/random  : 画面内の検索ボタン
 *   /common/search : ヘッダーの検索欄から来たとき
 */
export type RandomPath = "/hymns/random" | "/common/search";

export async function fetchRandomHymns(
  path: RandomPath,
  keyword: string,
): Promise<HymnSummary[]> {
  const { data } = await api.get<HymnSummary[]>(path, {
    params: { keyword: normalizeKeyword(keyword) },
  });
  return Array.isArray(data) ? data : [];
}

/** 賛美歌の一覧・検索・編集用データ・画面検索の索引など、"hymns" で始まるキャッシュをすべて捨てる */
export const invalidateHymns = (queryClient: QueryClient) =>
  queryClient.invalidateQueries({ queryKey: hymnKeys.all });
