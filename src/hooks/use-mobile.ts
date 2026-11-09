import * as React from "react";

/** モバイルとみなす画面幅の境目(Tailwind の md と同じ)。サイドバー・ホームで共通 */
export const MOBILE_BREAKPOINT = 768;
/** モバイル(768px未満)の media query。画面幅の判定はすべてこれを使う */
export const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
const QUERY = MOBILE_QUERY;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsMobile() {
  // Effect 内で setState せず、画面幅(外部の値)を useSyncExternalStore で購読する。
  // サーバー側(とハイドレーション中)は false
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
