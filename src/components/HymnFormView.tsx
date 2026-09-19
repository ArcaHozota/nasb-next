"use client";

// src/components/HymnFormView.tsx
// 旧 views/HymnForm.vue を移植(追加・編集の両方で使用)。
// app/(admin)/hymns/add と app/(admin)/hymns/edit の両ページから読み込む。
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, LoaderCircle, Trash2, Zap } from "lucide-react";
import api from "@/api/axios";
import { useFeedbackStore } from "@/stores/feedback";
import { useAuthStore } from "@/stores/auth";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import RippleButton from "./RippleButton";

type FormState = {
  id: string | null;
  nameJp: string;
  nameKr: string;
  link: string;
  lyric: string;
  classic: boolean;
  updatedTime: string;
  updatedUser: string;
};

const emptyForm: FormState = {
  id: null,
  nameJp: EMPTY_STRING,
  nameKr: EMPTY_STRING,
  link: EMPTY_STRING,
  lyric: EMPTY_STRING,
  classic: false,
  updatedTime: EMPTY_STRING,
  updatedUser: EMPTY_STRING,
};

const required = (v: string) =>
  !!v && v.trim() !== EMPTY_STRING
    ? EMPTY_STRING
    : "上記の入力ボックスを空になってはいけません。";

const asStr = (v: string | null) => v ?? EMPTY_STRING;

export default function HymnFormView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const feedback = useFeedbackStore();
  const auth = useAuthStore();

  const editId = searchParams.get("editId") || null;
  const isEdit = !!editId;
  const pageNum = asStr(searchParams.get("pageNum"));
  const pageSize = asStr(searchParams.get("pageSize"));
  const keyword = asStr(searchParams.get("keyword"));

  const [form, setForm] = useState<FormState>({ ...emptyForm, id: editId });
  const [errors, setErrors] = useState({
    nameJp: EMPTY_STRING,
    nameKr: EMPTY_STRING,
    link: EMPTY_STRING,
    lyric: EMPTY_STRING,
  });
  const [saving, setSaving] = useState(false);
  const [originalForm, setOriginalForm] = useState<FormState | null>(null);

  // 編集時: 既存データをロード
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const { data } = await api.get(`/hymns/${editId}`);
        setForm((f) => ({ ...f, ...data }));
        setOriginalForm((f) => ({ ...(f ?? emptyForm), ...data, id: editId }));
      } catch (e) {
        feedback.toast(extractErrorMessage(e, "データの取得に失敗しました"));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editId]);

  const checkNameJp = async (e: React.FocusEvent<HTMLInputElement>) => {
    const name = e.target.value.trim();
    setErrors((er) => ({ ...er, nameJp: EMPTY_STRING }));
    if (!name) return;
    try {
      await api.get("/hymns/duplicate-check-jp", {
        params: { id: form.id ?? EMPTY_STRING, nameJp: name },
      });
    } catch (e) {
      setErrors((er) => ({
        ...er,
        nameJp: extractErrorMessage(e, "この名称は既に使われています。"),
      }));
    }
  };

  const checkNameKr = async (e: React.FocusEvent<HTMLInputElement>) => {
    const name = e.target.value.trim().normalize("NFC");
    setErrors((er) => ({ ...er, nameKr: EMPTY_STRING }));
    if (!name) return;
    try {
      await api.get("/hymns/duplicate-check-kr", {
        params: { id: form.id ?? EMPTY_STRING, nameKr: name },
      });
    } catch (e) {
      setErrors((er) => ({
        ...er,
        nameKr: extractErrorMessage(e, "この名称は既に使われています。"),
      }));
    }
  };

  const buildListQuery = () => {
    const qs = new URLSearchParams();
    if (pageNum) qs.set("pageNum", pageNum);
    if (pageSize) qs.set("pageSize", pageSize);
    if (keyword) qs.set("keyword", keyword);
    return qs.toString();
  };

  const onSubmit = async () => {
    const nextErrors = {
      nameJp: required(form.nameJp) || errors.nameJp,
      nameKr: required(form.nameKr) || errors.nameKr,
      link: required(form.link),
      lyric: required(form.lyric),
    };
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      feedback.toast("入力情報不正");
      return;
    }
    const uid = auth.userId;
    if (!uid) {
      feedback.toast(
        "ログイン情報の取得に失敗しました。再度ログインしてください。",
      );
      return;
    }
    setSaving(true);
    const payload = {
      nameJp: form.nameJp.trim(),
      nameKr: form.nameKr.trim().normalize("NFC"),
      link: form.link,
      lyric: form.lyric,
      classic: form.classic,
      updatedUser: uid,
    };
    try {
      if (isEdit) {
        const updatePayload = {
          ...payload,
          id: form.id,
          updatedTime: form.updatedTime,
        };
        const { data } = await api.put(`/hymns/${form.id}`, updatePayload);
        feedback.toast(typeof data === "string" ? data : "更新しました");
        router.push(`/hymns?${buildListQuery()}`);
      } else {
        const { headers } = await api.post("/hymns", payload, {
          params: { pageSize: pageSize || 5 },
        });
        feedback.toast("追加済み");
        const qs = new URLSearchParams();
        qs.set("pageNum", headers["x-page-num"]); // axiosはヘッダー名を小文字化して格納する
        if (pageSize) qs.set("pageSize", pageSize);
        router.push(`/hymns?${qs.toString()}`);
      }
    } catch (e) {
      feedback.toast(extractErrorMessage(e, "保存に失敗しました"));
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    if (isEdit && originalForm) {
      setForm(originalForm);
    } else {
      setForm({ ...emptyForm, id: editId });
    }
    setErrors({
      nameJp: EMPTY_STRING,
      nameKr: EMPTY_STRING,
      link: EMPTY_STRING,
      lyric: EMPTY_STRING,
    });
  };

  const listQueryStr = useMemo(
    () => buildListQuery(),
    [pageNum, pageSize, keyword],
  );

  const focusClass = isEdit ? "focus:border-primary" : "focus:border-success";

  return (
    <div className="noto-sans relative min-h-full bg-cover bg-fixed bg-center">
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/mainmenu-bg5.webp"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      {/* パンくずリスト */}
      <nav className="mb-2 text-sm font-semibold text-[#fffff0]">
        <Link href="/mainmenu" className="hover:underline">
          メインメニュー
        </Link>
        <span className="mx-1">/</span>
        <Link href={`/hymns?${listQueryStr}`} className="hover:underline">
          データリスト
        </Link>
        <span className="mx-1">/</span>
        <span>{isEdit ? "データ更新" : "データ追加"}</span>
      </nav>

      <div
        className={`form-card glass-panel ${isEdit ? "glass-panel--burgundy" : "glass-panel--green"} relative overflow-hidden rounded-[18px]`}
      >
        <div
          className={`flex items-center px-4 py-3 text-white ${isEdit ? "bg-primary" : "bg-success"}`}
        >
          <LayoutGrid className="mr-2 h-5 w-5" />
          <h1 className="text-lg font-semibold">
            {isEdit ? "賛美歌情報更新" : "賛美歌情報追加"}
          </h1>
        </div>

        <div className="p-6 pt-5">
          <div className="mb-5">
            <div className="form-label">日本語名称</div>
            <input
              value={form.nameJp}
              onChange={(e) =>
                setForm((f) => ({ ...f, nameJp: e.target.value }))
              }
              type="text"
              placeholder="日本語名称を入力してください"
              className={`w-full rounded-md border px-3 py-1.5 text-sm outline-none ${errors.nameJp ? "border-red-400" : `border-gray-300 ${focusClass}`}`}
              onBlur={checkNameJp}
            />
            {errors.nameJp && (
              <p className="mt-1 text-xs text-red-600">{errors.nameJp}</p>
            )}
          </div>

          <div className="mb-5">
            <div className="form-label">韓国語名称</div>
            <input
              value={form.nameKr}
              onChange={(e) =>
                setForm((f) => ({ ...f, nameKr: e.target.value }))
              }
              type="text"
              placeholder="韓国語名称を入力してください"
              className={`w-full rounded-md border px-3 py-1.5 text-sm outline-none ${errors.nameKr ? "border-red-400" : `border-gray-300 ${focusClass}`}`}
              onBlur={checkNameKr}
            />
            {errors.nameKr && (
              <p className="mt-1 text-xs text-red-600">{errors.nameKr}</p>
            )}
          </div>

          <div className="link-row mb-5 flex items-start gap-4">
            <div className="link-field min-w-0 flex-1">
              <div className="form-label">リンク</div>
              <input
                value={form.link}
                onChange={(e) =>
                  setForm((f) => ({ ...f, link: e.target.value }))
                }
                type="text"
                placeholder="リンクを入力してください"
                className={`h-9 w-full rounded-md border px-3 text-sm outline-none ${errors.link ? "border-red-400" : `border-gray-300 ${focusClass}`}`}
              />
              {errors.link && (
                <p className="mt-1 text-xs text-red-600">{errors.link}</p>
              )}
            </div>
            <div className="classic-field w-24 shrink-0">
              <div className="form-label">クラシック</div>
              <label className="toggle-switch">
                <input
                  checked={form.classic}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, classic: e.target.checked }))
                  }
                  type="checkbox"
                  className="peer sr-only"
                />
                <span
                  className={`toggle-track ${isEdit ? "is-primary" : "is-success"}`}
                >
                  <span className="toggle-thumb" />
                </span>
              </label>
            </div>
          </div>

          <div className="mb-5">
            <div className="form-label">歌詞</div>
            <textarea
              value={form.lyric}
              onChange={(e) =>
                setForm((f) => ({ ...f, lyric: e.target.value }))
              }
              rows={6}
              placeholder="セリフを入力してください"
              className={`w-full rounded-md border px-3 py-1.5 text-sm outline-none ${errors.lyric ? "border-red-400" : `border-gray-300 ${focusClass}`}`}
            />
            {errors.lyric && (
              <p className="mt-1 text-xs text-red-600">{errors.lyric}</p>
            )}
          </div>

          {isEdit && (
            <p className="text-xs text-gray-500">
              最終更新者：{form.updatedUser}＠{form.updatedTime}日本標準時間
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 pb-4">
          <RippleButton
            type="button"
            className={`rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${isEdit ? "bg-primary" : "bg-success"}`}
            disabled={saving}
            onClick={onSubmit}
          >
            {saving ? (
              <LoaderCircle className="inline-block h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center justify-center gap-1">
                <Zap className="h-4 w-4" /> {isEdit ? "更新" : "追加"}
              </span>
            )}
          </RippleButton>
          <RippleButton
            type="button"
            className="flex items-center gap-1 rounded-md bg-gray-500 px-4 py-1.5 text-sm font-medium text-white"
            onClick={onReset}
          >
            <Trash2 className="h-4 w-4" /> {isEdit ? "廃棄" : "リセット"}
          </RippleButton>
        </div>
      </div>
    </div>
  );
}
