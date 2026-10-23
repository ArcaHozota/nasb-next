"use client";

// src/app/(admin)/personal/page.tsx
// 旧 views/StudentEdition.vue を移植
//
// 【YouTube連携について】
// バックエンドのYouTube連携API(/youtube/status, /youtube/authorize-url,
// /youtube/callback, /youtube/unlink)実装済み。トグルは連携状態を反映し、
// ONへの切り替えでGoogle同意画面へ画面遷移、OFFへの切り替えで連携解除を行う。
//
// 【レイアウトについて】
// 背景画像はそのまま。カードを中央寄せ・幅制限(max-w-2xl)にし、
// FieldSet で「基本情報／セキュリティ／外部連携」の3セクションに分割。

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { IdCard, Eye, EyeOff, Zap, Trash2, SquarePlay } from "lucide-react";
import api from "@/api/axios";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import { required } from "@/lib/form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import Hint from "@/components/Hint";

// フォーカス時の枠・リング色(オレンジ)。エラー時(aria-invalid)は赤枠のままにする。
const FOCUS_WARNING =
  "not-aria-invalid:focus-visible:border-warning not-aria-invalid:focus-visible:ring-warning/30";

// 背景画像の上でも読みやすいよう、入力欄は白ベタにする。
const INPUT_CLASS = `bg-white ${FOCUS_WARNING}`;

type StudentForm = {
  id: string | null;
  loginAccount: string;
  username: string;
  password: string;
  dateOfBirth: string;
  email: string;
};

const emptyForm: StudentForm = {
  id: null,
  loginAccount: EMPTY_STRING,
  username: EMPTY_STRING,
  password: EMPTY_STRING,
  dateOfBirth: EMPTY_STRING,
  email: EMPTY_STRING,
};

const toDateInputValue = (src: string) => {
  if (!src) return EMPTY_STRING;
  if (/^\d{4}-\d{2}-\d{2}$/.test(src)) return src;
  const d = new Date(src);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
};

function StudentEditionInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const feedback = useFeedbackStore();
  const userId = searchParams.get("userId") || null;
  const [form, setForm] = useState<StudentForm>({ ...emptyForm, id: userId });
  const [errors, setErrors] = useState({
    loginAccount: EMPTY_STRING,
    username: EMPTY_STRING,
    password: EMPTY_STRING,
    dateOfBirth: EMPTY_STRING,
    email: EMPTY_STRING,
  });
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // ===== YouTube連携 =====
  // トグル＝連携ボタンの活性/非活性スイッチ。ONで初めてボタンが押せるようになり、
  // OFFに戻すとその場で連携解除する。連携済みかどうかは、ボタンのアイコン色と
  // ラベル（「連携済み」）で表す。
  const [youtubeToggleOn, setYoutubeToggleOn] = useState(false);
  const [youtubeLinked, setYoutubeLinked] = useState(false);
  const [youtubeBusy, setYoutubeBusy] = useState(false);

  const fetchYoutubeStatus = async () => {
    try {
      const { data } = await api.get<{ linked: boolean }>("/youtube/status");
      setYoutubeLinked(!!data.linked);
      setYoutubeToggleOn(!!data.linked);
    } catch {
      // 未ログイン等はAdminLayoutの認証チェックに任せ、ここでは静かに無視する
    }
  };

  const onYoutubeToggle = async (checked: boolean) => {
    setYoutubeToggleOn(checked);
    if (checked) {
      // ONにしただけではまだ何もしない。連携ボタンが活性化するだけ。
      return;
    }
    // OFFにした時点で、連携済みなら即座に解除する。
    if (!youtubeLinked) return;
    setYoutubeBusy(true);
    try {
      await api.post("/youtube/unlink");
      setYoutubeLinked(false);
      feedback.toast("YouTube連携を解除しました");
    } catch (e: unknown) {
      feedback.toast(extractErrorMessage(e, "連携解除に失敗しました"));
      // 解除に失敗したので、実態に合わせてトグルもONへ戻す
      setYoutubeToggleOn(true);
    } finally {
      setYoutubeBusy(false);
    }
  };

  // 連携ボタンのツールチップ。押せない時は「なぜ押せないか」を伝える
  const youtubeHint = youtubeLinked
    ? "連携済みです"
    : youtubeToggleOn
      ? "YouTubeアカウントと連携します"
      : "「YouTube連携」をONにすると押せます";

  const onYoutubeConnect = () => {
    // 連携開始はバックエンドが直接Google同意画面へリダイレクトするため、
    // fetch/XHRではなく普通の画面遷移にする。
    router.push("/api/youtube/authorize-url");
  };

  const fetchInitial = async (id: string) => {
    try {
      const { data } = await api.get(`/students/${id}`);
      setForm((f) => ({
        ...f,
        loginAccount: data.loginAccount,
        username: data.username,
        password: data.password,
        dateOfBirth: toDateInputValue(data.dateOfBirth),
        email: data.email,
      }));
    } catch (e: unknown) {
      feedback.toast(extractErrorMessage(e, "データの取得に失敗しました"));
    }
  };

  useEffect(() => {
    if (form.id) fetchInitial(form.id);
    if (!form.id) return;
    fetchYoutubeStatus();
    const youtubeStatus = searchParams.get("youtube");
    if (youtubeStatus) {
      const messages: Record<string, string> = {
        connected: "YouTubeと連携しました",
        error: "YouTube連携に失敗しました",
        invalid_state: "不正なリクエストです。もう一度お試しください。",
        unauthorized: "ログインが必要です",
      };
      feedback.toast(
        messages[youtubeStatus] ?? "YouTube連携の処理が完了しました",
      );
      // ?youtube=... だけを消してURLをきれいにする（再読み込みで再表示させない）
      router.replace(`/personal?userId=${form.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAccount = async (e: React.FocusEvent<HTMLInputElement>) => {
    setErrors((er) => ({ ...er, loginAccount: EMPTY_STRING }));
    const name = e.target.value.trim();
    if (!name) return;
    try {
      await api.get("/students/duplicate-check", {
        params: { id: form.id ?? EMPTY_STRING, loginAccount: name },
      });
    } catch (e: unknown) {
      setErrors((er) => ({
        ...er,
        loginAccount: extractErrorMessage(
          e,
          "このアカウントは既に使われています。",
        ),
      }));
    }
  };

  const onUpdate = async () => {
    const nextErrors = {
      loginAccount: required(form.loginAccount) || errors.loginAccount,
      username: required(form.username),
      password: required(form.password),
      dateOfBirth: required(form.dateOfBirth),
      email: required(form.email),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      feedback.toast("入力情報不正");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/students/${form.id}`, {
        id: form.id,
        loginAccount: form.loginAccount.trim(),
        username: form.username.trim(),
        password: form.password,
        email: form.email,
        dateOfBirth: form.dateOfBirth,
      });
      feedback.toast(typeof data === "string" ? data : "更新しました");
      router.push("/mainmenu");
    } catch (e: unknown) {
      feedback.toast(extractErrorMessage(e, "更新に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const onRestore = async () => {
    setErrors({
      loginAccount: EMPTY_STRING,
      username: EMPTY_STRING,
      password: EMPTY_STRING,
      dateOfBirth: EMPTY_STRING,
      email: EMPTY_STRING,
    });
    if (!form.id) {
      setForm({ ...emptyForm });
      return;
    }
    await fetchInitial(form.id);
  };

  return (
    <div className="noto-sans relative min-h-full bg-cover bg-fixed bg-center">
      {/* 背景画像(変更なし) */}
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/mainmenu-bg4.webp"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      {/* パンくずリスト(旧表記「データリスト / データ更新」は賛美歌画面からの流用だったため修正) */}
      <Breadcrumb className="mx-auto mb-2 max-w-2xl">
        <BreadcrumbList className="font-semibold text-[#fffff0] [text-shadow:0_1px_3px_rgba(0,0,0,0.45)]">
          <BreadcrumbItem>
            <BreadcrumbLink
              asChild
              className="text-[#fffff0] hover:text-white hover:underline"
            >
              <Link href="/mainmenu">メインメニュー</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-semibold text-[#fffff0]">
              ユーザー情報
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/*
        glass-panel の背景を、末尾 ! (Tailwind v4 の important) で白85%に上書きして
        文字と入力欄を読みやすくする。背景画像は backdrop-blur 越しにうっすら見える。
        ※もし glass-panel 側の指定が優先されない場合は、この2クラスを外して調整すること。
      */}
      <Card className="studentedition-card glass-panel glass-panel--gold relative mx-auto max-w-2xl gap-0 overflow-hidden rounded-[18px] bg-white/85! py-0 backdrop-blur-md">
        <CardHeader
          className="flex items-center gap-0 px-4 py-3 text-white"
          style={{ backgroundColor: "#ff883e" }}
        >
          <IdCard className="mr-2 h-5 w-5" />
          <CardTitle
            role="heading"
            aria-level={1}
            className="text-lg leading-normal"
          >
            ユーザー情報更新
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <FieldGroup className="gap-6">
            {/* ===== 基本情報 ===== */}
            <FieldSet>
              <FieldLegend variant="label" className="text-base font-bold">
                基本情報
              </FieldLegend>
              <FieldGroup className="gap-5">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field className="gap-1.5">
                    <FieldLabel
                      htmlFor="personal-account"
                      className="form-label"
                    >
                      アカウント
                    </FieldLabel>
                    <Input
                      id="personal-account"
                      value={form.loginAccount}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, loginAccount: e.target.value }))
                      }
                      type="text"
                      placeholder="アカウントを入力してください"
                      aria-invalid={!!errors.loginAccount}
                      aria-describedby={
                        errors.loginAccount
                          ? "personal-account-error"
                          : undefined
                      }
                      className={INPUT_CLASS}
                      onBlur={checkAccount}
                    />
                    <FieldError id="personal-account-error" className="text-xs">
                      {errors.loginAccount}
                    </FieldError>
                  </Field>

                  <Field className="gap-1.5">
                    <FieldLabel
                      htmlFor="personal-username"
                      className="form-label"
                    >
                      名称
                    </FieldLabel>
                    <Input
                      id="personal-username"
                      value={form.username}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, username: e.target.value }))
                      }
                      type="text"
                      placeholder="名称を入力してください"
                      aria-invalid={!!errors.username}
                      aria-describedby={
                        errors.username ? "personal-username-error" : undefined
                      }
                      className={INPUT_CLASS}
                    />
                    <FieldError
                      id="personal-username-error"
                      className="text-xs"
                    >
                      {errors.username}
                    </FieldError>
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="personal-email" className="form-label">
                      メール
                    </FieldLabel>
                    <Input
                      id="personal-email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, email: e.target.value }))
                      }
                      type="text"
                      placeholder="メールを入力してください"
                      aria-invalid={!!errors.email}
                      aria-describedby={
                        errors.email ? "personal-email-error" : undefined
                      }
                      className={INPUT_CLASS}
                    />
                    <FieldError id="personal-email-error" className="text-xs">
                      {errors.email}
                    </FieldError>
                  </Field>

                  <Field className="date-field gap-1.5">
                    <FieldLabel htmlFor="personal-dob" className="form-label">
                      生年月日
                    </FieldLabel>
                    <Input
                      id="personal-dob"
                      value={form.dateOfBirth}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
                      }
                      type="date"
                      aria-invalid={!!errors.dateOfBirth}
                      aria-describedby={
                        errors.dateOfBirth ? "personal-dob-error" : undefined
                      }
                      className={INPUT_CLASS}
                    />
                    <FieldError id="personal-dob-error" className="text-xs">
                      {errors.dateOfBirth}
                    </FieldError>
                  </Field>
                </div>
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />

            {/* ===== セキュリティ ===== */}
            <FieldSet>
              <FieldLegend variant="label" className="text-base font-bold">
                セキュリティ
              </FieldLegend>
              <FieldGroup>
                <Field className="gap-1.5">
                  <FieldLabel
                    htmlFor="personal-password"
                    className="form-label"
                  >
                    パスワード
                  </FieldLabel>
                  <div className="relative">
                    <Input
                      id="personal-password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      type={showPassword ? "text" : "password"}
                      placeholder="パスワードを入力してください"
                      aria-invalid={!!errors.password}
                      aria-describedby={
                        errors.password ? "personal-password-error" : undefined
                      }
                      className={`pr-9 ${INPUT_CLASS}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:bg-transparent hover:text-gray-700"
                      type="button"
                      aria-label={
                        showPassword ? "パスワードを隠す" : "パスワードを表示"
                      }
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <FieldError id="personal-password-error" className="text-xs">
                    {errors.password}
                  </FieldError>
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />

            {/* ===== 外部連携 ===== */}
            <FieldSet>
              <FieldLegend variant="label" className="text-base font-bold">
                外部連携
              </FieldLegend>
              <div className="flex flex-col gap-3 rounded-lg border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                {/* 左: アイコン・タイトル・状態 */}
                <div className="flex min-w-0 items-center gap-3">
                  <SquarePlay
                    className={cn(
                      "h-8 w-8 shrink-0",
                      youtubeLinked ? "text-gray-400" : "text-red-600",
                    )}
                  />
                  <div className="min-w-0">
                    <FieldLabel
                      htmlFor="personal-youtube"
                      className="form-label"
                    >
                      YouTube連携
                    </FieldLabel>
                    <FieldDescription className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                          youtubeLinked
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600",
                        )}
                      >
                        {youtubeLinked ? "連携済み" : "未連携"}
                      </span>
                      <span className="text-xs">
                        ONにすると連携ボタンが押せます
                      </span>
                    </FieldDescription>
                  </div>
                </div>

                {/* 右: トグル + 連携ボタン */}
                <div className="flex shrink-0 items-center gap-3">
                  {/* 連携処理中はつまみを隠してスピナーを表示する(従来のトグルと同じ見た目) */}
                  <span className="relative inline-flex">
                    {/*
                      Hint(Tooltip のトリガー)は子要素に data-state="closed" 等を付ける。
                      Switch(Radix)に直接付くと、Switch 自身の data-state="checked/unchecked" を
                      上書きしてしまい、バーの色(data-[state=checked]:bg-…)が当たらなくなる。
                      そのため span を挟み、トリガーの属性を Switch ではなく span に付ける。
                    */}
                    <Hint label="ONで連携ボタンが押せるようになります">
                      <span className="inline-flex">
                        <Switch
                          id="personal-youtube"
                          size="lg"
                          checked={youtubeToggleOn}
                          onCheckedChange={onYoutubeToggle}
                          disabled={youtubeBusy}
                          className={cn(
                            "data-[state=checked]:bg-warning",
                            youtubeBusy &&
                              "disabled:opacity-100 **:data-[slot=switch-thumb]:opacity-0",
                          )}
                        />
                      </span>
                    </Hint>
                    {youtubeBusy && (
                      <Spinner className="pointer-events-none absolute inset-0 m-auto size-3" />
                    )}
                  </span>

                  <Hint label={youtubeHint} wrapDisabled>
                    <Button
                      variant="outline"
                      className="bg-transparent text-gray-700 hover:bg-white/60"
                      type="button"
                      disabled={
                        !youtubeToggleOn || youtubeLinked || youtubeBusy
                      }
                      onClick={onYoutubeConnect}
                    >
                      <SquarePlay
                        className={`h-4 w-4 ${youtubeLinked ? "text-gray-400" : "text-red-600"}`}
                      />
                      <span>
                        {youtubeLinked ? "連携済み" : "YouTubeと連携"}
                      </span>
                    </Button>
                  </Hint>
                </div>
              </div>
            </FieldSet>
          </FieldGroup>
        </CardContent>

        <CardFooter className="flex justify-end gap-2 border-t bg-white/60 px-6 py-4">
          <Button type="button" disabled={saving} onClick={onUpdate}>
            {saving ? (
              <Spinner />
            ) : (
              <span className="flex items-center justify-center gap-1">
                <Zap className="h-4 w-4" /> 更新
              </span>
            )}
          </Button>
          <Button variant="neutral" type="button" onClick={onRestore}>
            <Trash2 className="h-4 w-4" /> 廃棄
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function StudentEdition() {
  return (
    <Suspense fallback={null}>
      <StudentEditionInner />
    </Suspense>
  );
}
