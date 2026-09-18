import type { Metadata } from "next";
// @ts-expect-error Next.js handles CSS side-effect imports at build time.
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "NASB1995",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
