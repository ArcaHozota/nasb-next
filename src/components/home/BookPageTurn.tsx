"use client";

// src/components/home/BookPageTurn.tsx
// PC版ホームの「前」「次」で紙をめくる演出。軽く動くよう、2段階で回すだけにしている。
//   前半: めくる紙の表(めくる前のページ)が、綴じ目を軸に起き上がって真横を向く。
//   後半: 紙の裏(めくった先の新しいページ)が、真横から反対側のページへ倒れて着地する。
// 動かすのは2枚の transform(CSS のアニメーション)だけで、ページの複製も3枚(表・裏・着地側の旧ページ)。
// 表と裏を別の要素にしているので、左右のページ幅が違って(454:736)も、紙が縮んで見えることはない。
// 実際のページは、この演出の下で先に新しいページへ差し替わっている。演出が終わると取り除く。
import { useLayoutEffect, useRef } from "react";

type Direction = "next" | "previous";

type PageCopy = { node: HTMLElement; lyricScroll: number };

export type BookTurn = {
  direction: Direction;
  /** めくる紙の表(めくる前のページ) */
  front: PageCopy;
  /** 紙が着地する側の、めくる前のページ(紙が倒れて覆うまで見えている) */
  underneath: PageCopy;
};

const lyricViewport = "[data-slot=scroll-area-viewport]";
/** 前半と後半を合わせた時間(globals.css の --turn-duration と同じ) */
const TURN_DURATION_MS = 760;

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

function livePages(book: HTMLElement | null) {
  const left = book?.querySelector<HTMLElement>(":scope > .book-page--left");
  const right = book?.querySelector<HTMLElement>(":scope > .book-page--right");
  return left && right ? { left, right } : null;
}

export function captureBookTurn(
  book: HTMLElement | null,
  direction: Direction,
): BookTurn | null {
  const pages = livePages(book);
  if (!pages) return null;
  const [front, underneath] =
    direction === "next"
      ? [pages.right, pages.left]
      : [pages.left, pages.right];
  return { direction, front: copyPage(front), underneath: copyPage(underneath) };
}

/** 複製したページを host に入れる(歌詞のスクロール位置も合わせる) */
function place(host: HTMLElement | null, copy: PageCopy) {
  if (!host) return;
  host.replaceChildren(copy.node);
  const viewport = copy.node.querySelector(lyricViewport);
  if (viewport) viewport.scrollTop = copy.lyricScroll;
}

/** 要素を、ページと同じ位置・大きさに重ねる */
function cover(el: HTMLElement | null, page: HTMLElement) {
  if (!el) return;
  Object.assign(el.style, {
    top: `${page.offsetTop}px`,
    left: `${page.offsetLeft}px`,
    width: `${page.offsetWidth}px`,
    height: `${page.offsetHeight}px`,
  });
}

export default function BookPageTurn({
  turn,
  bookRef,
  onFinish,
}: {
  turn: BookTurn;
  bookRef: React.RefObject<HTMLDivElement | null>;
  onFinish: () => void;
}) {
  const underneathRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const onFinishRef = useRef(onFinish);
  useLayoutEffect(() => {
    onFinishRef.current = onFinish;
  });

  useLayoutEffect(() => {
    const pages = livePages(bookRef.current);
    if (!pages) {
      onFinishRef.current();
      return;
    }
    const next = turn.direction === "next";
    // 表はめくる前のページの位置、裏と着地側の旧ページはめくった先(反対側)のページの位置
    const [from, to] = next
      ? [pages.right, pages.left]
      : [pages.left, pages.right];
    cover(frontRef.current, from);
    cover(backRef.current, to);
    cover(underneathRef.current, to);
    place(frontRef.current, turn.front);
    // 裏は、下で既に差し替わっている新しいページを複製する
    place(backRef.current, copyPage(to));
    place(underneathRef.current, turn.underneath);

    // 画面が裏に回るなどでアニメーションの終了が届かなくても、ページ送りを再び使えるようにする
    const fallback = window.setTimeout(
      () => onFinishRef.current(),
      TURN_DURATION_MS + 400,
    );
    return () => window.clearTimeout(fallback);
  }, [turn, bookRef]);

  return (
    <div
      className="book-turn"
      data-direction={turn.direction}
      aria-hidden="true"
      inert
    >
      <div className="book-turn-underneath" ref={underneathRef} />
      <div className="book-turn-front" ref={frontRef} />
      <div
        className="book-turn-back"
        ref={backRef}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget) onFinishRef.current();
        }}
      />
    </div>
  );
}
