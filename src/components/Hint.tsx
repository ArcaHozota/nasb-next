"use client";

// src/components/Hint.tsx
// shadcn/ui の Tooltip を1行で付けるための薄いラッパー(旧 title 属性の置き換え)。
//   <Hint label="プレイリスト作成"><Button …/></Hint>
// 子要素は ref を受け取れる要素(Button / Switch / 素の要素)であること。
// 無効(disabled)なボタンはポインタイベントが発生せずツールチップが出ないため、
// その場合は wrapDisabled で span に包んで、そちらをトリガーにする。
import type { ReactNode } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  label: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  /** 子が disabled になり得るボタンの場合 true(span で包んでホバーを受け取る) */
  wrapDisabled?: boolean;
  /** span で包む時の class(レイアウト調整用) */
  wrapperClassName?: string;
};

export default function Hint({
  label,
  children,
  side = "top",
  wrapDisabled = false,
  wrapperClassName,
}: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {wrapDisabled ? (
          <span className={wrapperClassName ?? "inline-flex"}>{children}</span>
        ) : (
          children
        )}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
