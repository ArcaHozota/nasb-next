"use client";

// src/app/(admin)/error/page.tsx
// 旧 views/ErrorPage.vue を移植
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { base64ToUtf8 } from "@/lib/constants";

function ErrorPageInner() {
  const searchParams = useSearchParams();
  const encoded = searchParams.get("errMsg");

  let message = "不明なエラーが発生しました";
  if (typeof encoded === "string") {
    try {
      message = base64ToUtf8(decodeURIComponent(encoded));
    } catch {
      message = "不明なエラーが発生しました";
    }
  }

  return (
    <div className="p-8 text-center">
      <h1 className="mb-4 text-xl font-semibold text-red-600">エラーが発生しました</h1>
      <p>{message}</p>
    </div>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={null}>
      <ErrorPageInner />
    </Suspense>
  );
}
