"use client";

// src/app/login/page.tsx
// 旧 views/LoginView.vue を移植
import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useAuthStore } from "@/stores/auth";
import { EMPTY_STRING } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldLabel } from "@/components/ui/field";
import PageBackground from "@/components/PageBackground";
import PcOnly from "@/components/PcOnly";
import "@fontsource/noto-sans-jp/800.css";
import "@fontsource/noto-sans-jp/900.css";
import styles from "./login.module.css";

const MIN_LOGIN_DURATION_MS = 3300;

export default function LoginView() {
  return (
    <PcOnly>
      <LoginForm />
    </PcOnly>
  );
}

function LoginForm() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

  const [username, setUsername] = useState(EMPTY_STRING);
  const [password, setPassword] = useState(EMPTY_STRING);
  const [error, setError] = useState(EMPTY_STRING);
  const [loading, setLoading] = useState(false);

  // <form> の送信にすることで、Enter での送信(日本語変換中の Enter は除く)や
  // パスワードマネージャーの保存・自動入力をブラウザに任せる
  const onLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return; // Enter の連打などによる二重送信を防ぐ
    setError(EMPTY_STRING);
    setLoading(true);
    try {
      const [result] = await Promise.allSettled([
        login(username, password),
        new Promise<void>((resolve) =>
          setTimeout(resolve, MIN_LOGIN_DURATION_MS),
        ),
      ]);
      if (result.status === "rejected") throw result.reason;
      router.push("/mainmenu");
    } catch (e: unknown) {
      // 認証失敗はサーバーが 401 を返す。それ以外(通信エラー・500 など)は
      // パスワードの誤りと区別して伝える
      setError(
        axios.isAxiosError(e) && e.response?.status === 401
          ? "ユーザー名またはパスワードが正しくありません。"
          : "ログインできませんでした。時間をおいて再度お試しください。",
      );
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <PageBackground src="/assets/login-bg.webp" />

      <Card className={styles.card} data-login-card data-loading={loading}>
        <p className="sr-only" role="status">
          {loading ? "ログイン中です" : ""}
        </p>
        <CardContent className={styles.content}>
          <form onSubmit={onLogin} aria-label="ログイン" aria-busy={loading}>
            <fieldset
              className={styles.fields}
              disabled={loading}
              aria-hidden={loading}
            >
              <h1 className={styles.title}>NASB1995</h1>

              <Field className={styles.field}>
                <FieldLabel htmlFor="login-username" className={styles.label}>
                  ユーザー名
                </FieldLabel>
                <Input
                  id="login-username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  type="text"
                  className={styles.input}
                />
              </Field>

              <Field className={styles.field}>
                <FieldLabel htmlFor="login-password" className={styles.label}>
                  パスワード
                </FieldLabel>
                <Input
                  id="login-password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className={styles.input}
                />
              </Field>

              {error && (
                <Alert variant="destructive" className={styles.error}>
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription className={styles.errorText}>
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </fieldset>

            <Button
              className={styles.submit}
              type="submit"
              disabled={loading}
              aria-label={loading ? "ログイン中" : "ログイン"}
            >
              {loading ? (
                <span className={styles.progress} aria-hidden="true">
                  <Spinner
                    className="size-[18px]"
                    viewBox="1.875 1.875 20.25 20.25"
                    strokeWidth={2.25}
                  />
                </span>
              ) : (
                "ログイン"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
