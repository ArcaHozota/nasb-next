"use client";

// src/components/RippleButton.tsx
// 波紋効果付きの素の <button>。通常のボタンは shadcn/ui の <Button>(波紋 既定ON)を使い、
// これは「ボタンらしい見た目を持たない」独自デザインの押せる面にだけ使う
// (メインメニューの画像カード、ホームのすりガラス風ページャー)。
import type { ButtonHTMLAttributes } from "react";
import { useRipple } from "@/hooks/use-ripple";
import { cn } from "@/lib/utils";

type RippleButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** 波紋の色。濃い背景なら白系、白系の背景なら黒系の半透明色を指定する */
  rippleColor?: string;
};

export default function RippleButton({
  className,
  rippleColor = "rgba(255, 255, 255, 0.45)",
  onPointerDown,
  children,
  ...rest
}: RippleButtonProps) {
  const { onPointerDown: startRipple, rippleNodes } = useRipple(rippleColor);

  return (
    <button
      {...rest}
      // 呼び出し側が absolute 等を指定していればそちらが優先(cn で後勝ち)
      className={cn("relative overflow-hidden", className)}
      onPointerDown={(e) => {
        startRipple(e);
        onPointerDown?.(e);
      }}
    >
      {children}
      {rippleNodes}
    </button>
  );
}
