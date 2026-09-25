"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// shadcn/ui の switch.tsx に size="lg" を追加したもの。
// lg は従来の .toggle-switch(60×34px・つまみ26px)と同じ寸法。
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "default" | "lg";
}) {
  const isLg = size === "lg";
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        isLg
          ? "h-8.5 w-15 px-0.75 data-[state=unchecked]:bg-gray-300"
          : "h-[1.15rem] w-8",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background ring-0 transition-transform data-[state=unchecked]:translate-x-0",
          isLg
            ? "size-6.5 shadow-[0_1px_3px_rgba(0,0,0,0.3)] data-[state=checked]:translate-x-6.5"
            : "size-4 data-[state=checked]:translate-x-[calc(100%-2px)]",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
