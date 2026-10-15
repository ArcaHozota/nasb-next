import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";
import { fontVariables } from "./fonts";

export const metadata: Metadata = {
  title: "NASB1995",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
