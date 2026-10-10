"use client";

// src/components/ScoreKeyPopover.tsx
// 楽譜アイコンの「調を選ぶふきだし」(賛美歌一覧・ホームのPC版で共通)。
// 楽譜が1件(以下)ならそのままダウンロード、複数あるときはアイコンの横にふきだしを出し、
// 調を選んでダウンロードする。オリジナルキーは「Ab*」のように星を付ける。
// ふきだしは Popover(Portal)なので、テーブル等の overflow-hidden に切られない。
// 見た目は呼び出し側の className で上書きできる(管理画面=白、ホーム=ガラス風)。
import { useRef, useState, type ReactNode } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
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
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      {children({
        onClick,
        loading,
        open,
        anchorRef: (el) => {
          anchorEl.current = el;
        },
      })}
      {/* アイコン要素そのものを位置の基準にする(ref を呼び出し側から受け取る) */}
      <PopoverPrimitive.Anchor
        virtualRef={
          anchorEl as unknown as React.ComponentProps<
            typeof PopoverPrimitive.Anchor
          >["virtualRef"]
        }
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align={align}
          sideOffset={10}
          collisionPadding={8}
          className={cn(
            "noto-serif z-50 min-w-20 rounded-2xl border border-gray-200 bg-white p-1.5 shadow-lg outline-none",
            contentClassName,
          )}
        >
          <ul role="menu" className="flex flex-col">
            {keys.map((k) => (
              <li key={k.chord} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={cn(
                    "block w-full rounded-lg px-5 py-1.5 text-center text-sm font-medium text-gray-700 hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:outline-none",
                    itemClassName,
                  )}
                  onClick={() => {
                    setOpen(false);
                    void download(id, k.chord);
                  }}
                >
                  {chordLabel(k.chord)}
                  {k.isOriginal ? "*" : EMPTY_STRING}
                </button>
              </li>
            ))}
          </ul>
          <PopoverPrimitive.Arrow
            className={cn("fill-white", arrowClassName)}
            width={14}
            height={7}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
