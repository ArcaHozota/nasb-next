// src/stores/feedback.ts
import { create } from "zustand";
import { toast as sonnerToast } from "sonner";
import { EMPTY_STRING } from "@/lib/constants";

type DialogState = {
  show: boolean;
  title: string;
  text: string;
  resolve: ((ok: boolean) => void) | null;
};

type FeedbackState = {
  dialog: DialogState;
  // 旧 layer.msg(トースト)相当。表示自体は shadcn/ui の Sonner(FeedbackHost の
  // <Toaster />)に任せる。従来の MUI Snackbar の autoHideDuration={3000} に合わせ、
  // 3秒後に自動で閉じる。呼び出し側の API(toast("..."))は従来通り。
  toast: (text: string) => void;
  // 旧 Swal.fire の confirm 相当。await confirm('...') で true/false が返る。
  // 見た目は共通の ConfirmDialog(ボタンは常に「いいえ」「はい」)。タイトルの使い分けは
  // ConfirmDialog のコメントを参照(上書きの確認 / 警告 / お知らせ)。タイトルの既定は「お知らせ」。
  confirm: (text: string, title?: string) => Promise<boolean>;
  answer: (ok: boolean) => void;
};

const DEFAULT_DIALOG: DialogState = {
  show: false,
  title: "お知らせ",
  text: EMPTY_STRING,
  resolve: null,
};

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  dialog: DEFAULT_DIALOG,

  toast: (text) => {
    sonnerToast(text, { duration: 3000 });
  },

  confirm: (text, title = "お知らせ") =>
    new Promise<boolean>((resolve) => {
      // 前のダイアログが未回答のまま次の confirm が来た場合は、前の方を false で閉じる
      get().dialog.resolve?.(false);
      set({
        dialog: {
          show: true,
          title,
          text,
          resolve,
        },
      });
    }),

  answer: (ok) => {
    const { resolve } = get().dialog;
    // AlertDialog はボタン押下後に onOpenChange(false) も発火するため、
    // 2回目の呼び出し(既に回答済み)は無視する。
    if (!resolve) return;
    resolve(ok);
    // タイトルや本文は残したまま show だけ落とす。
    // (即座に DEFAULT_DIALOG に戻すと、閉じるアニメーション中に文言が消えてしまう)
    set((s) => ({ dialog: { ...s.dialog, show: false, resolve: null } }));
  },
}));
