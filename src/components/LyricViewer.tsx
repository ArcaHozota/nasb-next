"use client";

// src/components/LyricViewer.tsx
// ホーム画面の歌詞表示。モバイルは画面下から出るシート、PCは中央のダイアログ。
// 検索した韓国語に一致する部分をハイライトする(歌詞の照合)。
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import Highlighted from "@/components/Highlighted";
import { countHits, lyricQueryOptions } from "@/lib/lyrics";
import { extractErrorMessage } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type LyricTarget = {
  id: number;
  nameJp: string;
  nameKr: string;
  lineNumber: string;
};

function LyricBody({ id, terms }: { id: number; terms: string[] }) {
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

export default function LyricViewer({
  target,
  terms,
  variant,
  onClose,
  contentClassName,
}: {
  /** 表示する曲。null なら閉じている */
  target: LyricTarget | null;
  /** ハイライトする語(検索キーワードを分解したもの) */
  terms: string[];
  /** sheet: モバイル(画面下から) / dialog: PC(中央) */
  variant: "sheet" | "dialog";
  onClose: () => void;
  /** カードと同じすりガラス・色 */
  contentClassName?: string;
}) {
  const open = target !== null;
  const onOpenChange = (o: boolean) => {
    if (!o) onClose();
  };

  if (variant === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className={cn(
            "max-h-[85svh] gap-2 rounded-t-[18px] border-x-0 border-b-0 pb-6",
            contentClassName,
          )}
        >
          {target && (
            <>
              <SheetHeader className="pb-0">
                <SheetTitle className="noto-serif text-inherit">
                  {target.nameJp}
                </SheetTitle>
                <SheetDescription className="noto-serif text-inherit opacity-85">
                  {target.nameKr}
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-0 flex-col gap-2 overflow-y-auto px-4">
                <LyricBody id={target.id} terms={terms} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[80vh] flex-col gap-3 sm:max-w-xl",
          contentClassName,
        )}
      >
        {target && (
          <>
            <DialogHeader>
              <DialogTitle className="noto-serif">{target.nameJp}</DialogTitle>
              <DialogDescription className="noto-serif text-inherit opacity-85">
                {target.nameKr}
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
              <LyricBody id={target.id} terms={terms} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
