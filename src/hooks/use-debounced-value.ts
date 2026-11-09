"use client";

// src/hooks/use-debounced-value.ts
// 値が delayMs のあいだ変わらなかったら、その値を返す(入力のたびにAPIを叩かないため)。
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
