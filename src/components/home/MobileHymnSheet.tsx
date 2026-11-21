"use client";

import { useRef, type TouchEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, SquarePlay, X } from "lucide-react";
import type { HymnSummary } from "@/api/hymns";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
import KeyStaff from "@/components/home/KeyStaff";
import Highlighted from "@/components/Highlighted";
import { useHymnScore } from "@/hooks/use-hymn-score";
import { downloadScoreOrToast } from "@/lib/download";
import { keyLabel } from "@/lib/keySignature";
import { countHits, lyricQueryOptions } from "@/lib/lyrics";
import { extractErrorMessage } from "@/lib/constants";
import { cn } from "@/lib/utils";

function LyricBody({ id, terms }: { id: string; terms: string[] }) {
  const { data, isPending, error } = useQuery(lyricQueryOptions(id));
  if (isPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="py-6 text-center">
        {extractErrorMessage(error, "歌詞の取得に失敗しました")}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="py-6 text-center opacity-85">歌詞が登録されていません。</p>
    );
  }
  const hits = countHits(data, terms);
  return (
    <>
      {terms.length > 0 && (
        <p className="text-xs opacity-85" aria-live="polite">
          {hits > 0
            ? `「${terms.join("・")}」に一致: ${hits}箇所`
            : `「${terms.join("・")}」は歌詞に含まれていません(歌詞が似ている曲として表示)`}
        </p>
      )}
      <div className="lyric-text noto-serif">
        <Highlighted text={data} terms={terms} />
      </div>
    </>
  );
}

function Scores({ id }: { id: string }) {
  const {
    keysQuery,
    keys,
    chord,
    isOriginal,
    staffState,
    setPicked,
    download,
  } = useHymnScore(id, downloadScoreOrToast);
  return (
    <div className="flex flex-col gap-2">
      {keys.length > 0 && (
        <ToggleGroup
          aria-label="調を選ぶ"
          className="flex-wrap gap-1"
          value={chord ? [chord] : []}
          onValueChange={([value]) => {
            if (value) setPicked(value);
          }}
        >
          {keys.map((key) => (
            <ToggleGroupItem
              key={key.chord}
              value={key.chord}
              className="rounded-md! border border-white/45 bg-white/10 text-inherit hover:bg-white/25 hover:text-inherit data-pressed:bg-white data-pressed:text-primary"
            >
              {keyLabel(key.chord)}
              {key.isOriginal ? "＊" : ""}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      {keys.some((key) => key.isOriginal) && (
        <span className="text-xs">＊オリジナルキー</span>
      )}
      {keysQuery.error && (
        <p role="status">
          {extractErrorMessage(keysQuery.error, "楽譜の確認に失敗しました")}
        </p>
      )}
      <KeyStaff
        chord={chord}
        isOriginal={isOriginal}
        state={staffState}
        className="gap-2 text-inherit hover:bg-white/20 hover:text-inherit disabled:text-inherit disabled:opacity-70 [&>svg]:w-1/2 [&>svg]:shrink-0"
        onDownload={() => void download()}
      />
    </div>
  );
}

const SWIPE_DISTANCE = 60;

export default function MobileHymnSheet({
  target,
  position,
  total,
  terms,
  canNext,
  onStep,
  onClose,
  className,
}: {
  target: HymnSummary | undefined;
  position: number;
  total: number;
  terms: string[];
  canNext: boolean;
  onStep: (direction: -1 | 1) => void;
  onClose: () => void;
  className?: string;
}) {
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const startSwipe = (event: TouchEvent) => {
    const touch = event.touches[0];
    swipe.current =
      event.touches.length === 1 && touch
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };
  const endSwipe = (event: TouchEvent, handle = false) => {
    const start = swipe.current;
    swipe.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (handle && dy > SWIPE_DISTANCE && dy > Math.abs(dx)) onClose();
    if (
      !handle &&
      Math.abs(dx) > SWIPE_DISTANCE &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      onStep(dx < 0 ? 1 : -1);
    }
  };

  return (
    <Sheet
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn(
          "h-[85svh]! gap-0 rounded-t-[18px] border-x-0 border-b-0 pb-3",
          className,
        )}
      >
        {target && (
          <>
            <div
              data-hymn-sheet-handle
              className="flex h-7 shrink-0 touch-none justify-center pt-2"
              onTouchStart={startSwipe}
              onTouchEnd={(event) => endSwipe(event, true)}
              onTouchCancel={() => {
                swipe.current = null;
              }}
            >
              <span
                className="h-1 w-10 rounded-full bg-white/60"
                aria-hidden="true"
              />
            </div>
            <div className="flex items-center justify-center gap-2 px-4">
              <Button
                aria-label="前の曲"
                variant="ghost"
                size="icon-sm"
                disabled={position <= 1}
                onClick={() => onStep(-1)}
              >
                <ChevronLeft />
              </Button>
              <span aria-live="polite">
                {position} / {total}曲
              </span>
              <Button
                aria-label="次の曲"
                variant="ghost"
                size="icon-sm"
                disabled={!canNext}
                onClick={() => onStep(1)}
              >
                <ChevronRight />
              </Button>
              <SheetClose
                render={
                  <Button
                    aria-label="閉じる"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-3 right-3"
                  />
                }
              >
                <X />
              </SheetClose>
            </div>
            <div
              key={target.id}
              data-hymn-sheet-body
              className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
              onTouchStart={startSwipe}
              onTouchEnd={endSwipe}
              onTouchCancel={() => {
                swipe.current = null;
              }}
            >
              <SheetHeader>
                <SheetTitle className="noto-serif text-inherit">
                  {target.nameJp}
                </SheetTitle>
                <SheetDescription className="noto-serif text-inherit opacity-85">
                  {target.nameKr}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-3 px-4">
                {target.link && (
                  <a
                    href={target.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "w-fit border border-white/45 hover:bg-white/25 hover:text-inherit",
                    )}
                  >
                    <SquarePlay />
                    YouTubeで聴く
                  </a>
                )}
                <Scores id={target.id} />
                <LyricBody id={target.id} terms={terms} />
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
