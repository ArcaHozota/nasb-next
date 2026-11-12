import { describe, expect, it } from "vitest";
import { accidentalSteps, keyLabel, keySignature } from "./keySignature";

describe("keyLabel", () => {
  it("末尾の b を ♭ にする", () => {
    expect(keyLabel("Bb")).toBe("B♭");
    expect(keyLabel("Gb")).toBe("G♭");
  });

  it("1文字の調はそのまま(B は ♭ にしない)", () => {
    expect(keyLabel("B")).toBe("B");
    expect(keyLabel("C")).toBe("C");
  });
});

describe("keySignature", () => {
  it("調号の種類・数・日本語名を返す", () => {
    expect(keySignature("Gb")).toEqual({
      accidental: "flat",
      count: 6,
      nameJa: "変ト長調",
      label: "G♭",
    });
    expect(keySignature("C")).toMatchObject({ accidental: null, count: 0 });
  });

  it("未知・空の調は null", () => {
    expect(keySignature("X")).toBeNull();
    expect(keySignature("")).toBeNull();
    expect(keySignature(null)).toBeNull();
    expect(keySignature(undefined)).toBeNull();
  });

  it("12長調すべてに調号がある", () => {
    for (const k of ["A", "Ab", "B", "Bb", "C", "D", "Db", "E", "Eb", "F", "G", "Gb"]) {
      expect(keySignature(k), k).not.toBeNull();
    }
  });
});

describe("accidentalSteps", () => {
  it("調号の数だけ、標準の順序で位置を返す", () => {
    expect(accidentalSteps(keySignature("G"))).toEqual([0]);
    expect(accidentalSteps(keySignature("D"))).toEqual([0, 3]);
    expect(accidentalSteps(keySignature("F"))).toEqual([4]);
    expect(accidentalSteps(keySignature("Gb"))).toEqual([4, 1, 5, 2, 6, 3]);
  });

  it("ハ長調・不明な調では空", () => {
    expect(accidentalSteps(keySignature("C"))).toEqual([]);
    expect(accidentalSteps(null)).toEqual([]);
  });
});
