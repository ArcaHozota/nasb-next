"use client";

// src/components/HymnScoreModal.tsx
// 旧 components/HymnScoreModal.vue を移植。HymnList から表示するモーダル(ルーティングは行わない)。
// shadcn/ui 版: createPortal・Escキー処理・背景クリック判定は Dialog(Radix)に任せる。
import { useRef, useState } from "react";
import axios from "axios";
import { CloudUpload, LoaderCircle, X } from "lucide-react";
import api from "@/api/axios";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";

type Props = {
  hymnId: number;
  hymnNameKr: string;
  onClose: () => void;
  onUploaded: () => void;
};

export default function HymnScoreModal({
  hymnId,
  hymnNameKr,
  onClose,
  onUploaded,
}: Props) {
  const toast = useFeedbackStore((s) => s.toast);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState(EMPTY_STRING);
  const [uploading, setUploading] = useState(false);

  const title = `楽譜-${hymnNameKr}`;

  const close = () => {
    if (uploading) return; // アップロード中は誤って閉じられないようにする
    onClose();
  };

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setError(EMPTY_STRING);
  };

  const onUpload = async () => {
    if (!file) {
      setError("ファイルを選択してください。");
      return;
    }
    const formData = new FormData();
    formData.append("score", file);
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
      } else {
        toast(extractErrorMessage(e, "通信エラーが発生しました。"));
      }
    } finally {
      setUploading(false);
    }
  };

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
        className="score-modal noto-sans flex h-[33vh] max-w-md flex-col justify-between gap-0 overflow-hidden rounded-[18px] border-0 bg-white p-0 sm:max-w-md"
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

        <div className="flex flex-col items-center gap-2 p-8">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.svg"
            className="hidden"
            onChange={onFilePick}
          />
          <Button
            variant="outline"
            className="scale-[1.33] border-secondary bg-transparent text-secondary hover:bg-secondary/5 hover:text-secondary"
            rippleColor="rgba(0, 51, 153, 0.2)"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUpload className="h-4 w-4" /> ファイルを選択
          </Button>
          {file && (
            <p className="mt-1 text-sm text-gray-600">
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
              <LoaderCircle className="inline-block h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center gap-1">アプロード</span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
