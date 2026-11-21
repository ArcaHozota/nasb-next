"use client";

// src/components/HymnFormModal.tsx
// 旧 HymnFormView(追加・編集の画面)をモーダル化したもの。
// 賛美歌一覧(app/(admin)/hymns/page.tsx)から開く。ルーティングやURLパラメータは使わず、
// 一覧側の状態(pageSize 等)を props で受け取る。
import { useEffect, useState } from "react";
import { Check, Plus, RotateCcw, Undo2, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/api/axios";
import { fetchHymnDetail, hymnKeys, invalidateHymns } from "@/api/hymns";
import { invalidateLyric } from "@/lib/lyrics";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useFeedbackStore } from "@/stores/feedback";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useAuthStore } from "@/stores/auth";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import { required } from "@/lib/form";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import ConfirmDialog from "@/components/ConfirmDialog";
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
  const toast = useFeedbackStore((s) => s.toast);
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.userId);

  const isEdit = mode === "edit";
  const editId = isEdit ? (editIdProp ?? null) : null;

  // 編集時: 既存データを読み込む。応答が届く前にモーダルを閉じても(別の曲を開いても)、
  // クエリはこの曲のキーにひも付いているので、古い応答が別の曲のフォームに入ることはない。
  // 他の人の更新を拾えるよう、開くたびに取り直す(staleTime: 0)。
  // ただし編集中には取り直さない。途中で取り直すと updatedTime(楽観ロック)が新しくなり、
  // 他の人の更新を上書きしても保存が通ってしまうため。
  const detailQuery = useQuery({
    queryKey: hymnKeys.detail(editId ?? ""),
    queryFn: () => fetchHymnDetail(editId!),
    enabled: isEdit && !!editId,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  // 読み込めないまま空のフォームで更新できてしまわないよう、モーダルを閉じる
  useEffect(() => {
    if (!detailQuery.error) return;
    toast(extractErrorMessage(detailQuery.error, "データの取得に失敗しました"));
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.error]);

  // 編集の基準(追加は空、編集は読み込んだ内容。読み込み前は null)
  const originalForm: FormState | null = isEdit
    ? detailQuery.data
      ? { ...emptyForm, ...detailQuery.data, id: editId }
      : null
    : { ...emptyForm, id: null };

  // ユーザーが入力した分だけを持ち、画面に出す値は「基準 + 入力」で作る
  // (読み込みが入力より後に届いても、入力した内容は消えない)
  const [edits, setEdits] = useState<Partial<FormState>>({});
  const form: FormState = {
    ...(originalForm ?? { ...emptyForm, id: editId }),
    ...edits,
  };
  // 変わった項目だけを edits に入れる(触っていない項目は、後から届いた読み込み結果を使う)
  const EDITABLE = ["nameJp", "nameKr", "link", "lyric", "classic"] as const;
  const setForm = (update: (f: FormState) => FormState) => {
    const next = update(form);
    const changed: Partial<FormState> = {};
    for (const k of EDITABLE) {
      if (next[k] !== form[k]) Object.assign(changed, { [k]: next[k] });
    }
    setEdits((prev) => ({ ...prev, ...changed }));
  };

  const [errors, setErrors] = useState({
    nameJp: EMPTY_STRING,
    nameKr: EMPTY_STRING,
    link: EMPTY_STRING,
    lyric: EMPTY_STRING,
  });

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
      toast("入力情報不正");
      return;
    }
    if (!userId) {
      toast("ログイン情報の取得に失敗しました。再度ログインしてください。");
      return;
    }
    saveMutation.mutate(form);
  };

  const saveMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        nameJp: f.nameJp.trim(),
        nameKr: f.nameKr.trim().normalize("NFC"),
        link: f.link,
        lyric: f.lyric,
        classic: f.classic,
        updatedUser: userId,
      };
      if (isEdit) {
        const { data } = await api.put(`/hymns/${f.id}`, {
          ...payload,
          id: f.id,
          updatedTime: f.updatedTime,
        });
        return { mode: "edit" as const, message: data };
      }
      const { headers } = await api.post("/hymns", payload, {
        params: { pageSize: pageSize || 5 },
      });
      // axiosはヘッダー名を小文字化して格納する
      return {
        mode: "add" as const,
        pageNum: Number(headers["x-page-num"]) || 1,
      };
    },
    onSuccess: (result, f) => {
      // 一覧・ホーム・画面検索の索引・この曲の編集用データのキャッシュを捨てる
      void invalidateHymns(queryClient);
      if (result.mode === "edit") {
        // ホーム画面の歌詞キャッシュ(5分)に古い歌詞が残らないよう、この曲の分を捨てる
        if (f.id) void invalidateLyric(queryClient, f.id);
        toast(
          typeof result.message === "string" ? result.message : "更新しました",
        );
        onSaved({ mode: "edit" });
      } else {
        toast("追加済み");
        onSaved({ mode: "add", pageNum: result.pageNum });
      }
    },
    onError: (e) => toast(extractErrorMessage(e, "保存に失敗しました")),
  });
  const saving = saveMutation.isPending;

  const onReset = () => {
    // 入力を捨てると、基準(追加は空、編集は読み込んだ内容)に戻る
    setEdits({});
    setErrors({
      nameJp: EMPTY_STRING,
      nameKr: EMPTY_STRING,
      link: EMPTY_STRING,
      lyric: EMPTY_STRING,
    });
  };

  // フォーカス時の枠・リング色(追加・更新とも burgundy)。
  // エラー時(aria-invalid)はフォーカス中でも赤枠のままにするため not-aria-invalid を付ける。
  const focusClass =
    "not-aria-invalid:focus-visible:border-primary not-aria-invalid:focus-visible:ring-primary/20";

  const inputClass = focusClass;

  // 編集内容があるか。追加は空の状態、編集は読み込んだ内容(originalForm)と比べる。
  // 編集で読み込みがまだ終わっていないときは、変更なし扱い。
  const baseline = originalForm;
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

  // 見出しの下の説明。更新では最終更新者と日時(読み込み前は「読み込み中」)
  const headerDescription = !isEdit
    ? "すべての項目を入力してください"
    : originalForm
      ? `最終更新：${form.updatedUser}(${form.updatedTime} 日本時間)`
      : "読み込み中…";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {/* 見た目は shadcn/ui の標準のダイアログ(楽譜アップロードと同じ形)。
          背景クリック・Esc・×・閉じるのどれで閉じようとしても close() を通り、
          入力中の内容があれば閉じる前に確認ダイアログを出す。
          ×ボタンは、保存中に押せないよう自前のものを置く */}
      <DialogContent
        showCloseButton={false}
        className="noto-sans max-h-[92vh] max-w-2xl gap-5 overflow-y-auto sm:max-w-2xl"
      >
        <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <DialogTitle>
              {isEdit ? "賛美歌情報更新" : "賛美歌情報追加"}
            </DialogTitle>
            <DialogDescription>{headerDescription}</DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-2 text-muted-foreground"
            type="button"
            disabled={saving}
            aria-label="閉じる"
            onClick={close}
          >
            <X />
          </Button>
        </DialogHeader>

        {/* ===== 名称(2列) ===== */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="hymn-name-jp">日本語名称</FieldLabel>
            <Input
              id="hymn-name-jp"
              value={form.nameJp}
              onChange={(e) =>
                setForm((f) => ({ ...f, nameJp: e.target.value }))
              }
              type="text"
              disabled={saving}
              placeholder="いつくしみ深き"
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
            <FieldLabel htmlFor="hymn-name-kr">韓国語名称</FieldLabel>
            <Input
              id="hymn-name-kr"
              value={form.nameKr}
              onChange={(e) =>
                setForm((f) => ({ ...f, nameKr: e.target.value }))
              }
              type="text"
              disabled={saving}
              placeholder="죄짐 맡은 우리 구주"
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

        {/* ===== リンク ===== */}
        <Field className="gap-1.5">
          <FieldLabel htmlFor="hymn-link">リンク</FieldLabel>
          <Input
            id="hymn-link"
            value={form.link}
            onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
            type="text"
            inputMode="url"
            disabled={saving}
            placeholder="https://youtu.be/..."
            aria-invalid={!!errors.link}
            aria-describedby={
              errors.link ? "hymn-link-error" : "hymn-link-description"
            }
            className={inputClass}
          />
          <FieldDescription id="hymn-link-description" className="text-xs">
            YouTube の動画のリンク
          </FieldDescription>
          <FieldError id="hymn-link-error" className="text-xs">
            {errors.link}
          </FieldError>
        </Field>

        {/* ===== 歌詞 ===== */}
        <Field className="gap-1.5">
          <FieldLabel htmlFor="hymn-lyric">歌詞</FieldLabel>
          <Textarea
            id="hymn-lyric"
            value={form.lyric}
            onChange={(e) => setForm((f) => ({ ...f, lyric: e.target.value }))}
            rows={7}
            disabled={saving}
            placeholder="歌詞を1行ずつ入力します"
            aria-invalid={!!errors.lyric}
            aria-describedby={errors.lyric ? "hymn-lyric-error" : undefined}
            className={`field-sizing-fixed ${inputClass}`}
          />
          <FieldError id="hymn-lyric-error" className="text-xs">
            {errors.lyric}
          </FieldError>
        </Field>

        {/* ===== クラシック(楽譜アップロードのオリジナルキーと同じ行の見た目) ===== */}
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor="hymn-classic">クラシック</FieldLabel>
            <FieldDescription className="text-xs">
              一覧などで曲名の先頭に ★ を付けて表示します
            </FieldDescription>
          </div>
          <Switch
            id="hymn-classic"
            checked={form.classic}
            disabled={saving}
            onCheckedChange={(checked) =>
              setForm((f) => ({ ...f, classic: checked }))
            }
          />
        </div>

        {/* 左に控えめな「リセット / 元に戻す」、右に「閉じる」と主ボタン */}
        <DialogFooter className="items-center sm:justify-start">
          <Button
            variant="ghost"
            type="button"
            disabled={saving}
            className="text-muted-foreground"
            onClick={onReset}
          >
            {isEdit ? <Undo2 /> : <RotateCcw />}
            {isEdit ? "元に戻す" : "リセット"}
          </Button>
          <Button
            variant="outline"
            type="button"
            disabled={saving}
            className="sm:ml-auto"
            onClick={close}
          >
            閉じる
          </Button>
          <Button type="button" disabled={saving} onClick={onSubmit}>
            {saving ? <Spinner /> : isEdit ? <Check /> : <Plus />}
            {isEdit ? "更新" : "追加"}
          </Button>
        </DialogFooter>

        {/* 編集内容の破棄確認: 外側の Dialog の子として描画し、Base UI に入れ子のレイヤーとして扱わせる */}
        <ConfirmDialog
          open={discardOpen}
          onOpenChange={setDiscardOpen}
          title="お知らせ"
          description={
            isEdit
              ? "変更を破棄して閉じますか?"
              : "入力した内容を破棄して閉じますか?"
          }
          onConfirm={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
