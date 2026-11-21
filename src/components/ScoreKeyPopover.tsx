"use client";

// src/components/ScoreKeyPopover.tsx
// 賛美歌一覧の楽譜アイコンから「調を選ぶふきだし」を出す。
// 楽譜が1件(以下)ならそのままダウンロード、複数あるときはアイコンの横にふきだしを出し、
// 調を選んでダウンロードする。オリジナルキーは「Ab*」のように星を付ける。
// Base UI の Popover を Portal に描画し、取得完了後に楽譜アイコンを基準に開く。
import { useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Button } from "@/components/ui/button";
import { EMPTY_STRING } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** 楽譜が登録されている調(isOriginal はオリジナルキー) */
export type ScoreKey = { chord: string; isOriginal: boolean };

/** 画面表示用の調名(DB・通信は ASCII の Ab 等、表示だけ A♭ にする) */
export const chordLabel = (chord: string) => chord.replace(/b$/, "♭");

type TriggerProps = {
  /** アイコンの onClick に渡す */
  onClick: (e: React.MouseEvent) => void;
  /** 調の一覧を取得中 */
  loading: boolean;
  /** ふきだしが開いているか */
  open: boolean;
  /** アイコン要素の ref に渡す(ふきだしの位置合わせ用) */
  anchorRef: (el: HTMLElement | null) => void;
};

type Props = {
  id: string;
  /** 調の一覧を取得する(失敗時は null を返す。エラー表示は呼び出し側) */
  fetchKeys: (id: string) => Promise<ScoreKey[] | null>;
  /** ダウンロードする。chord 省略時はサーバーがオリジナルキー優先で1件選ぶ */
  download: (id: string, chord?: string) => Promise<void>;
  /** アイコン部分を描画する */
  children: (props: TriggerProps) => ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  contentClassName?: string;
  arrowClassName?: string;
  itemClassName?: string;
};

export default function ScoreKeyPopover({
  id,
  fetchKeys,
  download,
  children,
  side = "right",
  align = "center",
  contentClassName,
  arrowClassName,
  itemClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<ScoreKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const list = await fetchKeys(id);
      if (list === null) return; // 取得失敗(エラー表示済み)
      if (list.length > 1) {
        setKeys(list);
        setOpen(true);
      } else {
        await download(id); // 0件・1件: 今まで通り直接ダウンロード
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {children({
        onClick,
        loading,
        open,
        anchorRef: setAnchorEl,
      })}
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchorEl}
          side={side}
          align={align}
          sideOffset={10}
          collisionPadding={8}
          className="isolate z-50"
        >
          <Popover.Popup
            aria-label="楽譜の調を選ぶ"
            className={cn(
              "noto-serif min-w-20 origin-(--transform-origin) rounded-2xl bg-white p-1.5 text-gray-700 shadow-lg ring-1 ring-gray-200 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              contentClassName,
            )}
          >
            <ul role="menu" className="flex flex-col">
              {keys.map((k) => (
                <li key={k.chord} role="none">
                  <Button
                    type="button"
                    variant="ghost"
                    role="menuitem"
                    className={cn(
                      "h-auto w-full rounded-lg px-5 py-1.5 text-center hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:ring-0",
                      itemClassName,
                    )}
                    onClick={() => {
                      setOpen(false);
                      void download(id, k.chord);
                    }}
                  >
                    {chordLabel(k.chord)}
                    {k.isOriginal ? "*" : EMPTY_STRING}
                  </Button>
                </li>
              ))}
            </ul>
            <Popover.Arrow
              className={cn(
                "size-2.5 rotate-45 bg-white data-[side=top]:-bottom-1 data-[side=bottom]:-top-1 data-[side=left]:-right-1 data-[side=right]:-left-1",
                arrowClassName,
              )}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
