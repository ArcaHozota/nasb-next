"use client";

import { useLayoutEffect, useRef } from "react";

type Direction = "next" | "previous";

type PageCopy = { node: HTMLElement; lyricScroll: number };

export type BookTurn = {
  direction: Direction;
  front: PageCopy;
  underneath: PageCopy;
};

const lyricViewport = "[data-slot=scroll-area-viewport]";

function copyPage(page: HTMLElement): PageCopy {
  const node = page.cloneNode(true) as HTMLElement;
  node.classList.add("book-turn-copy");
  // 表示専用の複製が、実際のページの ID やフォーカスに干渉しないようにする。
  node.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  node.querySelector(".book-pager-progress")?.remove();
  return {
    node,
    lyricScroll: page.querySelector(lyricViewport)?.scrollTop ?? 0,
  };
}

export function captureBookTurn(
  book: HTMLElement | null,
  direction: Direction,
): BookTurn | null {
  const left = book?.querySelector<HTMLElement>(":scope > .book-page--left");
  const right = book?.querySelector<HTMLElement>(":scope > .book-page--right");
  if (!left || !right) return null;
  const [front, underneath] =
    direction === "next" ? [right, left] : [left, right];
  return {
    direction,
    front: copyPage(front),
    underneath: copyPage(underneath),
  };
}

export default function BookPageTurn({
  turn,
  onFinish,
}: {
  turn: BookTurn;
  onFinish: () => void;
}) {
  const frontRef = useRef<HTMLDivElement>(null);
  const underneathRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    for (const [host, copy] of [
      [frontRef.current, turn.front],
      [underneathRef.current, turn.underneath],
    ] as const) {
      host?.replaceChildren(copy.node);
      const viewport = copy.node.querySelector(lyricViewport);
      if (viewport) viewport.scrollTop = copy.lyricScroll;
    }
    // アニメーション終了イベントが届かない場合も、ページ送りを再度使えるようにする。
    const fallback = window.setTimeout(onFinish, 800);
    return () => window.clearTimeout(fallback);
  }, [turn, onFinish]);

  return (
    <div
      className="book-turn"
      data-direction={turn.direction}
      aria-hidden="true"
      inert
    >
      <div className="book-turn-underneath" ref={underneathRef} />
      <div className="book-turn-shadow" />
      <div
        className="book-turn-sheet"
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) onFinish();
        }}
      >
        <div className="book-turn-front" ref={frontRef} />
        <div className="book-turn-back" />
      </div>
    </div>
  );
}
