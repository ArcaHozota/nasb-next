import { describe, expect, it } from "vitest";
import { hymnNameSizeClass } from "./text";

describe("hymnNameSizeClass", () => {
  it("表示幅33以下は通常サイズ", () => {
    expect(hymnNameSizeClass("賛美")).toBe("");
    expect(hymnNameSizeClass("漢".repeat(16))).toBe(""); // 幅32
    expect(hymnNameSizeClass("a".repeat(33))).toBe("");
  });

  it("表示幅34〜66は0.8倍", () => {
    expect(hymnNameSizeClass("漢".repeat(17))).toBe("text-[0.8em]"); // 幅34
    expect(hymnNameSizeClass("가".repeat(33))).toBe("text-[0.8em]"); // ハングル 幅66
  });

  it("表示幅67以上は0.66倍", () => {
    expect(hymnNameSizeClass("a".repeat(67))).toBe(
      "text-[0.66em] leading-snug",
    );
  });
});
