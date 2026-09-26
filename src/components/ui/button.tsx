"use client";

// shadcn/ui の button.tsx(new-york-v4)をベースに、このアプリ向けに以下を追加:
//  - variant: success(緑) / warning(黄) / neutral(灰) … 従来の配色に合わせたボタン色
//  - ripple: Vuetify風の波紋効果(既定ON)。asChild の時は子要素を差し込めないため無効。
import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { useRipple } from "@/hooks/use-ripple";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
        // ↓ このアプリで追加
        success: "bg-success text-white hover:bg-success/90",
        warning: "bg-warning text-gray-900 hover:bg-warning/90",
        neutral: "bg-gray-500 text-white hover:bg-gray-500/90",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

// 塗りつぶし系のボタンは白い波紋、それ以外(枠線・透明)は黒っぽい波紋
const LIGHT_RIPPLE = "rgba(255, 255, 255, 0.45)";
const DARK_RIPPLE = "rgba(0, 0, 0, 0.12)";
const FILLED_VARIANTS = new Set([
  "default",
  "destructive",
  "secondary",
  "success",
  "neutral",
]);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ripple = true,
  rippleColor,
  onPointerDown,
  children,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** 波紋効果(既定: true)。asChild の時は常に無効 */
    ripple?: boolean;
    /** 波紋の色(省略時は variant から自動で決める) */
    rippleColor?: string;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  const withRipple = ripple && !asChild;
  const { onPointerDown: startRipple, rippleNodes } = useRipple(
    rippleColor ??
      (FILLED_VARIANTS.has(variant ?? "default") ? LIGHT_RIPPLE : DARK_RIPPLE),
  );

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        // 波紋をボタン内に収める。呼び出し側が absolute 等を指定した場合はそちらが優先(cn で後勝ち)
        withRipple && "relative overflow-hidden",
        buttonVariants({ variant, size }),
        className,
      )}
      onPointerDown={(e: React.PointerEvent<HTMLButtonElement>) => {
        if (withRipple) startRipple(e);
        onPointerDown?.(e);
      }}
      {...props}
    >
      {children}
      {withRipple && rippleNodes}
    </Comp>
  );
}

export { Button, buttonVariants };
