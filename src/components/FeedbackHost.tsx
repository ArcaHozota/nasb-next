"use client";

// src/components/FeedbackHost.tsx
// 旧 components/FeedbackHost.vue を移植。App(Providers)直下にグローバルマウントする。
// shadcn/ui 版: スナックバー → Sonner(<Toaster />)、確認ダイアログ → AlertDialog。
// フォーカストラップ・Escキー・背面スクロールのロック・ARIA属性は Radix 側が担当する。
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { useFeedbackStore } from "@/stores/feedback";
import { cn } from "@/lib/utils";

export default function FeedbackHost() {
  const dialog = useFeedbackStore((s) => s.dialog);
  const answer = useFeedbackStore((s) => s.answer);

  const isSuccess = dialog.variant === "success";

  return (
    <>
      {/* スナックバー(旧 MUI Snackbar 相当): 画面下中央・濃いグレー */}
      <Toaster
        position="bottom-center"
        toastOptions={{
          classNames: {
            toast:
              "!rounded !border-0 !bg-gray-800 !px-4 !py-3 !text-sm !text-white !shadow-lg",
          },
        }}
      />

      {/* 確認ダイアログ(旧 MUI Dialog 相当) */}
      <AlertDialog
        open={dialog.show}
        onOpenChange={(open) => {
          // Escキーで閉じた場合はキャンセル扱い
          if (!open) answer(false);
        }}
      >
        <AlertDialogContent className="noto-sans max-w-sm gap-0 overflow-hidden rounded-lg border-0 p-0 shadow-xl sm:max-w-sm">
          <AlertDialogHeader className="gap-0 pt-3">
            <AlertDialogTitle
              className={cn(
                "text-center text-lg font-semibold",
                isSuccess ? "text-success" : "text-primary",
              )}
            >
              {dialog.title}
            </AlertDialogTitle>
            <div
              className={cn(
                "mx-1.5 mt-2 h-0.75 rounded-full",
                isSuccess ? "bg-success" : "bg-primary",
              )}
            ></div>
          </AlertDialogHeader>
          <div className="p-6">
            <AlertDialogDescription className="text-sm text-gray-600">
              {dialog.text}
            </AlertDialogDescription>
            <AlertDialogFooter className="mt-6 flex-row justify-end gap-2">
              {/* ui/alert-dialog の AlertDialogCancel/Action は波紋の無いボタンになるため、
                  Radix の素の部品に波紋付きの Button を渡す。
                  (Cancel に初期フォーカスが当たる等の挙動はそのまま) */}
              <AlertDialogPrimitive.Cancel asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-normal text-gray-600"
                  onClick={() => answer(false)}
                >
                  {dialog.cancelLabel}
                </Button>
              </AlertDialogPrimitive.Cancel>
              <AlertDialogPrimitive.Action asChild>
                <Button
                  variant={isSuccess ? "success" : "default"}
                  size="sm"
                  onClick={() => answer(true)}
                >
                  {dialog.confirmLabel}
                </Button>
              </AlertDialogPrimitive.Action>
            </AlertDialogFooter>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
