"use client";

// src/app/providers.tsx
// 旧 src/main.ts の App起動処理(pinia/router/VueQueryPlugin登録、
// auth:unauthorizedリスナー、マウント前CSRF取得)に相当。
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/auth";
import { useCsrfStore } from "@/stores/csrf";
import FeedbackHost from "@/components/FeedbackHost";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // window.addEventListener("auth:unauthorized", ...) 相当。
    // SPAなのでフルリロードではなく router.push で遷移させる。
    const onUnauthorized = () => {
      useAuthStore.getState().clearUser();
      router.push("/home");
    };
    window.addEventListener("auth:unauthorized", onUnauthorized);

    // CSRFトークンをマウント前に確定させておく。
    // 失敗してもアプリ自体は起動させ、以降のPOST/PUT/DELETEでresponse interceptor側の
    // 403リトライに委ねる(初回アクセス時のネットワーク瞬断などを致命傷にしないため)。
    useCsrfStore
      .getState()
      .fetchCsrf()
      .catch((err) => {
        console.error("Failed to fetch initial CSRF token", err);
      });

    return () =>
      window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, [router]);

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
