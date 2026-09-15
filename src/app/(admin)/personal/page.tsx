"use client";

// src/app/(admin)/personal/page.tsx
// 旧 views/StudentEdition.vue を移植
//
// 【YouTube連携について】
// バックエンドのYouTube連携APIがまだ実装中のため、ここではトグルとアイコン付き
// ボタンの見た目だけを残し、実際の連携状態取得(/youtube/status)・OAuth開始・
// 解除(/youtube/unlink)などのAPI呼び出しは行わない。ボタン押下時は旧DELAY_APOLOGY
// と同じ「未実装」トーストを表示するだけの仮実装とする。バックエンド実装後、
// onYoutubeButtonClick等を元のAPI連携ロジックに差し替えること。
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
import { useFeedbackStore } from "@/stores/feedback";
import {
  DELAY_APOLOGY,
  EMPTY_STRING,
  extractErrorMessage,
} from "@/lib/constants";

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

  // ===== YouTube連携(バックエンド未実装のため見た目だけ) =====
  const [youtubeEnabled, setYoutubeEnabled] = useState(false);

  const onYoutubeButtonClick = () => {
    feedback.toast(DELAY_APOLOGY);
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
            <div className="form-label">アカウント</div>
            <input
              value={form.loginAccount}
              onChange={(e) =>
                setForm((f) => ({ ...f, loginAccount: e.target.value }))
              }
              type="text"
              placeholder="アカウントを入力してください"
              className={`w-full rounded-md border px-3 py-1.5 text-sm outline-none ${errors.loginAccount ? "border-red-400" : "border-gray-300 focus:border-warning"}`}
              onBlur={checkAccount}
            />
            {errors.loginAccount && (
              <p className="mt-1 text-xs text-red-600">{errors.loginAccount}</p>
            )}
          </div>

          <div className="mb-5">
            <div className="form-label">名称</div>
            <input
              value={form.username}
              onChange={(e) =>
                setForm((f) => ({ ...f, username: e.target.value }))
              }
              type="text"
              placeholder="名称を入力してください"
              className={`w-full rounded-md border px-3 py-1.5 text-sm outline-none ${errors.username ? "border-red-400" : "border-gray-300 focus:border-warning"}`}
            />
            {errors.username && (
              <p className="mt-1 text-xs text-red-600">{errors.username}</p>
            )}
          </div>

          <div className="mb-5 flex gap-4">
            <div className="flex-1">
              <div className="form-label">パスワード</div>
              <div className="relative">
                <input
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  type={showPassword ? "text" : "password"}
                  placeholder="パスワードを入力してください"
                  className={`w-full rounded-md border px-3 py-1.5 pr-9 text-sm outline-none ${errors.password ? "border-red-400" : "border-gray-300 focus:border-warning"}`}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password}</p>
              )}
            </div>

            <div className="flex-1">
              <div className="form-label">メール</div>
              <input
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
                type="text"
                placeholder="メールを入力してください"
                className={`w-full rounded-md border px-3 py-1.5 text-sm outline-none ${errors.email ? "border-red-400" : "border-gray-300 focus:border-warning"}`}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email}</p>
              )}
            </div>
          </div>

          <div className="link-row mb-2 flex items-start gap-4">
            <div className="date-field min-w-0 flex-1">
              <div className="form-label">生年月日</div>
              <input
                value={form.dateOfBirth}
                onChange={(e) =>
                  setForm((f) => ({ ...f, dateOfBirth: e.target.value }))
                }
                type="date"
                className={`w-full rounded-md border px-3 py-1.5 text-sm outline-none ${errors.dateOfBirth ? "border-red-400" : "border-gray-300 focus:border-warning"}`}
              />
              {errors.dateOfBirth && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.dateOfBirth}
                </p>
              )}
            </div>
            <div className="youtube-field w-[130px] shrink-0">
              <div className="form-label">YouTube連携</div>
              <label className="toggle-switch">
                <input
                  checked={youtubeEnabled}
                  onChange={(e) => setYoutubeEnabled(e.target.checked)}
                  type="checkbox"
                  className="peer sr-only"
                />
                <span className="toggle-track is-warning">
                  <span className="toggle-thumb" />
                </span>
              </label>
            </div>
          </div>

          {youtubeEnabled && (
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                title="YouTubeと連携(未実装)"
                onClick={onYoutubeButtonClick}
              >
                <SquarePlay className="h-4 w-4 text-red-600" />
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 pb-4">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
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
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md bg-gray-500 px-4 py-1.5 text-sm font-medium text-white"
            onClick={onRestore}
          >
            <Trash2 className="h-4 w-4" /> 廃棄
          </button>
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
