// src/lib/redLetter.ts
// RedLetterEditor の「{{...}}」記法 ⇔ 赤字 span の相互変換と、キャレット位置の保存・復元。
// (旧 components/RedLetterEditor.tsx の中にあった関数を、画面から切り離してテストできるようにしたもの)
import { EMPTY_STRING } from "@/lib/constants";

export type Segment = { text: string; red: boolean };

const MARKER_REGEX = /\{\{([\s\S]*?)\}\}/g;

export function parseToSegments(raw: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  MARKER_REGEX.lastIndex = 0;
  while ((m = MARKER_REGEX.exec(raw)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ text: raw.slice(lastIndex, m.index), red: false });
    }
    segments.push({ text: m[1], red: true });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < raw.length) {
    segments.push({ text: raw.slice(lastIndex), red: false });
  }
  if (segments.length === 0) segments.push({ text: EMPTY_STRING, red: false });
  return segments;
}

export function segmentsToRaw(segments: Segment[]): string {
  return segments
    .map((s) => (s.red ? `{{${s.text}}}` : s.text))
    .join(EMPTY_STRING);
}

const BLOCK_TAGS = new Set([
  "DIV",
  "P",
  "LI",
  "UL",
  "OL",
  "BLOCKQUOTE",
  "PRE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "SECTION",
  "ARTICLE",
  "TR",
]);

type CaretPosition = { node: Node; offset: number };
type DomContent = {
  segments: Segment[];
  length: number;
  caretOffset?: number;
  startsWithBlock?: boolean;
  endsWithBlock?: boolean;
};

// 本文とキャレットに同じ変換を使う。Range.toString() は div・br の改行を数えない。
function readDom(container: HTMLElement, caret?: CaretPosition): DomContent {
  const readChildren = (parent: Node, red: boolean): DomContent => {
    const result: DomContent = { segments: [], length: 0 };
    const append = (text: string, isRed: boolean) => {
      if (!text) return;
      const last = result.segments.at(-1);
      if (last?.red === isRed) last.text += text;
      else result.segments.push({ text, red: isRed });
      result.length += text.length;
    };
    let previous: { block: boolean; endsWithBreak: boolean } | undefined;
    const children = Array.from(parent.childNodes);
    children.forEach((node, index) => {
      if (caret?.node === parent && caret.offset === index)
        result.caretOffset = result.length;

      let content: DomContent;
      let block = false;
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? EMPTY_STRING;
        content = {
          segments: [{ text, red }],
          length: text.length,
          caretOffset: caret?.node === node ? caret.offset : undefined,
        };
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        block = BLOCK_TAGS.has(el.tagName);
        if (el.tagName === "BR") {
          // 空行の唯一の br や、末尾の連続 br の最後はブラウザのキャレット用。
          const lineContainer =
            parent === container || BLOCK_TAGS.has(parent.nodeName);
          const placeholder =
            lineContainer &&
            index === children.length - 1 &&
            (index === 0 ||
              children[index - 1]?.nodeName === "BR" ||
              previous?.endsWithBreak);
          content = {
            segments: placeholder ? [] : [{ text: "\n", red }],
            length: placeholder ? 0 : 1,
          };
        } else {
          content = readChildren(
            el,
            red || el.classList.contains("red-letter"),
          );
        }
      } else return;

      // 赤字 span などでブロックが包まれていても、その境界を外側へ引き継ぐ。
      const startsWithBlock = block || !!content.startsWithBlock;
      const endsWithBlock = block || !!content.endsWithBlock;
      if (content.length > 0 || startsWithBlock || endsWithBlock) {
        if (
          previous &&
          (startsWithBlock || previous.block) &&
          !previous.endsWithBreak
        )
          append("\n", red);
        if (!previous) result.startsWithBlock = startsWithBlock;
        result.endsWithBlock = endsWithBlock;
        previous = {
          block: endsWithBlock,
          endsWithBreak: content.segments.at(-1)?.text.endsWith("\n") ?? false,
        };
      }
      if (content.caretOffset !== undefined)
        result.caretOffset = result.length + content.caretOffset;
      content.segments.forEach((segment) => append(segment.text, segment.red));
    });
    if (caret?.node === parent && caret.offset === children.length)
      result.caretOffset = result.length;
    return result;
  };
  return readChildren(container, false);
}

export function domToSegments(container: HTMLElement): Segment[] {
  return readDom(container).segments;
}

export function renderSegments(container: HTMLElement, segments: Segment[]) {
  container.innerHTML = EMPTY_STRING;
  segments.forEach((seg) => {
    if (seg.red) {
      const span = document.createElement("span");
      span.className = "red-letter";
      span.textContent = seg.text;
      container.appendChild(span);
    } else if (seg.text) {
      container.appendChild(document.createTextNode(seg.text));
    }
  });
  // 末尾が改行だけだと、ブラウザが次の入力を前の行へ戻すことがある。
  // 空の最終行にキャレットを置けるよう br を添える(読み取り時は本文に含めない)。
  if (segments.at(-1)?.text.endsWith("\n"))
    container.appendChild(document.createElement("br"));
}

export function getCaretOffset(container: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  return (
    readDom(container, {
      node: range.endContainer,
      offset: range.endOffset,
    }).caretOffset ?? 0
  );
}

export function setCaretOffset(container: HTMLElement, offset: number) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      return;
    }
    remaining -= len;
  }
  const range = document.createRange();
  range.selectNodeContents(container);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

// 指定ノードから container に向かって遡り、red-letter span を探す
export function findRedLetterAncestor(
  node: Node | null,
  container: HTMLElement,
): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== container) {
    if (
      cur.nodeType === Node.ELEMENT_NODE &&
      (cur as HTMLElement).classList.contains("red-letter")
    ) {
      return cur as HTMLElement;
    }
    cur = cur.parentNode;
  }
  return null;
}
