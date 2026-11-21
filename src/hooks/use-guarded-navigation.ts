"use client";

import { usePathname, useRouter } from "next/navigation";
import { confirmLeave, needsLeaveConfirm } from "@/lib/confirmLeave";

export function useGuardedNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  function needsConfirmation(href: string) {
    return href.split(/[?#]/, 1)[0] !== pathname && needsLeaveConfirm();
  }

  async function go(href: string) {
    if (!needsConfirmation(href) || (await confirmLeave())) router.push(href);
  }

  return { go, needsConfirmation };
}
