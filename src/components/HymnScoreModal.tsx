"use client";

// src/components/HymnScoreModal.tsx
// 旧 components/HymnScoreModal.vue を移植。HymnList から表示するモーダル(ルーティングは行わない)。
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { CloudUpload, LoaderCircle, X } from "lucide-react";
import api from "@/api/axios";
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
  const [mounted, setMounted] = useState(false);

  const title = `楽譜-${hymnNameKr}`;

  useEffect(() => setMounted(true), []);

  const close = () => {
    if (uploading) return; // アップロード中は誤って閉じられないようにする
    onClose();
  };

  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeydown);
    return () => document.removeEventListener("keydown", onKeydown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading]);

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

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="score-modal noto-sans relative flex h-[33vh] w-full max-w-md flex-col justify-between overflow-hidden rounded-[18px] bg-white"
        role="dialog"
        aria-modal="true"
      >
        <div className="bg-white pt-3">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div aria-hidden="true"></div>
            <h2 className="text-center text-base font-semibold text-secondary">
              {title}
            </h2>
            <button
              type="button"
              className="mr-2 justify-self-end rounded p-1 text-secondary hover:bg-secondary/10 disabled:opacity-50"
              disabled={uploading}
              aria-label="閉じる"
              onClick={close}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mx-1.5 mt-2 h-0.75 rounded-full bg-secondary"></div>
        </div>

        <div className="flex flex-col items-center gap-2 p-8">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.svg"
            className="hidden"
            onChange={onFilePick}
          />
          <button
            type="button"
            className="flex scale-[1.33] items-center gap-1 rounded-md border border-secondary px-4 py-1.5 text-sm font-medium text-secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            <CloudUpload className="h-4 w-4" /> ファイルを選択
          </button>
          {file && (
            <p className="mt-1 text-sm text-gray-600">
              {file.name}({Math.round(file.size / 1024)} KB)
            </p>
          )}
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end px-6 pb-4">
          <button
            type="button"
            className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            disabled={uploading}
            onClick={onUpload}
          >
            {uploading ? (
              <LoaderCircle className="inline-block h-4 w-4 animate-spin" />
            ) : (
              <span className="flex items-center gap-1">アプロード</span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
