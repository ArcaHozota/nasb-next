"use client";

// src/components/home/BookPageTurn.tsx
// PC版ホームの「本を手でめくる」演出。
//   - めくる紙は細い短冊(STRIPS 本)をつないだもので、少しずつ角度を変えて紙がしなるように見せる
//     (先端から持ち上がり、のどの側が最後に離れる)。
//   - 紙の表はめくる前のページ、裏はめくった先の新しいページ(実際の画面から複製)。
//   - 進み具合 progress(0〜1)で形を決めるので、ボタンで自動でめくる(auto)ことも、
//     指やマウスに合わせてめくる(drag)こともできる。
//   - 左右のページは幅が違う(454:736)。短冊の幅は、紙がほぼ真横を向いて見えにくい間に
//     表側の幅から裏側の幅へ切り替え、文字が潰れて見えないようにする。
// 実際のページは、この演出の下で先に新しいページへ差し替わっている。演出が終わると取り除く。
import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";

type Direction = "next" | "previous";

type PageCopy = { node: HTMLElement; lyricScroll: number };

export type BookTurn = {
  direction: Direction;
  /** めくる紙の表(めくる前のページ) */
  front: PageCopy;
  /** 紙が着地する側の、めくる前のページ(着地するまで見えている) */
  underneath: PageCopy;
  /** auto: すぐに最後までめくる / drag: 呼び出し側が setProgress で進める */
  mode: "auto" | "drag";
};

/** 呼び出し側(ドラッグ)から操作するための口 */
export type BookTurnHandle = {
  /** 指の位置に合わせて進める(0〜1) */
  setProgress: (t: number) => void;
  /** 指を離した。十分めくっていれば最後まで、そうでなければ元に戻す */
  release: (complete: boolean) => void;
  progress: () => number;
};

const lyricViewport = "[data-slot=scroll-area-viewport]";
/** 紙を分ける短冊の数。多いほど滑らかだが、ページの複製も増える */
const STRIPS = 16;
/** ボタンで最後までめくる時間 */
export const TURN_DURATION_MS = 900;
/** 紙のしなり(先端とのどの角度の差) */
const CURL_DEG = 64;

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
  mode: BookTurn["mode"] = "auto",
): BookTurn | null {
  const pages = livePages(book);
  if (!pages) return null;
  const [front, underneath] =
    direction === "next"
      ? [pages.right, pages.left]
      : [pages.left, pages.right];
  return {
    direction,
    front: copyPage(front),
    underneath: copyPage(underneath),
    mode,
  };
}

/** 複製したページを host に入れる(歌詞のスクロール位置も合わせる) */
function place(host: HTMLElement, copy: PageCopy) {
  const node = copy.node.cloneNode(true) as HTMLElement;
  host.replaceChildren(node);
  const viewport = node.querySelector(lyricViewport);
  if (viewport) viewport.scrollTop = copy.lyricScroll;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

type Strip = {
  el: HTMLDivElement;
  front: HTMLDivElement;
  back: HTMLDivElement;
};

export default function BookPageTurn({
  turn,
  bookRef,
  onFinish,
  ref,
}: {
  turn: BookTurn;
  bookRef: React.RefObject<HTMLDivElement | null>;
  /** completed: 最後までめくった(true) / 元に戻した(false) */
  onFinish: (completed: boolean) => void;
  ref?: Ref<BookTurnHandle>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const underneathRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  // 描画中には読まず、イベントと Effect の中だけで使う
  const api = useRef<{
    set: (t: number) => void;
    animateTo: (to: number, ms: number) => void;
    t: number;
  } | null>(null);
  const onFinishRef = useRef(onFinish);
  useLayoutEffect(() => {
    onFinishRef.current = onFinish;
  });


  useLayoutEffect(() => {
    const pages = livePages(bookRef.current);
    const root = rootRef.current;
    const sheet = sheetRef.current;
    const underneath = underneathRef.current;
    const shadow = shadowRef.current;
    if (!pages || !root || !sheet || !underneath || !shadow) {
      onFinishRef.current(true);
      return;
    }
    const next = turn.direction === "next";
    const gutter = pages.left.offsetLeft + pages.left.offsetWidth;
    const leftW = pages.left.offsetWidth;
    const rightW = pages.right.offsetWidth;
    const height = pages.left.offsetHeight;
    const top = pages.left.offsetTop;
    // 表はめくる前のページ、裏は(下で既に差し替わっている)めくった先のページ
    const frontW = next ? rightW : leftW;
    const backW = next ? leftW : rightW;
    const back = copyPage(next ? pages.left : pages.right);

    // 着地する側は、紙が覆うまでめくる前のページを見せておく
    Object.assign(underneath.style, {
      top: `${top}px`,
      height: `${height}px`,
      left: `${next ? pages.left.offsetLeft : gutter}px`,
      width: `${next ? leftW : rightW}px`,
    });
    place(underneath, turn.underneath);
    // めくれて見えてくる側(新しいページ)の、のど寄りの影
    Object.assign(shadow.style, {
      top: `${top}px`,
      height: `${height}px`,
      left: `${next ? gutter : pages.left.offsetLeft}px`,
      width: `${next ? rightW : leftW}px`,
    });

    // 短冊をのどから順に入れ子にする(親の向きを受け継いで、少しずつ曲がる)
    const sf = frontW / STRIPS;
    const sb = backW / STRIPS;
    Object.assign(sheet.style, {
      top: `${top}px`,
      height: `${height}px`,
      left: `${next ? gutter : gutter - sf}px`,
      width: `${sf}px`,
    });
    const strips: Strip[] = [];
    let parent: HTMLElement = sheet;
    for (let k = 0; k < STRIPS; k++) {
      const el = document.createElement("div");
      el.className = "book-turn-strip";
      el.style.transformOrigin = next ? "left center" : "right center";
      const front = document.createElement("div");
      front.className = "book-turn-face";
      const frontPage = document.createElement("div");
      frontPage.className = "book-turn-face-page";
      frontPage.style.width = `${frontW}px`;
      place(frontPage, turn.front);
      front.append(frontPage);
      const backFace = document.createElement("div");
      backFace.className = "book-turn-face book-turn-face--back";
      const backPage = document.createElement("div");
      backPage.className = "book-turn-face-page";
      backPage.style.width = `${backW}px`;
      place(backPage, back);
      backFace.append(backPage);
      el.append(front, backFace);
      parent.append(el);
      strips.push({
        el,
        front: frontPage,
        back: backPage,
      });
      parent = el;
    }

    const set = (t: number) => {
      // 紙がほぼ真横を向く間(t=0.35〜0.65)に、短冊の幅を表側から裏側へ切り替える
      const w = sf + (sb - sf) * smoothstep(0.35, 0.65, t);
      const curl = CURL_DEG * Math.sin(Math.PI * t);
      const sign = next ? -1 : 1;
      strips.forEach((s, k) => {
        const angle = k === 0 ? 180 * t - curl / 2 : curl / (STRIPS - 1);
        s.el.style.width = `${w + 1}px`; // 隣の短冊と少し重ねて、継ぎ目の線を見せない
        s.el.style.left = k === 0 ? (next ? "0px" : `${sf - w}px`) : `${next ? w : -w}px`;
        s.el.style.transform = `rotateY(${sign * angle}deg)`;
        // 表: k 番目の短冊は、表のページの k 番目の区切りを映す(のどから数える)
        const fk = next ? k : STRIPS - 1 - k;
        const bk = next ? STRIPS - 1 - k : k;
        s.front.style.transform = `translateX(${-fk * w}px) scaleX(${w / sf})`;
        s.back.style.transform = `translateX(${-bk * w}px) scaleX(${w / sb})`;
      });
      const lift = Math.sin(Math.PI * t);
      root.style.setProperty("--turn-shade", (0.28 * lift).toFixed(3));
      root.style.setProperty("--turn-gutter", (0.55 * (1 - t)).toFixed(3));
      if (api.current) api.current.t = t;
    };

    let frame = 0;
    let fallback = 0;
    let done = false;
    const finish = (completed: boolean) => {
      if (done) return;
      done = true;
      onFinishRef.current(completed);
    };
    const animateTo = (to: number, ms: number) => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
      const from = api.current?.t ?? 0;
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / ms);
        set(from + (to - from) * easeInOut(k));
        if (k < 1) frame = requestAnimationFrame(step);
        else finish(to === 1);
      };
      frame = requestAnimationFrame(step);
      // 画面が裏に回るなどで描画が止まっても、ページ送りを再び使えるようにする
      fallback = window.setTimeout(() => finish(to === 1), ms + 400);
    };

    api.current = { set, animateTo, t: 0 };
    set(0);
    if (turn.mode === "auto") animateTo(1, TURN_DURATION_MS);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
      api.current = null;
      sheet.replaceChildren();
    };
  }, [turn, bookRef]);

  // 紙の用意(上の Effect)が済んでから、呼び出し側に操作口を渡す
  // (渡した時点で、それまでの指の動きや「離した」ことがすぐに反映されるように)
  useImperativeHandle(
    ref,
    () => ({
      setProgress: (t) => api.current?.set(Math.min(1, Math.max(0, t))),
      release: (complete) => {
        const a = api.current;
        if (!a) return;
        const to = complete ? 1 : 0;
        a.animateTo(to, Math.max(160, TURN_DURATION_MS * Math.abs(to - a.t)));
      },
      progress: () => api.current?.t ?? 0,
    }),
    [],
  );

  return (
    <div
      ref={rootRef}
      className="book-turn"
      data-direction={turn.direction}
      data-mode={turn.mode}
      aria-hidden="true"
      inert
    >
      <div className="book-turn-underneath" ref={underneathRef} />
      <div className="book-turn-shadow" ref={shadowRef} />
      <div className="book-turn-sheet" ref={sheetRef} />
    </div>
  );
}
