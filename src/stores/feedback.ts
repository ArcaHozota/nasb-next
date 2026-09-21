// src/stores/feedback.ts
import { create } from "zustand";
import { EMPTY_STRING } from "@/lib/constants";

type SnackbarState = {
  show: boolean;
  text: string;
};

type DialogVariant = "primary" | "success";

type DialogState = {
  show: boolean;
  title: string;
  text: string;
  variant: DialogVariant;
  cancelLabel: string;
  confirmLabel: string;
  resolve: ((ok: boolean) => void) | null;
};

type ConfirmOptions = {
  variant?: DialogVariant;
  cancelLabel?: string;
  confirmLabel?: string;
};

type FeedbackState = {
  snackbar: SnackbarState;
  dialog: DialogState;
  // 旧 layer.msg(トースト)相当。MUI Snackbarの autoHideDuration={3000} に合わせ、
  // 3秒後に自動で閉じる。
  toast: (text: string) => void;
  closeSnackbar: () => void;
  // 旧 Swal.fire の confirm 相当。await confirm('...') で true/false が返る。
  // variant: "primary"(既定、burgundy red) | "success"(green)。
  confirm: (
    text: string,
    title?: string,
    options?: ConfirmOptions,
  ) => Promise<boolean>;
  answer: (ok: boolean) => void;
};

const DEFAULT_DIALOG: DialogState = {
  show: false,
  title: "確認",
  text: EMPTY_STRING,
  variant: "primary",
  cancelLabel: "キャンセル",
  confirmLabel: "OK",
  resolve: null,
};

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  snackbar: { show: false, text: EMPTY_STRING },
  dialog: DEFAULT_DIALOG,

  toast: (text) => {
    set({ snackbar: { show: true, text } });
    setTimeout(() => get().closeSnackbar(), 3000);
  },

  closeSnackbar: () => {
    set((s) => ({ snackbar: { ...s.snackbar, show: false } }));
  },

  confirm: (text, title = "確認", options = {}) =>
    new Promise<boolean>((resolve) => {
      set({
        dialog: {
          show: true,
          title,
          text,
          variant: options.variant ?? "primary",
          cancelLabel: options.cancelLabel ?? "キャンセル",
          confirmLabel: options.confirmLabel ?? "OK",
          resolve,
        },
      });
    }),

  answer: (ok) => {
    get().dialog.resolve?.(ok);
    set({ dialog: DEFAULT_DIALOG });
  },
}));
