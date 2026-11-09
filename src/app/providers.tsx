"use client";

// src/app/providers.tsx
// 旧 src/main.ts の App起動処理(pinia/router/VueQueryPlugin登録、マウント前CSRF取得)に相当。
// 401(セッション切れ)の処理は api/axios.ts のレスポンスインターセプターが行う。
import { useEffect, useRef } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useCsrfStore } from "@/stores/csrf";
import FeedbackHost from "@/components/FeedbackHost";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Providers({ children }: { children: React.ReactNode }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // CSRFトークンをマウント前に確定させておく。
    // 失敗してもアプリ自体は起動させ、以降のPOST/PUT/DELETEでresponse interceptor側の
    // 403リトライに委ねる(初回アクセス時のネットワーク瞬断などを致命傷にしないため)。
    useCsrfStore
      .getState()
      .fetchCsrf()
      .catch((err) => {
        console.error("Failed to fetch initial CSRF token", err);
      });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* shadcn/ui の Tooltip はアプリ全体で1つの Provider を共有する */}
      <TooltipProvider delayDuration={200}>
        {children}
        <FeedbackHost />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
