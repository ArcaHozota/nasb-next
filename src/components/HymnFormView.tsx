"use client";

// src/components/HymnFormView.tsx
// 旧 views/HymnForm.vue を移植(追加・編集の両方で使用)。
// app/(admin)/hymns/add と app/(admin)/hymns/edit の両ページから読み込む。
import { useEffect, useMemo, useState } from "react";
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
import { FileArchive, LayoutGrid, RotateCcw, Trash2, Zap } from "lucide-react";
import api from "@/api/axios";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFeedbackStore } from "@/stores/feedback";
import { useAuthStore } from "@/stores/auth";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

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

  // フォーカス時の枠・リング色(更新=burgundy / 追加=green)。
  // エラー時(aria-invalid)はフォーカス中でも赤枠のままにするため not-aria-invalid を付ける。
  const focusClass = isEdit
    ? "not-aria-invalid:focus-visible:border-primary not-aria-invalid:focus-visible:ring-primary/20"
    : "not-aria-invalid:focus-visible:border-success not-aria-invalid:focus-visible:ring-success/20";

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
      <Breadcrumb className="mb-2">
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
            <BreadcrumbLink
              asChild
              className="text-[#fffff0] hover:text-white hover:underline"
            >
              <Link href={`/hymns?${listQueryStr}`}>データリスト</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-semibold text-[#fffff0]">
              {isEdit ? "データ更新" : "データ追加"}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card
        className={`form-card glass-panel ${isEdit ? "glass-panel--burgundy" : "glass-panel--green"} relative overflow-hidden rounded-[18px] gap-0 py-0`}
      >
        <CardHeader
          className={`gap-0 flex items-center px-4 py-3 text-white ${isEdit ? "bg-primary" : "bg-success"}`}
        >
          <LayoutGrid className="mr-2 h-5 w-5" />
          <CardTitle
            role="heading"
            aria-level={1}
            className="text-lg leading-normal"
          >
            {isEdit ? "賛美歌情報更新" : "賛美歌情報追加"}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6 pt-5">
          <Field className="mb-5 gap-1.5">
            <FieldLabel htmlFor="hymn-name-jp" className="form-label">
              日本語名称
            </FieldLabel>
            <Input
              id="hymn-name-jp"
              value={form.nameJp}
              onChange={(e) =>
                setForm((f) => ({ ...f, nameJp: e.target.value }))
              }
              type="text"
              placeholder="日本語名称を入力してください"
              aria-invalid={!!errors.nameJp}
              aria-describedby={
                errors.nameJp ? "hymn-name-jp-error" : undefined
              }
              className={focusClass}
              onBlur={checkNameJp}
            />
            <FieldError id="hymn-name-jp-error" className="text-xs">
              {errors.nameJp}
            </FieldError>
          </Field>

          <Field className="mb-5 gap-1.5">
            <FieldLabel htmlFor="hymn-name-kr" className="form-label">
              韓国語名称
            </FieldLabel>
            <Input
              id="hymn-name-kr"
              value={form.nameKr}
              onChange={(e) =>
                setForm((f) => ({ ...f, nameKr: e.target.value }))
              }
              type="text"
              placeholder="韓国語名称を入力してください"
              aria-invalid={!!errors.nameKr}
              aria-describedby={
                errors.nameKr ? "hymn-name-kr-error" : undefined
              }
              className={focusClass}
              onBlur={checkNameKr}
            />
            <FieldError id="hymn-name-kr-error" className="text-xs">
              {errors.nameKr}
            </FieldError>
          </Field>

          <div className="link-row mb-5 flex items-start gap-4">
            <Field className="link-field min-w-0 flex-1 gap-1.5">
              <FieldLabel htmlFor="hymn-link" className="form-label">
                リンク
              </FieldLabel>
              <Input
                id="hymn-link"
                value={form.link}
                onChange={(e) =>
                  setForm((f) => ({ ...f, link: e.target.value }))
                }
                type="text"
                placeholder="リンクを入力してください"
                aria-invalid={!!errors.link}
                aria-describedby={errors.link ? "hymn-link-error" : undefined}
                className={focusClass}
              />
              <FieldError id="hymn-link-error" className="text-xs">
                {errors.link}
              </FieldError>
            </Field>
            <Field className="classic-field w-24 shrink-0 gap-1.5">
              <FieldLabel htmlFor="hymn-classic" className="form-label">
                クラシック
              </FieldLabel>
              <Switch
                id="hymn-classic"
                size="lg"
                checked={form.classic}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, classic: checked }))
                }
                className={
                  isEdit
                    ? "data-[state=checked]:bg-primary"
                    : "data-[state=checked]:bg-success"
                }
              />
            </Field>
          </div>

          <Field className="mb-5 gap-1.5">
            <FieldLabel htmlFor="hymn-lyric" className="form-label">
              歌詞
            </FieldLabel>
            <Textarea
              id="hymn-lyric"
              value={form.lyric}
              onChange={(e) =>
                setForm((f) => ({ ...f, lyric: e.target.value }))
              }
              rows={6}
              placeholder="セリフを入力してください"
              aria-invalid={!!errors.lyric}
              aria-describedby={errors.lyric ? "hymn-lyric-error" : undefined}
              className={`field-sizing-fixed ${focusClass}`}
            />
            <FieldError id="hymn-lyric-error" className="text-xs">
              {errors.lyric}
            </FieldError>
          </Field>

          {isEdit && (
            <p className="text-xs text-gray-500">
              最終更新者：{form.updatedUser}＠{form.updatedTime}日本標準時間
            </p>
          )}
        </CardContent>

        <CardFooter className="flex justify-end gap-2 px-6 pb-4">
          <Button
            variant={isEdit ? "default" : "success"}
            type="button"
            disabled={saving}
            onClick={onSubmit}
          >
            {saving ? (
              <Spinner />
            ) : (
              <span className="flex items-center justify-center gap-1">
                {isEdit ? (
                  <Zap className="h-4 w-4" />
                ) : (
                  <FileArchive className="h-4 w-4" />
                )}{" "}
                {isEdit ? "更新" : "追加"}
              </span>
            )}
          </Button>
          <Button variant="neutral" type="button" onClick={onReset}>
            {isEdit ? (
              <Trash2 className="h-4 w-4" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}{" "}
            {isEdit ? "廃棄" : "リセット"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
