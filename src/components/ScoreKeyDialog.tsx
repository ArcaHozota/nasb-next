"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { chordLabel, type ScoreKey } from "@/components/ScoreKeyPopover";

/**
 * 楽譜の調を選ぶ中央ダイアログ(モバイル用)。
 * 開閉は親が管理する。調を選ぶと onSelect を呼んで閉じる。
 */
export default function ScoreKeyDialog({
  open,
  onOpenChange,
  title,
  keys,
  onSelect,
  contentClassName,
  itemClassName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 曲名など(説明文として表示) */
  title?: string;
  keys: ScoreKey[];
  onSelect: (chord: string) => void;
  contentClassName?: string;
  itemClassName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("noto-serif max-w-[min(20rem,calc(100%-2rem))]", contentClassName)}
      >
        <DialogHeader>
          <DialogTitle>調を選択</DialogTitle>
          <DialogDescription className={cn(contentClassName && "text-inherit opacity-85")}>
            {title ?? "ダウンロードする調を選んでください。"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {keys.map((k) => (
            <button
              key={k.chord}
              type="button"
              className={cn(
                "min-h-12 rounded-xl border px-3 py-2 text-lg font-medium transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden",
                itemClassName,
              )}
              onClick={() => {
                onOpenChange(false);
                onSelect(k.chord);
              }}
            >
              {chordLabel(k.chord)}
              {k.isOriginal ? "*" : ""}
            </button>
          ))}
        </div>
        <p className="text-xs opacity-80">* はオリジナルキー</p>
      </DialogContent>
    </Dialog>
  );
}
