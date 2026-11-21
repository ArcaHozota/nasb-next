// src/lib/constants.ts
export const DELAY_APOLOGY = "すみませんが、当機能はまだ実装されておりません";

export const EMPTY_STRING = "";

export const utf8ToBase64 = (str: string): string => {
  const bytes = new TextEncoder().encode(str);
  const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join(
    EMPTY_STRING,
  );
  return btoa(binString);
};

export const base64ToUtf8 = (str: string): string => {
  const binString = atob(str);
  const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

import type { AxiosError } from "axios";

/** Axios エラー・応答本文から表示用の文言を取り出す。通常の Error は既定文言にする。 */
export const extractErrorMessage = (value: unknown, fallback: string): string => {
  const data =
    value && typeof value === "object" && "response" in value
      ? (value as AxiosError<unknown>).response?.data
      : value instanceof Error
        ? undefined
        : value;
  const message =
    typeof data === "string"
      ? data
      : data &&
          typeof data === "object" &&
          !Array.isArray(data) &&
          "message" in data
        ? data.message
        : undefined;
  const text = typeof message === "string" ? message.trim() : EMPTY_STRING;
  return text || fallback;
};
