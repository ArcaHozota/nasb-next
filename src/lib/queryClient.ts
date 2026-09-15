// src/lib/queryClient.ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30秒間はキャッシュを新鮮とみなし、再取得しない
      retry: 1, // 失敗時のリトライは1回まで(認証エラーで無駄に連打しないため)
    },
  },
});
