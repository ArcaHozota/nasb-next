import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-plugin-react-hooks v7 で追加された React Compiler 向けのルール。
    // アプリ側のコードではこれらのルールをエラーにする。
    rules: {
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      "react-hooks/purity": "error",
    },
  },
  {
    // shadcn/ui の生成コードは、該当ルールだけを除外して公式版のまま管理する。
    files: ["src/hooks/use-mobile.ts", "src/components/ui/carousel.tsx"],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  {
    files: ["src/components/ui/sidebar.tsx"],
    rules: { "react-hooks/purity": "off" },
  },
  // Playwright の出力(E2E を動かすと作られる HTML レポートなど)はソースではないので対象外
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);
