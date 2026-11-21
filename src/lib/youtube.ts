// src/lib/youtube.ts
// YouTube連携まわりの共通処理。

import api from "@/api/axios";
import { extractErrorMessage } from "@/lib/constants";

// バックエンドの ProjectConstants.MESSAGE_YOUTUBE_REAUTH_REQUIRED と同じ文言。
// 再認証が必要な409(JSON文字列ボディ)と、未連携の409(ボディなし)を見分けるために使う。
const YOUTUBE_REAUTH_REQUIRED_MESSAGE = "YouTube連携の再認証が必要です。";

/**
 * エラーが「YouTube連携の再認証が必要」(HTTP 409 + 専用メッセージ)であれば、
 * 確認ダイアログに表示する文言(サーバーのメッセージ + 移動確認)を返す。該当しなければ null。
 */
export function getYoutubeReauthConfirmText(e: unknown): string | null {
  if (!e || typeof e !== "object" || !("response" in e)) return null;
  const res = (e as { response?: { status?: number; data?: unknown } })
    .response;
  if (res?.status !== 409) return null;
  const body = typeof res.data === "string" ? res.data : "";
  if (!body.includes(YOUTUBE_REAUTH_REQUIRED_MESSAGE)) return null;
  return `${YOUTUBE_REAUTH_REQUIRED_MESSAGE}今は個人情報画面へ移動していいですか。`;
}

/** バックエンドの PlaylistStatus（state: running / done / failed / cancelled） */
export type PlaylistStatus = {
  playlistId: string;
  playlistUrl: string;
  state: "running" | "done" | "failed" | "cancelled";
  total: number;
  added: number;
  message?: string;
};

/**
 * プレイリストにする曲の指定。
 *   hymnIds: 曲を直接指定する(ランダム選択)
 *   keyword: 賛美歌一覧の検索条件。サーバーが同じ検索をして、一致・よく一致の曲を全件集める
 */
export type PlaylistTarget = { hymnIds: string[] } | { keyword: string };

const POLL_INTERVAL_MS = 1500;
// 動画が何百本あっても、これ以上待たない(サーバー側の処理は続くので、YouTube側には出来上がる)
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * プレイリストを作り、動画の追加が終わるまで待つ。
 * バックエンドは作成を受け付けたらすぐ(202)返し、動画の追加は裏で進める
 * (前段のCloudFrontは30秒で切れるため)。ここで playlist-status を見て完了・失敗を待つ。
 *
 * - 開始時のエラー(409:未連携・再認証など)は、これまでと同じく axios のエラーとして投げる。
 * - 追加の失敗は、サーバーのメッセージを持つ PlaylistError を投げる。
 *   extractErrorMessage(e.message, fallback) で文言を表示すること。
 * - options.signal が中止されたら、進捗の確認をやめて PlaylistCancelled を投げる。作成の受け付け(POST)は
 *   途中で切らない(切ってもサーバー側では作られるため)。受け付けられたら options.onStarted に ID を渡す。
 */
export async function createPlaylistAndWait(
  target: PlaylistTarget,
  onProgress?: (s: PlaylistStatus) => void,
  options: {
    signal?: AbortSignal;
    onStarted?: (playlistId: string) => void;
  } = {},
): Promise<PlaylistStatus> {
  const { signal, onStarted } = options;
  const body =
    "keyword" in target
      ? { keyword: target.keyword.normalize("NFC") }
      : { hymnIds: target.hymnIds };
  const { data: started } = await api.post<PlaylistStatus>(
    "/youtube/create-playlist",
    body,
  );
  onStarted?.(started.playlistId);
  if (signal?.aborted) throw new PlaylistCancelled();
  let status = started;
  onProgress?.(status);
  const t0 = Date.now();
  while (status.state === "running") {
    if (Date.now() - t0 > POLL_TIMEOUT_MS) {
      throw new PlaylistError(
        "プレイリストの作成に時間がかかっています。しばらくしてからYouTubeでご確認ください。",
      );
    }
    await sleep(POLL_INTERVAL_MS, signal);
    const { data } = await api.get<PlaylistStatus>("/youtube/playlist-status", {
      params: { playlistId: started.playlistId },
      signal,
    });
    if (signal?.aborted) throw new PlaylistCancelled();
    status = data;
    onProgress?.(status);
  }
  if (status.state === "cancelled") throw new PlaylistCancelled();
  if (status.state === "failed") {
    throw new PlaylistError(
      extractErrorMessage(status, "プレイリスト作成に失敗しました"),
    );
  }
  return status;
}

/** 追加の失敗など、サーバーから受け取った文言をそのまま表示するためのエラー */
export class PlaylistError extends Error {}

/** 作成を中止した(画面を離れた)ので、進捗の確認をやめた。利用者には何も表示しない */
export class PlaylistCancelled extends Error {}

/** 待つ。signal が中止されたら、すぐに PlaylistCancelled で終わる */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new PlaylistCancelled());
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new PlaylistCancelled());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
