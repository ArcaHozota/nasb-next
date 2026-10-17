// src/lib/form.ts
// フォーム画面で共通利用する小さなヘルパー。
import { EMPTY_STRING } from "@/lib/constants";

/** 必須チェック。OKなら空文字、NGならエラーメッセージを返す。 */
export const required = (v: string) =>
  !!v && v.trim() !== EMPTY_STRING
    ? EMPTY_STRING
    : "上記の入力ボックスを空になってはいけません。";

/** URLSearchParams.get() の null を空文字に正規化する。 */
export const asStr = (v: string | null) => v ?? EMPTY_STRING;
