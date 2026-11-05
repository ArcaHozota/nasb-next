"use client";

// src/hooks/use-unsaved-changes.ts
// 編集内容があるあいだだけ、次の動作に対してブラウザ標準の確認を出す。
//  - タブ/ブラウザを閉じる、Ctrl+R などの再読み込み、アドレス欄から別サイトへ移動
// 画面内のリンク(サイドバー等)は beforeunload が動かないため、(admin)/layout.tsx が
// useUnsavedGuard の dirty を見て自前の確認ダイアログを出す。
import { useEffect } from "react";
import { useUnsavedGuard } from "@/stores/unsavedGuard";

export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    useUnsavedGuard.getState().setDirty(isDirty);
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useUnsavedGuard.getState().bypass) return;
      e.preventDefault();
      // 古いブラウザ向け(文言は表示されず、ブラウザ標準の確認になる)
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      useUnsavedGuard.getState().setDirty(false);
    };
  }, [isDirty]);
}
