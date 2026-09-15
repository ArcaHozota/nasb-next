"use client";

// src/app/login/page.tsx
// 旧 views/LoginView.vue を移植
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { EMPTY_STRING } from "@/lib/constants";

export default function LoginView() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState(EMPTY_STRING);
  const [password, setPassword] = useState(EMPTY_STRING);
  const [error, setError] = useState(EMPTY_STRING);
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setError(EMPTY_STRING);
    setLoading(true);
    try {
      await login(username, password);
      router.push("/mainmenu");
    } catch {
      // SecurityConfig の failureHandler が 401 を返す
      setError("ユーザー名またはパスワードが正しくありません。");
    } finally {
      setLoading(false);
    }
  };

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onLogin();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/mainmenu-bg6.webp"
        alt=""
        className="fixed inset-0 -z-10 h-full w-full object-cover"
      />

      <div className="w-[360px] rounded-[18px] border border-white/45 bg-white/25 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="p-4">
          <h1 className="mb-6 text-center text-2xl font-bold tracking-wide text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.4)]">
            NASB1995
          </h1>

          <label className="mb-1 block text-sm text-white/90">ユーザー名</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            type="text"
            className="mb-4 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary"
          />

          <label className="mb-1 block text-sm text-white/90">パスワード</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            className="mb-4 w-full rounded-md border border-white/60 bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary"
            onKeyDown={onEnter}
          />

          {error && (
            <p className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="button"
            className="w-full rounded-md bg-primary py-2 text-sm font-medium text-white disabled:opacity-60"
            disabled={loading}
            onClick={onLogin}
          >
            {loading ? (
              <LoaderCircle className="inline-block h-4 w-4 animate-spin" />
            ) : (
              <span>ログイン</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
