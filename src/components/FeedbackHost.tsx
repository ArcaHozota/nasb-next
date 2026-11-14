"use client";

// src/components/FeedbackHost.tsx
// 旧 components/FeedbackHost.vue を移植。App(Providers)直下にグローバルマウントする。
// shadcn/ui 版: スナックバー → Sonner(<Toaster />)、確認ダイアログ → ConfirmDialog(AlertDialog)。
// フォーカストラップ・Escキー・背面スクロールのロック・ARIA属性は Radix 側が担当する。
import ConfirmDialog from "@/components/ConfirmDialog";
import { Toaster } from "@/components/ui/sonner";
import { useFeedbackStore } from "@/stores/feedback";

export default function FeedbackHost() {
  const dialog = useFeedbackStore((s) => s.dialog);
  const answer = useFeedbackStore((s) => s.answer);

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

      {/* 確認ダイアログ(旧 MUI Dialog 相当)。見た目は共通の ConfirmDialog */}
      <ConfirmDialog
        open={dialog.show}
        onOpenChange={(open) => {
          // Escキーで閉じた場合は「いいえ」扱い。
          // 「はい」「いいえ」を押したあとにも呼ばれるが、回答済みなので answer 側で無視される
          if (!open) answer(false);
        }}
        title={dialog.title}
        description={dialog.text}
        onConfirm={() => answer(true)}
        onCancel={() => answer(false)}
      />
    </>
  );
}
