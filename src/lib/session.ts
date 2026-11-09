// src/lib/session.ts
// ユーザー操作によらないログアウト(別端末ログイン・セッション切れなど)の共通処理。
// フルリロードで React Query / Zustand 等のクライアント側状態を丸ごとリセットし、
// 次のユーザーに前のユーザーのキャッシュが見えないようにする。
import { useUnsavedGuard } from "@/stores/unsavedGuard";

export const REDIRECT_MESSAGE_KEY = "redirectMessage";

export const SESSION_EXPIRED_MESSAGE =
  "ログインの有効期限が切れました。もう一度ログインしてください。";

/** メッセージを残してホームへフルリロードで戻す */
export function hardRedirectHome(message?: string) {
  if (typeof window === "undefined") return;
  try {
    if (message) localStorage.setItem(REDIRECT_MESSAGE_KEY, message);
  } catch {
    // ストレージが使えない環境ではメッセージ表示を諦める
  }
  // ユーザー操作ではない遷移なので、未保存の警告(beforeunload)は出さない
  useUnsavedGuard.getState().setBypass();
  // 全画面遷移(フルリロード)が目的なので、router ではなく location を使う
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/home";
}

/** localStorage に残したメッセージを1回だけ取り出す(無ければ null) */
export function consumeRedirectMessage(): string | null {
  try {
    const msg = localStorage.getItem(REDIRECT_MESSAGE_KEY);
    if (msg) localStorage.removeItem(REDIRECT_MESSAGE_KEY);
    return msg;
  } catch {
    return null;
  }
}
