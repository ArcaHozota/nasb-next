"use client";

// src/components/HymnScoreModal.tsx
// 旧 components/HymnScoreModal.vue を移植。HymnList から表示するモーダル(ルーティングは行わない)。
// shadcn/ui 版: createPortal・Escキー処理・背景クリック判定は Dialog(Radix)に任せる。
// 構成: 見出し(楽譜アップロード + 曲名) / 調 / ファイル / オリジナルキー / 閉じる・アップロード
import { useRef, useState } from "react";
import axios from "axios";
import { Upload, X } from "lucide-react";
import api from "@/api/axios";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";

/** バックエンドの上限(現行 struts.multipart.maxSize と同じ 30MB) */
const MAX_FILE_BYTES = 30 * 1024 * 1024;

type Props = {
  hymnId: string;
  hymnNameKr: string;
  onClose: () => void;
  onUploaded: () => void;
};

/**
 * 12長調。value は DB(HYMNS_WORK.CHORD)に保存する値(ASCII)、label は画面表示。
 * バックエンド(HymnsHandler)の許可リストと同じ並び・同じ値にすること。
 */
const MAJOR_KEYS = [
  { value: "A", label: "A" },
  { value: "Ab", label: "A♭" },
  { value: "B", label: "B" },
  { value: "Bb", label: "B♭" },
  { value: "C", label: "C" },
  { value: "D", label: "D" },
  { value: "Db", label: "D♭" },
  { value: "E", label: "E" },
  { value: "Eb", label: "E♭" },
  { value: "F", label: "F" },
  { value: "G", label: "G" },
  { value: "Gb", label: "G♭" },
] as const;

export default function HymnScoreModal({
  hymnId,
  hymnNameKr,
  onClose,
  onUploaded,
}: Props) {
  const toast = useFeedbackStore((s) => s.toast);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [chord, setChord] = useState(EMPTY_STRING);
  const [isOriginal, setIsOriginal] = useState(false);
  // エラーは関係する項目のすぐ下に出すので、項目ごとに持つ
  const [chordError, setChordError] = useState(EMPTY_STRING);
  const [fileError, setFileError] = useState(EMPTY_STRING);
  const [uploading, setUploading] = useState(false);
  // 同じ調の楽譜が既にある場合の上書き確認ダイアログ
  const [confirmOpen, setConfirmOpen] = useState(false);

  const close = () => {
    if (uploading) return; // アップロード中は誤って閉じられないようにする
    onClose();
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    // 同じファイルをもう一度選んでも change が起きるよう、選択を空に戻しておく
    e.target.value = "";
    if (picked && picked.size > MAX_FILE_BYTES) {
      // 上限を超えるファイルは、送信を待たずにここで知らせる
      setFile(null);
      setFileError("ファイルが大きすぎます(30MBまで)。");
      return;
    }
    setFile(picked);
    setFileError(EMPTY_STRING);
  };

  // overwrite=false: 同じ調に違う内容の楽譜があればサーバーが 409 を返す(上書きしない)
  // overwrite=true : 上書きの確認で「はい」を選んだあとの再送
  const doUpload = async (overwrite: boolean) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("score", file);
    formData.append("chord", chord);
    formData.append("isOriginal", String(isOriginal));
    formData.append("overwrite", String(overwrite));
    setUploading(true);
    try {
      const { data } = await api.post(`/hymns/${hymnId}/score`, formData, {
        timeout: 66_000,
      });
      toast(typeof data === "string" ? data : "アップロードしました");
      onUploaded();
      onClose();
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        // この調の楽譜は登録済み: ファイル・調・オリジナルの入力はそのまま残して確認する
        setConfirmOpen(true);
      } else {
        toast(extractErrorMessage(e, "通信エラーが発生しました。"));
      }
    } finally {
      setUploading(false);
    }
  };

  const onUpload = async () => {
    // 両方とも未入力なら、両方のエラーを一度に出す
    setChordError(chord ? EMPTY_STRING : "調を選択してください。");
    setFileError(file ? EMPTY_STRING : "ファイルを選択してください。");
    if (!chord || !file) return;
    await doUpload(false);
  };

  const onOverwrite = async () => {
    setConfirmOpen(false);
    await doUpload(true);
  };

  const chordLabel = MAJOR_KEYS.find((k) => k.value === chord)?.label ?? chord;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Escキー・背景クリックのどちらもここに来る
        if (!open) close();
      }}
    >
      {/* 見た目は shadcn/ui の標準のダイアログ(左寄せの見出し・項目ごとの名前・右下のボタン)。
          ×ボタンは、アップロード中に押せないよう自前のものを置く */}
      <DialogContent
        showCloseButton={false}
        className="score-modal noto-sans max-w-md gap-5 sm:max-w-md"
      >
        <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex flex-col gap-1">
            <DialogTitle>楽譜アップロード</DialogTitle>
            <DialogDescription>{hymnNameKr}</DialogDescription>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-mt-1 -mr-2 text-muted-foreground"
            type="button"
            disabled={uploading}
            aria-label="閉じる"
            onClick={close}
          >
            <X />
          </Button>
        </DialogHeader>

        {/* ===== 調 ===== */}
        <FieldSet className="gap-2">
          <FieldLegend variant="label">調</FieldLegend>
          {/* 選んでいない調は灰色の枠、選んだ調だけ burgundy で塗る */}
          <ToggleGroup
            type="single"
            variant="outline"
            value={chord}
            onValueChange={(v) => {
              // 選択済みを再クリックすると v が空になるので、選択を維持する
              if (!v) return;
              setChord(v);
              setChordError(EMPTY_STRING);
            }}
            disabled={uploading}
            aria-label="調(長調)"
            aria-invalid={!!chordError}
            className="grid w-full grid-cols-6 gap-1.5"
          >
            {MAJOR_KEYS.map((k) => (
              <ToggleGroupItem
                key={k.value}
                value={k.value}
                aria-label={k.label}
                className="h-9 rounded-md! border-l! px-0 text-sm data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {k.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldError className="text-xs">{chordError}</FieldError>
        </FieldSet>

        {/* ===== ファイル ===== */}
        <Field className="gap-2">
          <FieldLabel htmlFor="score-file">ファイル</FieldLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif"
            className="hidden"
            onChange={onFilePick}
          />
          {/* 選んだファイルはボタンの横に出す(選んだかどうかがすぐ分かるように) */}
          <div className="flex min-w-0 items-center gap-3 rounded-lg border border-dashed p-3">
            <Button
              id="score-file"
              variant="outline"
              size="sm"
              type="button"
              disabled={uploading}
              aria-invalid={!!fileError}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload /> ファイルを選択
            </Button>
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {file
                ? `${file.name}(${Math.round(file.size / 1024)} KB)`
                : "選択されていません"}
            </span>
          </div>
          <FieldDescription className="text-xs">
            PDF・画像(JPG / PNG / GIF)、30MBまで
          </FieldDescription>
          <FieldError className="text-xs">{fileError}</FieldError>
        </Field>

        {/* ===== オリジナルキー(個人設定の外部連携の行と同じ見た目) ===== */}
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="flex flex-col gap-0.5">
            <FieldLabel htmlFor="score-original">オリジナルキー</FieldLabel>
            <FieldDescription className="text-xs">
              この曲の元の調として登録します
            </FieldDescription>
          </div>
          <Switch
            id="score-original"
            checked={isOriginal}
            onCheckedChange={setIsOriginal}
            disabled={uploading}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            disabled={uploading}
            onClick={close}
          >
            閉じる
          </Button>
          <Button type="button" disabled={uploading} onClick={onUpload}>
            {uploading ? <Spinner /> : <Upload />}
            アップロード
          </Button>
        </DialogFooter>

        {/* 上書き確認: 外側の Dialog の子として描画し、Radix に入れ子のレイヤーとして扱わせる */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!open && !uploading) setConfirmOpen(false);
          }}
          title="上書きの確認"
          description={`${chordLabel}の楽譜は既に登録されています。上書きしますか?`}
          onConfirm={() => void onOverwrite()}
        />
      </DialogContent>
    </Dialog>
  );
}
