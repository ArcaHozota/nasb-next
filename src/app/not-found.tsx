// src/app/not-found.tsx
// 存在しないURLに来たときの画面(ルート全体で共通)。
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <h1 className="text-lg font-semibold">ページが見つかりません</h1>
      <p className="text-sm text-gray-600">
        URLが間違っているか、ページが移動または削除された可能性があります。
      </p>
      <Button asChild>
        <Link href="/home">ホームへ戻る</Link>
      </Button>
    </main>
  );
}
