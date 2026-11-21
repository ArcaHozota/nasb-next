"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMobileViewport } from "@/hooks/use-mobile-viewport";
import { useFeedbackStore } from "@/stores/feedback";

export default function PcOnly({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useMobileViewport();
  const [entry, setEntry] = useState<{ pathname: string; blocked: boolean }>();

  // 画面を開くときだけ判定し、表示後に画面幅が変わっても入力を維持する。
  if (isMobile !== null && entry?.pathname !== pathname) {
    setEntry({ pathname, blocked: isMobile });
  }

  const blocked = entry?.pathname === pathname && entry.blocked;
  useEffect(() => {
    if (!blocked) return;
    useFeedbackStore.getState().toast("管理画面はPCからご利用ください。");
    router.replace("/home");
  }, [blocked, router]);

  return entry?.pathname === pathname && !blocked ? children : null;
}
