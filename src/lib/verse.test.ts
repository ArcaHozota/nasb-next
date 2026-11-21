import { describe, expect, it } from "@jest/globals";
import { verseNumberError } from "./verse";

describe("バックエンドと同じ節番号の範囲", () => {
  it.each(["1", "999", " 23 ", "001"])("正しい番号 %s は保存・照会できる", (value) => {
    expect(verseNumberError(value)).toBe("");
  });
  it.each(["abc", "1.5", "-1", "0", "1000", "1e2", "999999999999999999999"])("不正な番号 %s を拒否する", (value) => {
    expect(verseNumberError(value)).toBe("節は1〜999の整数で入力してください。");
  });
  it.each(["", "  "])("未入力 %s には必須メッセージを出す", (value) => {
    expect(verseNumberError(value)).toBe("入力してください。");
  });
});
