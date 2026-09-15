// src/app/page.tsx
// 旧 router/index.ts の { path: "/", redirect: "/home" } 相当
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/home");
}
