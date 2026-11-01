"use client";

// src/components/ScoreKeyPopover.tsx
// 楽譜アイコンの「調を選ぶふきだし」(賛美歌一覧・ホームのPC版で共通)。
// 楽譜が1件(以下)ならそのままダウンロード、複数あるときはアイコンの横にふきだしを出し、
// 調を選んでダウンロードする。オリジナルキーは「Ab*」のように星を付ける。
// ふきだしは shadcn/ui の Popover(Portal)なので、テーブル等の overflow-hidden に切られない。
// 位置はアイコン要素(PopoverAnchor + virtualRef)に合わせる。トリガーは非同期で調を取得してから
// 開く必要があるため、DropdownMenu(トリガーが開閉を握る)ではなく Popover を使っている。
// 見た目は呼び出し側の className で上書きできる(管理画面=白、ホーム=ガラス風)。
import { useRef, useState, type ReactNode } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
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
  id: number;
  /** 調の一覧を取得する(失敗時は null を返す。エラー表示は呼び出し側) */
  fetchKeys: (id: number) => Promise<ScoreKey[] | null>;
  /** ダウンロードする。chord 省略時はサーバーがオリジナルキー優先で1件選ぶ */
  download: (id: number, chord?: string) => Promise<void>;
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
  const anchorEl = useRef<HTMLElement | null>(null);

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
    <Popover open={open} onOpenChange={setOpen}>
      {children({
        onClick,
        loading,
        open,
        anchorRef: (el) => {
          anchorEl.current = el;
        },
      })}
      {/* アイコン要素そのものを位置の基準にする(ref を呼び出し側から受け取る) */}
      <PopoverAnchor
        virtualRef={
          anchorEl as unknown as React.ComponentProps<
            typeof PopoverAnchor
          >["virtualRef"]
        }
      />
      <PopoverContent
        side={side}
        align={align}
        sideOffset={10}
        collisionPadding={8}
        className={cn(
          "noto-serif w-auto min-w-20 rounded-2xl border-gray-200 bg-white p-1.5 text-gray-700 shadow-lg",
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
                rippleColor="rgba(128, 0, 32, 0.2)"
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
        <PopoverPrimitive.Arrow
          className={cn("fill-white", arrowClassName)}
          width={14}
          height={7}
        />
      </PopoverContent>
    </Popover>
  );
}
