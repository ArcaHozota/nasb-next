import { describe, expect, it } from "vitest";
import { countHits, extractTerms, splitByTerms } from "./lyrics";

describe("extractTerms", () => {
  it("& で区切り、前後の空白と重複を除く", () => {
    expect(extractTerms(" 愛 & 恵み && 愛 ")).toEqual(["愛", "恵み"]);
  });

  it("先頭の絞り込み記号(* ★ #)を外す", () => {
    expect(extractTerms("*愛")).toEqual(["愛"]);
    expect(extractTerms("★恵み")).toEqual(["恵み"]);
    expect(extractTerms("#主")).toEqual(["主"]);
  });

  it("空の入力では語が無い", () => {
    expect(extractTerms("")).toEqual([]);
    expect(extractTerms(" & ")).toEqual([]);
  });

  it("NFD のハングルを NFC にそろえる", () => {
    const nfd = "사랑".normalize("NFD");
    expect(extractTerms(nfd)).toEqual(["사랑"]);
  });
});

describe("splitByTerms", () => {
  it("語が無ければ全体を一致なしで返す", () => {
    expect(splitByTerms("Amazing Grace", [])).toEqual([
      { text: "Amazing Grace", hit: false },
    ]);
  });

  it("大文字・小文字を区別せずに一致部分を分ける", () => {
    expect(splitByTerms("Amazing Grace", ["grace"])).toEqual([
      { text: "Amazing ", hit: false },
      { text: "Grace", hit: true },
    ]);
  });

  it("長い語を優先して、短い語に一部だけ食われない", () => {
    expect(splitByTerms("主イエスの愛", ["主", "主イエス"])).toEqual([
      { text: "主イエス", hit: true },
      { text: "の愛", hit: false },
    ]);
  });

  it("正規表現の記号を含む語もそのまま照合する", () => {
    expect(splitByTerms("a+b (c)", ["(c)"])).toEqual([
      { text: "a+b ", hit: false },
      { text: "(c)", hit: true },
    ]);
  });
});

describe("countHits", () => {
  it("一致した箇所の数を数える", () => {
    expect(countHits("愛は愛を呼ぶ愛", ["愛"])).toBe(3);
    expect(countHits("恵み", ["愛"])).toBe(0);
  });
});
