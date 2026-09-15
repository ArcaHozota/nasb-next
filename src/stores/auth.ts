// src/stores/auth.ts
import { create } from "zustand";
import axios from "axios";
import api from "@/api/axios";
import { EMPTY_STRING } from "@/lib/constants";
import { useCsrfStore } from "@/stores/csrf";

type User = {
  id: string;
  username: string;
  // 【要確認】Scala側 CommonRoutes.scala の "me" ハンドラは現状
  //   Map("id" -> session.userId.toString, "username" -> session.userName)
  // しか返しておらず、authorities/roles は含まれていない。
  // そのため roles は常に空配列になり、hasRole(...) は常に false を返す。
  roles: string[];
} | null;

type AuthState = {
  user: User;
  isLoggedIn: boolean;
  username: string;
  userId: string;
  hasRole: (role: string) => boolean;
  fetchMe: () => Promise<User>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  // main.tsx の auth:unauthorized ハンドラ相当
  clearUser: () => void;
};

const deriveFromUser = (user: User) => ({
  user,
  isLoggedIn: !!user,
  username: user?.username ?? EMPTY_STRING,
  // 元の実装に合わせ、未ログイン時は null ではなく EMPTY_STRING を返す。
  userId: user?.id ?? EMPTY_STRING,
});

export const useAuthStore = create<AuthState>((set, get) => ({
  ...deriveFromUser(null),

  hasRole: (role: string): boolean =>
    get().user?.roles?.includes(role) ?? false,

  fetchMe: async (): Promise<User> => {
    try {
      // Scala側は { id: string, username: string } を返す(roles無し)。
      const { data } = await api.get<{ id: string; username: string }>(
        "/common/me",
      );
      const fetched: User = {
        id: data.id,
        username: data.username,
        roles: [],
      };
      set(deriveFromUser(fetched));
      return fetched;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        set(deriveFromUser(null));
        return null;
      }
      throw err;
    }
  },

  logout: async (): Promise<void> => {
    await api.post("/logout");
    set(deriveFromUser(null));
    await useCsrfStore.getState().fetchCsrf(); // 新しいトークンを取得しておく
  },

  login: async (username: string, password: string): Promise<void> => {
    const body = new URLSearchParams({ username, password });
    const { data } = await api.post<{ message?: string }>("/login", body);
    if (data?.message && typeof window !== "undefined") {
      localStorage.setItem("redirectMessage", data.message);
    }
    await get().fetchMe();
    // セッションローテーションでCSRFトークンが変わっている可能性があるため再取得
    await useCsrfStore.getState().fetchCsrf();
  },

  clearUser: () => set(deriveFromUser(null)),
}));
