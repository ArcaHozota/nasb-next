"use client";

// src/app/login/page.tsx
// 旧 views/LoginView.vue を移植
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth";
import { EMPTY_STRING } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldLabel } from "@/components/ui/field";

// ガラス風カードの上に置くため半透明の白背景にする
const LOGIN_INPUT =
  "h-10 border-white/60 bg-white/80 focus-visible:border-primary focus-visible:ring-primary/30";

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

      <div className="w-90 rounded-[18px] border border-white/45 bg-white/25 p-2 shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.8)] backdrop-blur-2xl backdrop-saturate-150">
        <div className="p-4">
          <h1 className="mb-6 text-center text-2xl font-bold tracking-wide text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.4)]">
            NASB1995
          </h1>

          <Field className="mb-4 gap-1.5">
            <FieldLabel
              htmlFor="login-username"
              className="font-normal text-white/90"
            >
              ユーザー名
            </FieldLabel>
            <Input
              id="login-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              type="text"
              className={LOGIN_INPUT}
            />
          </Field>

          <Field className="mb-4 gap-1.5">
            <FieldLabel
              htmlFor="login-password"
              className="font-normal text-white/90"
            >
              パスワード
            </FieldLabel>
            <Input
              id="login-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className={LOGIN_INPUT}
              onKeyDown={onEnter}
            />
          </Field>

          {error && (
            <Alert
              variant="destructive"
              className="mb-4 border-red-300 bg-red-50/95 py-2"
            >
              <CircleAlert />
              <AlertDescription className="text-red-700">
                {error}
              </AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full font-bold"
            type="button"
            disabled={loading}
            onClick={onLogin}
          >
            {loading ? <Spinner /> : <span>ログイン</span>}
          </Button>
        </div>
      </div>
    </div>
  );
}
