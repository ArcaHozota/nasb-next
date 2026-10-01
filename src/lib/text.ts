// src/lib/text.ts
import { EMPTY_STRING } from "@/lib/constants";

/**
 * 文字列の「表示幅」を計算する。
 * 全角文字(漢字・ひらがな・カタカナ・ハングル・全角記号など)は2、
 * それ以外(半角英数字・半角記号など)は1としてカウントする。
 */
export const getDisplayWidth = (str: string): number => {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) ?? 0;
    const isFullWidth =
      (code >= 0x1100 && code <= 0x115f) || // ハングル字母
      (code >= 0x2e80 && code <= 0x303e) || // CJK部首・記号
      (code >= 0x3041 && code <= 0x33ff) || // ひらがな・カタカナ・CJK記号
      (code >= 0x3400 && code <= 0x4dbf) || // CJK拡張A
      (code >= 0x4e00 && code <= 0x9fff) || // CJK統一漢字
      (code >= 0xac00 && code <= 0xd7a3) || // ハングル音節(韓国語名称)
      (code >= 0xf900 && code <= 0xfaff) || // CJK互換漢字
      (code >= 0xff00 && code <= 0xff60) || // 全角英数・記号
      (code >= 0xffe0 && code <= 0xffe6); // 全角記号
    width += isFullWidth ? 2 : 1;
  }
  return width;
};

/**
 * 賛美歌名称の文字サイズ(表示幅で判定)。
 *  - 33以下(半角33 / 全角16文字まで): 通常サイズ
 *  - 34〜66(全角17文字以上): 0.8倍
 *  - 67以上(半角66超): 0.66倍(2行まで。行数制限は ClampText 側)
 */
export const hymnNameSizeClass = (name: string): string => {
  const width = getDisplayWidth(name ?? EMPTY_STRING);
  if (width > 66) return "text-[0.66em] leading-snug";
  if (width > 33) return "text-[0.8em]";
  return EMPTY_STRING;
};
