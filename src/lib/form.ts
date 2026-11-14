// src/lib/form.ts
// フォーム画面で共通利用する小さなヘルパー。
import { EMPTY_STRING } from "@/lib/constants";

/** 必須の項目が空のときのエラー文言(項目のすぐ下に出す)。画面ごとに文言がばらつかないよう、ここだけで定義する */
export const REQUIRED_MESSAGE = "入力してください。";

/** 必須チェック。OKなら空文字、NGならエラーメッセージを返す。 */
export const required = (v: string) =>
  !!v && v.trim() !== EMPTY_STRING ? EMPTY_STRING : REQUIRED_MESSAGE;

/** URLSearchParams.get() の null を空文字に正規化する。 */
export const asStr = (v: string | null) => v ?? EMPTY_STRING;
