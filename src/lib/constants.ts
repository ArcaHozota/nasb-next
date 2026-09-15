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

export const extractErrorMessage = (e: unknown, fallback: string): string => {
  const data = (e as AxiosError<unknown>)?.response?.data;
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "message" in data)
    return String((data as { message: unknown }).message);
  return fallback;
};
