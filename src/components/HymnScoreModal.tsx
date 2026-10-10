"use client";

// src/components/HymnScoreModal.tsx
// 旧 components/HymnScoreModal.vue を移植。HymnList から表示するモーダル(ルーティングは行わない)。
// shadcn/ui 版: createPortal・Escキー処理・背景クリック判定は Dialog(Radix)に任せる。
import { useRef, useState } from "react";
import axios from "axios";
import { CloudUpload, X } from "lucide-react";
import api from "@/api/axios";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";

type Props = {
  hymnId: number;
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
  const [error, setError] = useState(EMPTY_STRING);
  const [uploading, setUploading] = useState(false);
  // 同じ調の楽譜が既にある場合の上書き確認ダイアログ
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const title = `楽譜-${hymnNameKr}`;

  const close = () => {
    if (uploading) return; // アップロード中は誤って閉じられないようにする
    onClose();
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setError(EMPTY_STRING);
  };

  // overwrite=false: 同じ調に違う内容の楽譜があればサーバーが 409 を返す(上書きしない)
  // overwrite=true : 確認ダイアログで「上書きする」を選んだあとの再送
  const doUpload = async (overwrite: boolean) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("score", file);
    formData.append("chord", chord);
    formData.append("isOriginal", String(isOriginal));
    formData.append("overwrite", String(overwrite));
    const controller = new AbortController();
    setUploading(true);
    try {
      const { data } = await api.post(`/hymns/${hymnId}/score`, formData, {
        signal: controller.signal,
        timeout: 66_000,
      });
      toast(typeof data === "string" ? data : "アップロードしました");
      onUploaded();
      onClose();
    } catch (e: unknown) {
      if (axios.isCancel(e)) {
        toast("アップロードをキャンセルしました");
      } else if (axios.isAxiosError(e) && e.response?.status === 409) {
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
    if (!chord) {
      setError("調を選択してください。");
      return;
    }
    if (!file) {
      setError("ファイルを選択してください。");
      return;
    }
    await doUpload(false);
  };

  const onOverwrite = async () => {
    setConfirmOpen(false);
    await doUpload(true);
  };

  // 登録済みの楽譜をダウンロードして中身を確認する(確認ダイアログは開いたまま)
  const onDownloadExisting = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/hymns/${hymnId}/score`, {
        params: { chord },
        responseType: "blob",
        headers: { Accept: "*/*" },
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${hymnId}(${chord}).pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast(extractErrorMessage(e, "楽譜の取得に失敗しました"));
    } finally {
      setDownloading(false);
    }
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
      <DialogContent
        showCloseButton={false}
        className="score-modal noto-sans flex min-h-[33vh] max-w-md flex-col justify-between gap-0 overflow-hidden rounded-[18px] border-0 bg-white p-0 sm:max-w-md"
      >
        <div className="bg-white pt-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div aria-hidden="true"></div>
            <DialogTitle className="text-center text-base font-semibold text-secondary">
              {title}
            </DialogTitle>
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-2 justify-self-end text-secondary hover:bg-secondary/10 hover:text-secondary"
              rippleColor="rgba(0, 51, 153, 0.2)"
              type="button"
              disabled={uploading}
              aria-label="閉じる"
              onClick={close}
            >
              <X className="size-5" />
            </Button>
          </div>
          <div className="mx-1.5 mt-2 h-0.75 rounded-full bg-secondary"></div>
          <DialogDescription className="sr-only">
            楽譜ファイル(PDF・画像)を選択してアップロードします。
          </DialogDescription>
        </div>

        <div className="flex flex-col items-center gap-2 p-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.svg"
            className="hidden"
            onChange={onFilePick}
          />
          <ToggleGroup
            type="single"
            value={chord}
            onValueChange={(v) => {
              // 選択済みを再クリックすると v が空になるので、選択を維持する
              if (!v) return;
              setChord(v);
              setError(EMPTY_STRING);
            }}
            disabled={uploading}
            aria-label="調(長調)"
            className="mb-5 grid w-full grid-cols-6 gap-1.5"
          >
            {MAJOR_KEYS.map((k) => (
              <ToggleGroupItem
                key={k.value}
                value={k.value}
                aria-label={k.label}
                className="h-10 rounded-md! border border-secondary px-0 text-base text-secondary hover:bg-secondary/10 hover:text-secondary data-[state=on]:bg-secondary data-[state=on]:text-white"
              >
                {k.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex items-end justify-center gap-5">
            <Button
              variant="outline"
              className="mx-2 scale-[1.33] border-secondary bg-transparent text-secondary hover:bg-secondary/5 hover:text-secondary"
              rippleColor="rgba(0, 51, 153, 0.2)"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <CloudUpload className="h-4 w-4" /> ファイルを選択
            </Button>
            <div className="mx-3 flex flex-col items-center gap-3">
              <label
                htmlFor="score-original"
                className="text-xs font-medium text-secondary"
              >
                オリジナル
              </label>
              <Switch
                id="score-original"
                checked={isOriginal}
                onCheckedChange={setIsOriginal}
                disabled={uploading}
                size="lg"
                className="scale-[1.41] data-[state=checked]:bg-secondary"
              />
            </div>
          </div>
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              {file.name}({Math.round(file.size / 1024)} KB)
            </p>
          )}
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end px-6 pb-4">
          <Button
            variant="secondary"
            type="button"
            disabled={uploading}
            onClick={onUpload}
          >
            {uploading ? (
              <Spinner />
            ) : (
              <span className="flex items-center gap-1">アップロード</span>
            )}
          </Button>
        </div>

        {/* 上書き確認: 外側の Dialog の子として描画し、Radix に入れ子のレイヤーとして扱わせる */}
        <Dialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!open && !uploading) setConfirmOpen(false);
          }}
        >
          <DialogContent className="noto-sans max-w-sm gap-4 rounded-[18px] border-0 bg-white sm:max-w-sm **:data-[slot=dialog-close]:text-secondary">
            <DialogHeader>
              <DialogTitle className="text-secondary">
                {chordLabel}の楽譜は登録済みです
              </DialogTitle>
              <DialogDescription>上書きしますか?</DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                type="button"
                disabled={downloading}
                className="border-secondary text-secondary hover:bg-secondary/5 hover:text-secondary"
                rippleColor="rgba(0, 51, 153, 0.2)"
                onClick={onDownloadExisting}
              >
                {downloading ? <Spinner /> : "既存をダウンロード"}
              </Button>
              <Button variant="secondary" type="button" onClick={onOverwrite}>
                上書きする
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
