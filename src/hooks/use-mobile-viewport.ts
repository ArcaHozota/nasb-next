import { useSyncExternalStore } from "react";

// Tailwind の md に合わせて、ホームを幅768pxで切り替える。
const MOBILE_QUERY = "(width < 768px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(MOBILE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

// ホームは幅が判明してから、PC・モバイルのどちらの一覧を取得するか決める。
export function useMobileViewport() {
  return useSyncExternalStore<boolean | null>(subscribe, getSnapshot, () => null);
}
