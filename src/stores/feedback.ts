// src/stores/feedback.ts
import { create } from "zustand";
import { EMPTY_STRING } from "@/lib/constants";

type SnackbarState = {
  show: boolean;
  text: string;
};

type DialogState = {
  show: boolean;
  title: string;
  text: string;
  resolve: ((ok: boolean) => void) | null;
};

type FeedbackState = {
  snackbar: SnackbarState;
  dialog: DialogState;
  // 旧 layer.msg(トースト)相当。MUI Snackbarの autoHideDuration={3000} に合わせ、
  // 3秒後に自動で閉じる。
  toast: (text: string) => void;
  closeSnackbar: () => void;
  // 旧 Swal.fire の confirm 相当。await confirm('...') で true/false が返る
  confirm: (text: string, title?: string) => Promise<boolean>;
  answer: (ok: boolean) => void;
};

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  snackbar: { show: false, text: EMPTY_STRING },
  dialog: { show: false, title: "確認", text: EMPTY_STRING, resolve: null },

  toast: (text) => {
    set({ snackbar: { show: true, text } });
    setTimeout(() => get().closeSnackbar(), 3000);
  },

  closeSnackbar: () => {
    set((s) => ({ snackbar: { ...s.snackbar, show: false } }));
  },

  confirm: (text, title = "確認") =>
    new Promise<boolean>((resolve) => {
      set({ dialog: { show: true, title, text, resolve } });
    }),

  answer: (ok) => {
    get().dialog.resolve?.(ok);
    set({ dialog: { show: false, title: "確認", text: EMPTY_STRING, resolve: null } });
  },
}));
