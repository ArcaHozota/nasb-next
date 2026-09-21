"use client";

// src/components/FeedbackHost.tsx
// 旧 components/FeedbackHost.vue を移植。App(Providers)直下にグローバルマウントする。
import RippleButton from "@/components/RippleButton";
import { useFeedbackStore } from "@/stores/feedback";

export default function FeedbackHost() {
  const snackbar = useFeedbackStore((s) => s.snackbar);
  const dialog = useFeedbackStore((s) => s.dialog);
  const answer = useFeedbackStore((s) => s.answer);

  return (
    <>
      {/* スナックバー(旧 MUI Snackbar 相当) */}
      {snackbar.show && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded bg-gray-800 px-4 py-2 text-sm text-white shadow-lg transition duration-200 ease-out">
          {snackbar.text}
        </div>
      )}

      {/* 確認ダイアログ(旧 MUI Dialog 相当) */}
      {dialog.show && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === e.currentTarget) answer(false);
          }}
        >
          <div className="w-full max-w-sm overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="bg-white pt-3">
              <h2
                className={`text-center text-lg font-semibold ${
                  dialog.variant === "success" ? "text-success" : "text-primary"
                }`}
              >
                {dialog.title}
              </h2>
              <div
                className={`mx-1.5 mt-2 h-0.75 rounded-full ${
                  dialog.variant === "success" ? "bg-success" : "bg-primary"
                }`}
              ></div>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600">{dialog.text}</p>
              <div className="mt-6 flex justify-end gap-2">
                <RippleButton
                  className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
                  rippleColor="rgba(0, 0, 0, 0.12)"
                  onClick={() => answer(false)}
                >
                  {dialog.cancelLabel}
                </RippleButton>
                <RippleButton
                  className={`rounded px-3 py-1.5 text-sm font-medium text-white ${
                    dialog.variant === "success" ? "bg-success" : "bg-primary"
                  }`}
                  onClick={() => answer(true)}
                >
                  {dialog.confirmLabel}
                </RippleButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
