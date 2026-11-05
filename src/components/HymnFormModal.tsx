"use client";

// src/components/HymnFormModal.tsx
// 旧 HymnFormView(追加・編集の画面)をモーダル化したもの。
// 賛美歌一覧(app/(admin)/hymns/page.tsx)から開く。ルーティングやURLパラメータは使わず、
// 一覧側の状態(pageSize 等)を props で受け取る。
import { useEffect, useState } from "react";
import {
  FileArchive,
  LayoutGrid,
  RotateCcw,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import api from "@/api/axios";
import { invalidateLyric } from "@/lib/lyrics";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFeedbackStore } from "@/stores/feedback";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useAuthStore } from "@/stores/auth";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  mode: "add" | "edit";
  /** 編集時の曲ID(Snowflake の19桁なので文字列で受け取る) */
  editId?: string;
  /** 追加API(POST /hymns?pageSize=)へ渡す一覧の1ページ件数 */
  pageSize: number;
  onClose: () => void;
  /** 保存成功時。追加のときだけ、新しい曲が載るページ番号(X-Page-Num)が入る */
  onSaved: (result: { mode: "add" | "edit"; pageNum?: number }) => void;
};

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

export default function HymnFormModal({
  mode,
  editId: editIdProp,
  pageSize,
  onClose,
  onSaved,
}: Props) {
  const feedback = useFeedbackStore();
  const queryClient = useQueryClient();
  const auth = useAuthStore();

  const isEdit = mode === "edit";
  const editId = isEdit ? (editIdProp ?? null) : null;

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
        // ホーム画面の歌詞キャッシュ(5分)に古い歌詞が残らないよう、この曲の分を捨てる
        if (form.id) void invalidateLyric(queryClient, form.id);
        feedback.toast(typeof data === "string" ? data : "更新しました");
        onSaved({ mode: "edit" });
      } else {
        const { headers } = await api.post("/hymns", payload, {
          params: { pageSize: pageSize || 5 },
        });
        feedback.toast("追加済み");
        // axiosはヘッダー名を小文字化して格納する
        onSaved({ mode: "add", pageNum: Number(headers["x-page-num"]) || 1 });
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

  // フォーカス時の枠・リング色(更新=burgundy / 追加=green)。
  // エラー時(aria-invalid)はフォーカス中でも赤枠のままにするため not-aria-invalid を付ける。
  const focusClass = isEdit
    ? "not-aria-invalid:focus-visible:border-primary not-aria-invalid:focus-visible:ring-primary/20"
    : "not-aria-invalid:focus-visible:border-success not-aria-invalid:focus-visible:ring-success/20";

  // 背景画像の上でも読みやすいよう、入力欄は白ベタにする。
  const inputClass = `bg-white ${focusClass}`;

  // 編集内容があるか。追加は空の状態、編集は読み込んだ内容(originalForm)と比べる。
  // 編集で読み込みがまだ終わっていないときは、変更なし扱い。
  const baseline = isEdit ? originalForm : emptyForm;
  const isDirty =
    !!baseline &&
    (form.nameJp !== baseline.nameJp ||
      form.nameKr !== baseline.nameKr ||
      form.link !== baseline.link ||
      form.lyric !== baseline.lyric ||
      form.classic !== baseline.classic);

  // 編集内容があるまま、タブを閉じる・再読み込み・別サイトへ移動しようとしたらブラウザが確認する
  useUnsavedChanges(isDirty);

  // 編集内容を捨てて閉じてよいかの確認ダイアログ
  const [discardOpen, setDiscardOpen] = useState(false);

  const close = () => {
    if (saving) return; // 保存中は誤って閉じられないようにする
    if (isDirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        // 背景クリック・Esc・×のどれで閉じようとしても close() を通る。
        // 入力中の内容があれば、閉じる前に確認ダイアログを出す(onOpenChange 側)。
        className="noto-sans max-h-[92vh] max-w-3xl gap-0 overflow-y-auto rounded-[18px] border-0 bg-transparent p-0 shadow-none sm:max-w-3xl"
      >
        <DialogDescription className="sr-only">
          {isEdit ? "賛美歌情報を更新します" : "賛美歌情報を追加します"}
        </DialogDescription>
        {/* glass-panel(globals.css・レイヤー外)の背景に勝つため、末尾 ! (Tailwind v4 の important) を付けている。
            モーダルでは暗い下地の上に載るので、半透明ではなく白ベタにする。 */}
        <Card className="form-card glass-panel relative gap-0 overflow-hidden rounded-[18px] bg-white! py-0">
          <CardHeader
            className={`flex items-center gap-0 px-4 py-3 text-white ${isEdit ? "bg-primary" : "bg-success"}`}
          >
            <LayoutGrid className="mr-2 h-5 w-5" />
            <DialogTitle asChild>
              <CardTitle className="text-lg leading-normal">
                {isEdit ? "賛美歌情報更新" : "賛美歌情報追加"}
              </CardTitle>
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              className="ml-auto text-white hover:bg-white/20 hover:text-white"
              type="button"
              disabled={saving}
              aria-label="閉じる"
              onClick={close}
            >
              <X className="size-5" />
            </Button>
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
                        className={inputClass}
                        onBlur={checkNameJp}
                      />
                      <FieldError id="hymn-name-jp-error" className="text-xs">
                        {errors.nameJp}
                      </FieldError>
                    </Field>

                    <Field className="gap-1.5">
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
                        className={inputClass}
                        onBlur={checkNameKr}
                      />
                      <FieldError id="hymn-name-kr-error" className="text-xs">
                        {errors.nameKr}
                      </FieldError>
                    </Field>
                  </div>
                </FieldGroup>
              </FieldSet>

              <FieldSeparator />

              {/* ===== リンク・分類 ===== */}
              <FieldSet>
                <FieldLegend variant="label" className="text-base font-bold">
                  リンク・分類
                </FieldLegend>
                <FieldGroup className="gap-5">
                  <Field className="gap-1.5">
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
                      aria-describedby={
                        errors.link ? "hymn-link-error" : undefined
                      }
                      className={inputClass}
                    />
                    <FieldError id="hymn-link-error" className="text-xs">
                      {errors.link}
                    </FieldError>
                  </Field>

                  {/* ラベルとスイッチを同じ行に置く(personal の外部連携行と同じ見た目) */}
                  <div className="flex items-center justify-between gap-4 rounded-lg border bg-white p-4">
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
                  </div>
                </FieldGroup>
              </FieldSet>

              <FieldSeparator />

              {/* ===== 歌詞 ===== */}
              <FieldSet>
                <FieldLegend variant="label" className="text-base font-bold">
                  歌詞
                </FieldLegend>
                <FieldGroup>
                  <Field className="gap-1.5">
                    <FieldLabel htmlFor="hymn-lyric" className="sr-only">
                      歌詞
                    </FieldLabel>
                    <Textarea
                      id="hymn-lyric"
                      value={form.lyric}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, lyric: e.target.value }))
                      }
                      rows={8}
                      placeholder="セリフを入力してください"
                      aria-invalid={!!errors.lyric}
                      aria-describedby={
                        errors.lyric ? "hymn-lyric-error" : undefined
                      }
                      className={`field-sizing-fixed ${inputClass}`}
                    />
                    <FieldError id="hymn-lyric-error" className="text-xs">
                      {errors.lyric}
                    </FieldError>
                  </Field>
                </FieldGroup>
              </FieldSet>
            </FieldGroup>
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-end gap-2 border-t bg-white/60 px-6 py-4">
            {isEdit && (
              <p className="mr-auto text-xs text-gray-500">
                最終更新者：{form.updatedUser}＠{form.updatedTime}日本標準時間
              </p>
            )}
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

        {/* 編集内容の破棄確認: 外側の Dialog の子として描画し、Radix に入れ子のレイヤーとして扱わせる
            (楽譜アップロードの上書き確認と同じ作り) */}
        <Dialog
          open={discardOpen}
          onOpenChange={(open) => {
            if (!open) setDiscardOpen(false);
          }}
        >
          <DialogContent
            className={`noto-sans max-w-sm gap-4 rounded-[18px] border-0 bg-white sm:max-w-sm ${isEdit ? "**:data-[slot=dialog-close]:text-primary" : "**:data-[slot=dialog-close]:text-success"}`}
          >
            <DialogHeader>
              <DialogTitle className={isEdit ? "text-primary" : "text-success"}>
                編集内容があります
              </DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "変更を破棄して閉じますか?"
                  : "入力した内容を破棄して閉じますか?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setDiscardOpen(false)}
              >
                編集を続ける
              </Button>
              <Button
                variant={isEdit ? "default" : "success"}
                type="button"
                onClick={() => {
                  setDiscardOpen(false);
                  onClose();
                }}
              >
                破棄して閉じる
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
