"use client";

// src/hooks/use-ripple.tsx
// Vuetify風の波紋(クリック位置から円が広がりフェードアウトする)効果。
// shadcn/ui の Button(ripple 既定ON)と、カード型の RippleButton の両方がこのフックを使う。
// 見た目は globals.css の .ripple / @keyframes ripple-effect。
import {
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type RippleItem = { id: number; x: number; y: number; size: number };

let rippleIdSeq = 0;

export function useRipple(color: string) {
  const [ripples, setRipples] = useState<RippleItem[]>([]);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // ボタンの縦横どちらが大きくても確実に覆えるよう、長辺の2倍を直径にする
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = ++rippleIdSeq;
    setRipples((prev) => [...prev, { id, x, y, size }]);
  }, []);

  const rippleNodes = ripples.map((r) => (
    <span
      key={r.id}
      aria-hidden="true"
      className="ripple"
      style={{
        left: r.x,
        top: r.y,
        width: r.size,
        height: r.size,
        backgroundColor: color,
      }}
      onAnimationEnd={() =>
        setRipples((prev) => prev.filter((p) => p.id !== r.id))
      }
    />
  ));

  return { onPointerDown, rippleNodes };
}
