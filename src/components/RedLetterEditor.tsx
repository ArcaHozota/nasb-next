"use client";

// src/components/RedLetterEditor.tsx
// 旧 components/RedLetterEditor.vue を移植。
// contentEditableな<div>に対してDOM操作で「{{...}}」記法⇔赤字spanを相互変換する。
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { EMPTY_STRING } from "@/lib/constants";

type Segment = { text: string; red: boolean };

const MARKER_REGEX = /\{\{([\s\S]*?)\}\}/g;

function parseToSegments(raw: string): Segment[] {
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

function segmentsToRaw(segments: Segment[]): string {
  return segments
    .map((s) => (s.red ? `{{${s.text}}}` : s.text))
    .join(EMPTY_STRING);
}

function domToSegments(container: HTMLElement): Segment[] {
  const segments: Segment[] = [];
  container.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      segments.push({ text: node.textContent ?? EMPTY_STRING, red: false });
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      segments.push({
        text: el.textContent ?? EMPTY_STRING,
        red: el.classList.contains("red-letter"),
      });
    }
  });
  return segments;
}

function renderSegments(container: HTMLElement, segments: Segment[]) {
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
}

function getCaretOffset(container: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const pre = range.cloneRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.endContainer, range.endOffset);
  return pre.toString().length;
}

function setCaretOffset(container: HTMLElement, offset: number) {
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
function findRedLetterAncestor(
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

export type RedLetterEditorHandle = {
  wrapSelection: () => void;
};

type RedLetterEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  minHeight?: number;
};

const RedLetterEditor = forwardRef<RedLetterEditorHandle, RedLetterEditorProps>(
  function RedLetterEditor(
    { value, onChange, placeholder, error, helperText, minHeight = 84 },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    // Reactではuserefで持つインスタンス変数(再レンダーを起こさない)
    const skipNextSync = useRef(false);
    const isComposing = useRef(false);
    const mounted = useRef(false);

    // 外部からのvalue変更(初期化・保存後のクリアなど)の時だけDOMを作り直す
    useEffect(() => {
      if (skipNextSync.current) {
        skipNextSync.current = false;
        return;
      }
      const el = containerRef.current;
      if (!el) return;
      renderSegments(el, parseToSegments(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // 初回マウント時にも描画する(旧 watch(..., {immediate:true}) 相当)
    useEffect(() => {
      if (mounted.current) return;
      mounted.current = true;
      const el = containerRef.current;
      if (!el) return;
      renderSegments(el, parseToSegments(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const reconcile = () => {
      const el = containerRef.current;
      if (!el) return;
      const caret = getCaretOffset(el);
      const segments = domToSegments(el);
      const raw = segmentsToRaw(segments);
      skipNextSync.current = true;
      onChange(raw);
      requestAnimationFrame(() => {
        if (!containerRef.current) return;
        renderSegments(containerRef.current, segments);
        setCaretOffset(containerRef.current, caret);
      });
    };

    const onInput = () => {
      if (!isComposing.current) reconcile();
    };

    const onCompositionStart = () => {
      isComposing.current = true;
    };

    const onCompositionEnd = () => {
      isComposing.current = false;
      reconcile();
    };

    useImperativeHandle(ref, () => ({
      wrapSelection: () => {
        const el = containerRef.current;
        const sel = window.getSelection();
        if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
        const range = sel.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return;

        // 選択範囲がすでに1つの赤文字spanと一致する場合は、通常の文字列に戻す(トグル解除)
        const startSpan = findRedLetterAncestor(range.startContainer, el);
        const endSpan = findRedLetterAncestor(range.endContainer, el);
        if (startSpan && startSpan === endSpan) {
          const textNode = document.createTextNode(
            startSpan.textContent ?? EMPTY_STRING,
          );
          startSpan.parentNode?.replaceChild(textNode, startSpan);
          const newRange = document.createRange();
          newRange.setStart(textNode, textNode.length);
          newRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(newRange);
          reconcile();
          return;
        }

        const span = document.createElement("span");
        span.className = "red-letter";
        span.appendChild(range.extractContents());
        range.insertNode(span);
        const newRange = document.createRange();
        newRange.setStartAfter(span);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        reconcile();
      },
    }));

    return (
      <div>
        <div
          ref={containerRef}
          contentEditable
          data-placeholder={placeholder}
          className={`noto-serif red-letter-editor ${error ? "is-error" : EMPTY_STRING}`}
          style={{ minHeight: `${minHeight}px` }}
          onInput={onInput}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          suppressContentEditableWarning
        />
        {helperText && (
          <p className={`mt-1 text-xs ${error ? "text-red-700" : "text-gray-600"}`}>
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

export default RedLetterEditor;
