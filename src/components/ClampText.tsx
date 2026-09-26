"use client";

// src/components/ClampText.tsx
// 最大 n 行で「…」省略するテキスト。実際に省略されている時だけ、ホバーで全文をツールチップ表示する
// (省略されていない短い名称にまでツールチップが出るとうるさいため)。
import { useRef, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export default function ClampText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        const el = ref.current;
        // 開こうとした時だけ、はみ出しているか(=省略されているか)を測る
        setOpen(next && !!el && el.scrollHeight > el.clientHeight + 1);
      }}
    >
      <TooltipTrigger asChild>
        <span ref={ref} className={cn("line-clamp-2", className)}>
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">{text}</TooltipContent>
    </Tooltip>
  );
}
