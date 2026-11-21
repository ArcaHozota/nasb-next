"use client";

// src/app/(admin)/error/page.tsx
// 旧 views/ErrorPage.vue を移植
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useGuardedNavigation } from "@/hooks/use-guarded-navigation";
import { CircleAlert } from "lucide-react";
import { base64ToUtf8 } from "@/lib/constants";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";

function ErrorPageInner() {
  const { go, needsConfirmation } = useGuardedNavigation();
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
    <div className="mx-auto max-w-xl p-8">
      <Alert variant="destructive" className="bg-white">
        <CircleAlert />
        <AlertTitle>エラーが発生しました</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <div className="mt-4 flex justify-end">
        <Link
          href="/mainmenu"
          className={buttonVariants({ variant: "outline" })}
          onNavigate={(event) => {
            if (!needsConfirmation("/mainmenu")) return;
            event.preventDefault();
            void go("/mainmenu");
          }}
        >
          メインメニューへ戻る
        </Link>
      </div>
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
