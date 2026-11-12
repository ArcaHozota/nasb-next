import { describe, expect, it } from "vitest";
import { getPageItems } from "./pagination";

describe("getPageItems", () => {
  it("総ページ数が少なければ全ページを並べる", () => {
    expect(getPageItems(1, 1)).toEqual([1]);
    expect(getPageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("中央にいるときは両側を省略する(siblingCount=1)", () => {
    expect(getPageItems(5, 20)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 20]);
  });

  it("先頭・末尾に寄っていても同じ個数が並ぶ", () => {
    expect(getPageItems(1, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
    expect(getPageItems(20, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
  });

  it("1ページ分しか隠さない省略は番号のまま出す", () => {
    // 1 … 3 にはせず 1 2 3 にする
    expect(getPageItems(4, 20)).toEqual([1, 2, 3, 4, 5, "ellipsis", 20]);
    expect(getPageItems(17, 20)).toEqual([1, "ellipsis", 16, 17, 18, 19, 20]);
  });

  it("siblingCount=2 では前後2ページずつ出す", () => {
    expect(getPageItems(10, 20, 2)).toEqual([
      1,
      "ellipsis",
      8,
      9,
      10,
      11,
      12,
      "ellipsis",
      20,
    ]);
  });
});
