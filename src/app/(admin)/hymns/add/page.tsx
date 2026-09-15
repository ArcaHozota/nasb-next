"use client";

import { Suspense } from "react";
import HymnFormView from "@/components/HymnFormView";

export default function HymnAddPage() {
  return (
    <Suspense fallback={null}>
      <HymnFormView />
    </Suspense>
  );
}
