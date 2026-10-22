// src/lib/youtube.ts
// YouTube連携まわりの共通処理。

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
