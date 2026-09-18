"use client";

// src/components/RippleButton.tsx
// Vuetifyのボタンにあるリップル(クリック位置から円が広がりフェードアウトする)効果を
// Tailwindのプロジェクト構成のまま再現するための薄いラッパー。
// 見た目(className)は既存の<button>と同じものをそのまま渡せる。
import {
  useCallback,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";

type RippleItem = {
  id: number;
  x: number;
  y: number;
  size: number;
};

let rippleIdSeq = 0;

type RippleButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * 波紋の色。ボタン背景が濃い色(primary/secondaryの塗り)なら白系、
   * 背景が白系(枠線ボタンやテキストボタン)なら黒系の半透明色を指定する。
   */
  rippleColor?: string;
};

export default function RippleButton({
  className = "",
  rippleColor = "rgba(255, 255, 255, 0.45)",
  onPointerDown,
  children,
  ...rest
}: RippleButtonProps) {
  const [ripples, setRipples] = useState<RippleItem[]>([]);

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const target = e.currentTarget;
      const rect = target.getBoundingClientRect();
      // ボタンの縦横どちらが大きくても確実に覆えるよう、長辺の2倍を直径にする
      const size = Math.max(rect.width, rect.height) * 2;
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const id = ++rippleIdSeq;
      setRipples((prev) => [...prev, { id, x, y, size }]);
      onPointerDown?.(e);
    },
    [onPointerDown],
  );

  return (
    <button
      {...rest}
      className={`relative overflow-hidden ${className}`}
      onPointerDown={handlePointerDown}
    >
      {children}
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden="true"
          className="ripple"
          style={{
            left: r.x,
            top: r.y,
            width: r.size,
            height: r.size,
            backgroundColor: rippleColor,
          }}
          onAnimationEnd={() => removeRipple(r.id)}
        />
      ))}
    </button>
  );
}
