// src/lib/scoreKeys.ts
// 楽譜が登録されている調の一覧(GET /hymns/{id}/score?keysOnly=true)の取得。
// ホーム・賛美歌一覧の両方から使い、React Query のキャッシュを共有する。
// 同じ曲の𝄞を続けて押したときに、毎回サーバーへ問い合わせないようにするため。
// 楽譜をアップロードしたら invalidateScoreKeys() でその曲のキャッシュを捨てる。
import type { QueryClient } from "@tanstack/react-query";
import api from "@/api/axios";
import type { ScoreKey } from "@/components/ScoreKeyPopover";

/** 調の一覧を新鮮とみなす時間。他の端末でのアップロードもこの時間内には反映される */
const SCORE_KEYS_STALE_MS = 60 * 1000;

const scoreKeysQueryKey = (id: number | string) =>
  ["score-keys", String(id)] as const;

/** 調の一覧のクエリ設定(useQuery・fetchQuery の両方で使う) */
export const scoreKeysQueryOptions = (id: number | string) => ({
  queryKey: scoreKeysQueryKey(id),
  queryFn: async (): Promise<ScoreKey[]> => {
    const { data } = await api.get(`/hymns/${id}/score`, {
      params: { keysOnly: true },
    });
    const list = Array.isArray(data) ? data : [];
    return list.map((k: { chord: string; isOriginal?: boolean | string }) => ({
      chord: k.chord,
      isOriginal: k.isOriginal === true || k.isOriginal === "true",
    }));
  },
  staleTime: SCORE_KEYS_STALE_MS,
});

export const fetchScoreKeysCached = (
  queryClient: QueryClient,
  id: number,
): Promise<ScoreKey[]> => queryClient.fetchQuery(scoreKeysQueryOptions(id));

export const invalidateScoreKeys = (
  queryClient: QueryClient,
  id: number | string,
) => queryClient.invalidateQueries({ queryKey: scoreKeysQueryKey(id) });
