// src/lib/youtube.ts
// YouTube連携まわりの共通処理。

import api from "@/api/axios";

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

/** バックエンドの PlaylistStatus（state: running / done / failed） */
export type PlaylistStatus = {
  playlistId: string;
  playlistUrl: string;
  state: "running" | "done" | "failed";
  total: number;
  added: number;
  message?: string;
};

const POLL_INTERVAL_MS = 1500;
// 動画が何百本あっても、これ以上待たない(サーバー側の処理は続くので、YouTube側には出来上がる)
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * プレイリストを作り、動画の追加が終わるまで待つ。
 * バックエンドは作成を受け付けたらすぐ(202)返し、動画の追加は裏で進める
 * (前段のCloudFrontは30秒で切れるため)。ここで playlist-status を見て完了・失敗を待つ。
 *
 * - 開始時のエラー(409:未連携・再認証など)は、これまでと同じく axios のエラーとして投げる。
 * - 追加の失敗は、サーバーのメッセージを持つ Error を投げる(extractErrorMessage の fallback ではなく
 *   e.message を使う側で表示すること)。
 */
export async function createPlaylistAndWait(
  hymnIds: string[],
  onProgress?: (s: PlaylistStatus) => void,
): Promise<PlaylistStatus> {
  const { data: started } = await api.post<PlaylistStatus>(
    "/youtube/create-playlist",
    { hymnIds },
  );
  let status = started;
  onProgress?.(status);
  const t0 = Date.now();
  while (status.state === "running") {
    if (Date.now() - t0 > POLL_TIMEOUT_MS) {
      throw new PlaylistError(
        "プレイリストの作成に時間がかかっています。しばらくしてからYouTubeでご確認ください。",
      );
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { data } = await api.get<PlaylistStatus>("/youtube/playlist-status", {
      params: { playlistId: started.playlistId },
    });
    status = data;
    onProgress?.(status);
  }
  if (status.state === "failed") {
    throw new PlaylistError(status.message ?? "プレイリスト作成に失敗しました");
  }
  return status;
}

/** 追加の失敗など、サーバーから受け取った文言をそのまま表示するためのエラー */
export class PlaylistError extends Error {}
