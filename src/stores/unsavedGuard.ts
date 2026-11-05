// src/stores/unsavedGuard.ts
// 「未保存の編集内容があるか」を画面をまたいで共有するストア。
//  - dirty : 編集内容がある間 true(useUnsavedChanges が更新する)
//  - bypass: true の間は離脱の警告を出さない(別端末ログインによる強制ログアウトなど、
//            ユーザー操作ではないページ遷移の直前に立てる)
import { create } from "zustand";

type UnsavedGuardState = {
  dirty: boolean;
  bypass: boolean;
  setDirty: (dirty: boolean) => void;
  setBypass: () => void;
};

export const useUnsavedGuard = create<UnsavedGuardState>((set) => ({
  dirty: false,
  bypass: false,
  setDirty: (dirty) => set({ dirty }),
  setBypass: () => set({ bypass: true }),
}));
