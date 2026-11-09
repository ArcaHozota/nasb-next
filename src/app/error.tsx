"use client";

// src/app/error.tsx
// 画面の描画中に起きた想定外のエラーを受け止める(ルート全体で共通)。
import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-lg font-semibold">エラーが発生しました</h1>
      <p className="text-sm text-gray-600">
        時間をおいてもう一度お試しください。解消しない場合はホームへ戻ってください。
      </p>
      <div className="flex gap-2">
        <Button onClick={reset}>再読み込み</Button>
        <Button variant="outline" asChild>
          <Link href="/home">ホームへ</Link>
        </Button>
      </div>
    </main>
  );
}
