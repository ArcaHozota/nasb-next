"use client";

// src/app/(admin)/personal/page.tsx
// 旧 views/StudentEdition.vue を移植
//
// 【YouTube連携について】
// バックエンドのYouTube連携API(/youtube/status, /youtube/authorize-url,
// /youtube/callback, /youtube/unlink)実装済み。トグルは連携状態を反映し、
// ONへの切り替えでGoogle同意画面へ画面遷移、OFFへの切り替えで連携解除を行う。
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  IdCard,
  Eye,
  EyeOff,
  Zap,
  Trash2,
  LoaderCircle,
  SquarePlay,
} from "lucide-react";
import api from "@/api/axios";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import { Button } from "@/components/ui/button";

// フォーカス時の枠・リング色(オレンジ)。エラー時(aria-invalid)は赤枠のままにする。
const FOCUS_WARNING =
  "not-aria-invalid:focus-visible:border-warning not-aria-invalid:focus-visible:ring-warning/30";

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

const required = (v: string) =>
  !!v && v.trim() !== EMPTY_STRING
    ? EMPTY_STRING
    : "上記の入力ボックスを空になってはいけません。";

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

  const onYoutubeConnect = () => {
    // 連携開始はバックエンドが直接Google同意画面へリダイレクトするため、
    // fetch/XHRではなく普通の画面遷移にする。
    window.location.href = "/api/youtube/authorize-url";
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
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/mainmenu-bg4.webp"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <nav className="mb-2 text-sm font-semibold text-[#fffff0]">
        <Link href="/mainmenu" className="hover:underline">
          メインメニュー
        </Link>
        <span className="mx-1">/</span>
        <span>データリスト</span>
        <span className="mx-1">/</span>
        <span>データ更新</span>
      </nav>

      <div className="studentedition-card glass-panel glass-panel--gold relative overflow-hidden rounded-[18px]">
        <div
          className="flex items-center px-4 py-3 text-white"
          style={{ backgroundColor: "#ff883e" }}
        >
          <IdCard className="mr-2 h-5 w-5" />
          <h1 className="text-lg font-semibold">ユーザー情報更新</h1>
        </div>

        <div className="p-6 pt-5">
          <div className="mb-5">
            <Label htmlFor="personal-account" className="form-label mb-1.5">
              アカウント
            </Label>
            <Input
              id="personal-account"
              value={form.loginAccount}
              onChange={(e) =>
                setForm((f) => ({ ...f, loginAccount: e.target.value }))
              }
              type="text"
              placeholder="アカウントを入力してください"
              aria-invalid={!!errors.loginAccount}
              className={FOCUS_WARNING}
              onBlur={checkAccount}
            />
            {errors.loginAccount && (
              <p className="mt-1 text-xs text-red-600">{errors.loginAccount}</p>
            )}
          </div>

          <div className="mb-5">
            <Label htmlFor="personal-username" className="form-label mb-1.5">
              名称
            </Label>
            <Input
              id="personal-username"
              value={form.username}
              onChange={(e) =>
                setForm((f) => ({ ...f, username: e.target.value }))
              }
              type="text"
              placeholder="名称を入力してください"
              aria-invalid={!!errors.username}
              className={FOCUS_WARNING}
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-600">{errors.username}</p>
            )}
          </div>

          <div className="mb-5 flex gap-4">
            <div className="flex-1">
              <Label htmlFor="personal-password" className="form-label mb-1.5">
                パスワード
              </Label>
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
                  className={`pr-9 ${FOCUS_WARNING}`}
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
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password}</p>
              )}
            </div>

            <div className="flex-1">
              <Label htmlFor="personal-email" className="form-label mb-1.5">
                メール
              </Label>
              <Input
                id="personal-email"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                type="text"
                placeholder="メールを入力してください"
                aria-invalid={!!errors.email}
                className={FOCUS_WARNING}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email}</p>
              )}
            </div>
          </div>

          <div className="link-row mb-2 flex items-start gap-4">
            <div className="date-field min-w-0 flex-1">
              <Label htmlFor="personal-dob" className="form-label mb-1.5">
                生年月日
              </Label>
              <Input
                id="personal-dob"
                value={form.dateOfBirth}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
                }
                type="date"
                aria-invalid={!!errors.dateOfBirth}
                className={FOCUS_WARNING}
              />
              {errors.dateOfBirth && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.dateOfBirth}
                </p>
              )}
            </div>
            <div className="youtube-field w-32.5 shrink-0">
              <Label htmlFor="personal-youtube" className="form-label mb-1.5">
                YouTube連携
              </Label>
              {/* 連携処理中はつまみを隠してスピナーを表示する(従来のトグルと同じ見た目) */}
              <span className="relative inline-flex">
                <Switch
                  id="personal-youtube"
                  size="lg"
                  title="ONで連携ボタンが押せるようになります"
                  checked={youtubeToggleOn}
                  onCheckedChange={onYoutubeToggle}
                  disabled={youtubeBusy}
                  className={cn(
                    "data-[state=checked]:bg-warning",
                    youtubeBusy &&
                      "disabled:opacity-100 **:data-[slot=switch-thumb]:opacity-0",
                  )}
                />
                {youtubeBusy && (
                  <LoaderCircle className="pointer-events-none absolute inset-0 m-auto h-3 w-3 animate-spin" />
                )}
              </span>
            </div>
          </div>

          <div className="mb-2 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <Button
                variant="outline"
                className="w-full justify-start bg-transparent text-gray-700 hover:bg-white/60"
                type="button"
                title={youtubeLinked ? "連携済みです" : "YouTubeと連携"}
                disabled={!youtubeToggleOn || youtubeLinked || youtubeBusy}
                onClick={onYoutubeConnect}
              >
                <SquarePlay
                  className={`h-4 w-4 ${youtubeLinked ? "text-gray-400" : "text-red-600"}`}
                />
                <span>{youtubeLinked ? "連携済み" : "YouTubeと連携"}</span>
              </Button>
            </div>
            <div className="w-32.5 shrink-0" aria-hidden="true"></div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 pb-4">
          <Button
            
            type="button"
            disabled={saving}
            onClick={onUpdate}
          >
            {saving ? (
              <LoaderCircle className="inline-block h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center justify-center gap-1">
                <Zap className="h-4 w-4" /> 更新
              </span>
            )}
          </Button>
          <Button
            variant="neutral"
            type="button"
            onClick={onRestore}
          >
            <Trash2 className="h-4 w-4" /> 廃棄
          </Button>
        </div>
      </div>
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
