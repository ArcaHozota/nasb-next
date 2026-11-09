// src/lib/download.ts
// 楽譜(PDF)のダウンロードと、Blob 応答のエラーメッセージ読み取り。
// ホーム・賛美歌一覧・楽譜アップロードのモーダルで共通に使う。
import axios from "axios";
import api from "@/api/axios";
import { extractErrorMessage } from "@/lib/constants";
import { useFeedbackStore } from "@/stores/feedback";

/** サーバーのメッセージとして画面に出してよい最大の長さ(HTMLのエラーページ等を除くため) */
const MAX_PLAIN_ERROR_LENGTH = 200;

/**
 * `responseType: "blob"` のリクエストが失敗したとき、エラー本文も Blob で届くため
 * extractErrorMessage ではサーバーのメッセージを読めない。Blob を文字列に戻して読む。
 * 読めなければ fallback を返す。
 */
export async function extractBlobErrorMessage(
  e: unknown,
  fallback: string,
): Promise<string> {
  const data = axios.isAxiosError(e) ? e.response?.data : undefined;
  if (!(data instanceof Blob)) return extractErrorMessage(e, fallback);
  try {
    const text = (await data.text()).trim();
    if (!text) return fallback;
    try {
      const json: unknown = JSON.parse(text);
      if (typeof json === "string") return json || fallback;
      if (json && typeof json === "object" && "message" in json) {
        return String((json as { message: unknown }).message);
      }
      return fallback;
    } catch {
      // JSON ではない文字列。HTML のエラーページや長文は表示しない
      return text.length <= MAX_PLAIN_ERROR_LENGTH && !text.startsWith("<")
        ? text
        : fallback;
    }
  } catch {
    return fallback;
  }
}

/** Blob をファイルとして保存させる */
export function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * 楽譜をダウンロードする。chord を省略すると、サーバー側がオリジナルキー優先で1件選ぶ。
 * 失敗したときは、サーバーのメッセージ(読めなければ既定の文言)を持つ Error を投げる。
 * 画面に出す(トースト等)のは呼び出し側。
 */
export async function downloadScore(id: string, chord?: string) {
  try {
    const res = await api.get<Blob>(`/hymns/${id}/score`, {
      params: chord ? { chord } : undefined,
      responseType: "blob",
      headers: { Accept: "*/*" },
    });
    saveBlob(res.data, chord ? `${id}(${chord}).pdf` : `${id}.pdf`);
  } catch (e: unknown) {
    throw new Error(await extractBlobErrorMessage(e, "楽譜の取得に失敗しました"));
  }
}

/** downloadScore の失敗をトーストで知らせる版(画面側で個別に表示しない場合に使う) */
export async function downloadScoreOrToast(id: string, chord?: string) {
  try {
    await downloadScore(id, chord);
  } catch (e: unknown) {
    useFeedbackStore
      .getState()
      .toast(e instanceof Error ? e.message : "楽譜の取得に失敗しました");
  }
}
