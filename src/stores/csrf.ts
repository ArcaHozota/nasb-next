// src/stores/csrf.ts
import { create } from "zustand";
import api from "@/api/axios";
import { EMPTY_STRING } from "@/lib/constants";

type CsrfToken = {
  token: string;
  headerName: string;
  parameterName: string;
} | null;

type CsrfState = {
  csrf: CsrfToken;
  headerName: () => string;
  tokenValue: () => string;
  fetchCsrf: () => Promise<void>;
};

// 旧 Pinia版と同じく、axios.tsのインターセプター(モジュールスコープ、
// コンポーネント外)からも useCsrfStore.getState() で直接読み書きできる。
export const useCsrfStore = create<CsrfState>((set, get) => ({
  csrf: null,
  headerName: () => get().csrf?.headerName ?? "X-CSRF-TOKEN",
  tokenValue: () => get().csrf?.token ?? EMPTY_STRING,
  fetchCsrf: async () => {
    const { data } = await api.get<CsrfToken>("/common/csrf");
    set({ csrf: data });
  },
}));
