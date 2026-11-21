"use client";

// src/components/RedLetterEditor.tsx
// 旧 components/RedLetterEditor.vue を移植。
// contentEditableな<div>に対してDOM操作で「{{...}}」記法⇔赤字spanを相互変換する。
import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from "react";
import { EMPTY_STRING } from "@/lib/constants";

import {
  parseToSegments,
  renderSegments,
  domToSegments,
  segmentsToRaw,
  getCaretOffset,
  setCaretOffset,
  findRedLetterAncestor,
} from "@/lib/redLetter";

export type RedLetterEditorHandle = {
  wrapSelection: () => void;
};

type RedLetterEditorProps = {
  value: string;
  label: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  helperText?: string;
  minHeight?: number;
};

const RedLetterEditor = forwardRef<RedLetterEditorHandle, RedLetterEditorProps>(
  function RedLetterEditor(
    {
      value,
      label,
      disabled,
      onChange,
      placeholder,
      error,
      helperText,
      minHeight = 84,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const helperId = useId();
    const isComposing = useRef(false);

    useEffect(() => {
      const el = containerRef.current;
      if (el && segmentsToRaw(domToSegments(el)) !== value)
        renderSegments(el, parseToSegments(value));
    }, [value]);

    const reconcile = () => {
      const el = containerRef.current;
      if (!el || disabled) return;
      const caret = getCaretOffset(el);
      const segments = domToSegments(el);
      renderSegments(el, segments);
      if (document.activeElement === el) setCaretOffset(el, caret);
      onChange(segmentsToRaw(segments));
    };

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const onBreak = (event: InputEvent) => {
        if (
          disabled ||
          event.isComposing ||
          isComposing.current ||
          event.inputType !== "insertLineBreak"
        )
          return;
        const selection = window.getSelection();
        if (!selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return;
        event.preventDefault();
        range.deleteContents();
        const newline = document.createTextNode("\n");
        range.insertNode(newline);
        range.setStartAfter(newline);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      el.addEventListener("beforeinput", onBreak);
      return () => el.removeEventListener("beforeinput", onBreak);
    }, [disabled]);

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
        if (disabled || !el || !sel || sel.rangeCount === 0 || sel.isCollapsed)
          return;
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
          contentEditable={!disabled}
          aria-disabled={disabled}
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          aria-invalid={!!error}
          aria-describedby={helperText ? helperId : undefined}
          data-placeholder={placeholder}
          className={`noto-serif red-letter-editor ${error ? "is-error" : EMPTY_STRING}`}
          style={{ minHeight: `${minHeight}px` }}
          onInput={onInput}
          onCompositionStart={onCompositionStart}
          onCompositionEnd={onCompositionEnd}
          suppressContentEditableWarning
        />
        {helperText && (
          <p
            id={helperId}
            className={`mt-1 text-xs ${error ? "text-red-700" : "text-gray-600"}`}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

export default RedLetterEditor;
