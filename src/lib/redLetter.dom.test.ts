/** @jest-environment jsdom */
import { describe, expect, it } from "@jest/globals";
import {
  domToSegments,
  findRedLetterAncestor,
  getCaretOffset,
  parseToSegments,
  renderSegments,
  setCaretOffset,
  segmentsToRaw,
} from "./redLetter";

describe("「{{...}}」記法 ⇔ 区間", () => {
  it("赤字の区間に分け、元の文字列に戻せる", () => {
    const raw = "イエスは言われた。{{わたしは道です。}}そして";
    const segs = parseToSegments(raw);
    expect(segs).toEqual([
      { text: "イエスは言われた。", red: false },
      { text: "わたしは道です。", red: true },
      { text: "そして", red: false },
    ]);
    expect(segmentsToRaw(segs)).toBe(raw);
  });

  it("空文字は空の区間1つ", () => {
    expect(parseToSegments("")).toEqual([{ text: "", red: false }]);
  });
});

describe("DOM との相互変換", () => {
  it.each([
    ["First<div>Second</div>", "First\nSecond"],
    ["<div>First</div><div>Second</div>", "First\nSecond"],
    ["<p>First</p><p>Second</p>", "First\nSecond"],
    ["First<br>Second", "First\nSecond"],
    ["First<div><br></div>", "First\n"],
    ["First<div><br></div><div>Second</div>", "First\n\nSecond"],
    ["<div><br></div><div>Second</div>", "\nSecond"],
    ["<br>", ""],
    ["First<br><br>", "First\n"],
    ["First<br><br><br>", "First\n\n"],
    ["First\n<div>Second</div>", "First\nSecond"],
    [
      "<div><div>First</div><div>Second</div></div><div>Third</div>",
      "First\nSecond\nThird",
    ],
    [
      '<div>First <b><span class="red-letter">red <em>nested</em></span> normal</b></div><p>Last</p>',
      "First {{red nested}} normal\nLast",
    ],
    [
      '<span class="red-letter">First<br><b>Second</b></span>',
      "{{First\nSecond}}",
    ],
    [
      'First<span class="red-letter"><div>Second</div></span>Third',
      "First\n{{Second}}\nThird",
    ],
  ])("改行と入れ子の赤字を保持する: %s", (html, raw) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    const segments = domToSegments(el);
    expect(segmentsToRaw(segments)).toBe(raw);
    renderSegments(el, segments);
    expect(segmentsToRaw(domToSegments(el))).toBe(raw);
  });

  it.each([
    ["First<div>Second</div>", "div", 0, 6],
    ["First<div>Second</div>", "div", 3, 9],
    ["First<br><span>Second</span>", "span", 2, 8],
    ["First<div><br></div>", "div", null, 6],
    [
      '<div>First</div><div><span class="red-letter">Second</span></div>',
      "span",
      2,
      8,
    ],
  ] as const)(
    "キャレット位置にブロックとbrの改行を含める: %s / %s / %s",
    (html, selector, offset, expected) => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      try {
        el.innerHTML = html;
        const target = el.querySelector(selector)!;
        const range = document.createRange();
        range.setStart(
          offset === null ? target : target.firstChild!,
          offset ?? 0,
        );
        range.collapse(true);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        expect(getCaretOffset(el)).toBe(expected);
        renderSegments(el, domToSegments(el));
        setCaretOffset(el, expected);
        expect(getCaretOffset(el)).toBe(expected);
      } finally {
        el.remove();
      }
    },
  );

  it("赤字は span.red-letter になり、DOM から同じ区間に戻る", () => {
    const el = document.createElement("div");
    const segs = parseToSegments("a{{b}}c");
    renderSegments(el, segs);
    expect(el.innerHTML).toBe('a<span class="red-letter">b</span>c');
    expect(domToSegments(el)).toEqual(segs);
  });

  it("赤字 span の中のノードから、その span を見つける", () => {
    const el = document.createElement("div");
    renderSegments(el, parseToSegments("a{{b}}"));
    const span = el.querySelector(".red-letter")!;
    expect(findRedLetterAncestor(span.firstChild, el)).toBe(span);
    expect(findRedLetterAncestor(el.firstChild, el)).toBeNull();
  });
});
