"use client";

// src/components/home/BookPageTurn.tsx
// PC版ホームの紙をめくる演出。StPageFlip の「soft」ページと同じ動き:
//   - 紙の角(つかんだ点)が指・マウスの位置へ動き、角の元の位置とその点の垂直二等分線で紙が折れる。
//     折れた部分は折り目で裏返り、紙の裏(めくった先のページ)が見える。持ち上がった所には下の紙が見える。
//   - 角の元の位置と、つかんだ点との距離で影を付ける(下の紙に落ちる影と、折れた紙の内側の陰り)。
//   - 自動でめくるときは、角を一定の速さ(StPageFlip の flippingTime: 1000ms)でまっすぐ動かす。
// 角は綴じ目から離れないよう、綴じ目の上端・下端を中心とする2つの円の中に制限する(紙が破れて見えない)。
// 左右のページは幅が違う(454:736)ので、綴じ目を越えた側(着地する側)では横方向だけ縮めて描き、
// めくり終わったときに着地側のページとちょうど重なるようにしている。
// 動かすのは複製したページの transform と clip-path だけで、実際のページは下で先に差し替わっている。
export type Direction = "next" | "previous";
export type Corner = "top" | "bottom";

type Pt = { x: number; y: number };
/** CSS の matrix(a, b, c, d, e, f) と同じ並び。x' = a*x + c*y + e, y' = b*x + d*y + f */
type Mat = [number, number, number, number, number, number];

type PageCopy = { node: HTMLElement; lyricScroll: number };

/** めくる紙の中身。blank は角に乗っただけ(まだ次のページが無い)ときの、何も書いていない紙 */
export type TurnContent =
  | { kind: "blank" }
  | {
      kind: "pages";
      /** めくる紙の表(めくる前のページ) */
      front: PageCopy;
      /** 紙が着地する側の、めくる前のページ(紙が覆うまで見えている) */
      landing: PageCopy;
      /** 紙の裏(めくった先の、着地する側のページ) */
      back: PageCopy;
    };

/** StPageFlip の flippingTime(1000px 以上動くときの時間)。短い距離はその割合で短くなる */
export const FLIPPING_TIME_MS = 1000;
/** 影の最大の濃さ(StPageFlip の maxShadowOpacity。公式デモと同じ 0.5。羊皮紙の上で黒くなりすぎない) */
const MAX_SHADOW_OPACITY = 0.5;
/** 角に乗ったときに折り返す大きさ(StPageFlip と同じ 50px) */
export const HOVER_FOLD_PX = 50;

const lyricViewport = "[data-slot=scroll-area-viewport]";

export function copyPage(page: HTMLElement): PageCopy {
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

export function livePages(book: HTMLElement | null) {
  const left = book?.querySelector<HTMLElement>(":scope > .book-page--left");
  const right = book?.querySelector<HTMLElement>(":scope > .book-page--right");
  return left && right ? { left, right } : null;
}

/** めくる前のページ(表と、着地する側)を複製しておく。ページを差し替える前に呼ぶ */
export function captureTurnPages(book: HTMLElement | null, direction: Direction) {
  const pages = livePages(book);
  if (!pages) return null;
  const [front, landing] =
    direction === "next"
      ? [pages.right, pages.left]
      : [pages.left, pages.right];
  return { front: copyPage(front), landing: copyPage(landing) };
}

// ===== 2次元の計算 =====

const apply = (m: Mat, p: Pt): Pt => ({
  x: m[0] * p.x + m[2] * p.y + m[4],
  y: m[1] * p.x + m[3] * p.y + m[5],
});
/** a∘b(先に b、次に a) */
const compose = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const css = (m: Mat) => `matrix(${m.map((v) => +v.toFixed(5)).join(",")})`;
const polygon = (pts: Pt[]) =>
  pts.length < 3
    ? "polygon(0 0)"
    : `polygon(${pts.map((p) => `${+p.x.toFixed(2)}px ${+p.y.toFixed(2)}px`).join(",")})`;

/** 凸多角形を、半平面 {q | (q - o)・n >= 0} で切り取る */
function clipHalfPlane(poly: Pt[], o: Pt, n: Pt): Pt[] {
  const side = (q: Pt) => (q.x - o.x) * n.x + (q.y - o.y) * n.y;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

const limitToCircle = (c: Pt, r: number, p: Pt): Pt => {
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  const d = Math.hypot(dx, dy);
  return d <= r ? p : { x: c.x + (dx * r) / d, y: c.y + (dy * r) / d };
};

/**
 * 1枚の紙のめくれを描く。座標は「めくる紙の座標」: 原点は綴じ目の上端、x は綴じ目から紙の外側の端へ向かう向き
 * (「次」なら右、「前」なら左)、y は下向き。紙は x∈[0, W]・y∈[0, H] にある。
 */
export class SoftPage {
  readonly direction: Direction;
  readonly corner: Corner;
  /** めくる紙の幅・高さと、着地する側のページの幅 */
  readonly W: number;
  readonly H: number;
  private readonly landingW: number;
  /** めくる紙の座標 → 本の座標 */
  private readonly toBook: Mat;
  /** 着地する側(x < 0)を横に縮める倍率 */
  private readonly k: number;
  private readonly frontRect: { left: number; top: number };
  private readonly landingRect: { left: number; top: number };
  private readonly layer: HTMLElement;
  private els: {
    front?: HTMLElement;
    outerClip: HTMLElement;
    outerShadow: HTMLElement;
    flaps: { clip: HTMLElement; back: HTMLElement; shadow: HTMLElement }[];
  } | null = null;

  constructor(
    layer: HTMLElement,
    book: HTMLElement,
    direction: Direction,
    corner: Corner,
  ) {
    const pages = livePages(book);
    if (!pages) throw new Error("見開きが見つかりません");
    this.layer = layer;
    this.direction = direction;
    this.corner = corner;
    const next = direction === "next";
    const [from, to] = next
      ? [pages.right, pages.left]
      : [pages.left, pages.right];
    this.W = from.offsetWidth;
    this.H = from.offsetHeight;
    this.landingW = to.offsetWidth;
    this.k = this.landingW / this.W;
    const spine = pages.right.offsetLeft;
    const top = from.offsetTop;
    this.toBook = next ? [1, 0, 0, 1, spine, top] : [-1, 0, 0, 1, spine, top];
    this.frontRect = { left: from.offsetLeft, top: from.offsetTop };
    this.landingRect = { left: to.offsetLeft, top: to.offsetTop };
  }

  /** つかんだ角の、元の位置 */
  get start(): Pt {
    return { x: this.W, y: this.corner === "top" ? 0 : this.H };
  }

  /** 本の中の座標(枠の内側が原点)を、めくる紙の座標へ */
  fromBook(p: Pt): Pt {
    const spine = this.toBook[4];
    return {
      x: this.direction === "next" ? p.x - spine : spine - p.x,
      y: p.y - this.toBook[5],
    };
  }

  /**
   * 角が動ける範囲に収める(StPageFlip の checkPositionAtCenterLine と同じ考え)。
   * 綴じ目の上端・下端が折れた部分に入ると紙が綴じ目から破れて見えるので、
   * つかんだ角と同じ側の端からは紙の幅、反対側の端からは紙の対角線の長さ以内にする。
   */
  limit(p: Pt): Pt {
    const near = { x: 0, y: this.corner === "top" ? 0 : this.H };
    const far = { x: 0, y: this.corner === "top" ? this.H : 0 };
    const diag = Math.hypot(this.W, this.H);
    let q = p;
    for (let i = 0; i < 3; i++) {
      q = limitToCircle(near, this.W, q);
      q = limitToCircle(far, diag, q);
    }
    return q;
  }

  /** 紙の中身を入れ替える(角に乗っただけの白紙 → 次のページの複製) */
  setContent(content: TurnContent) {
    const doc = this.layer.ownerDocument;
    const div = (cls: string, style: Partial<CSSStyleDeclaration> = {}) => {
      const el = doc.createElement("div");
      el.className = cls;
      Object.assign(el.style, style);
      return el;
    };
    const sized = (w: number) => ({
      width: `${w}px`,
      height: `${this.H}px`,
    });
    const next = this.direction === "next";
    const frontSide = next ? "right" : "left";
    const landingSide = next ? "left" : "right";
    const host = (copy: PageCopy, w: number, cls: string) => {
      const el = div(cls, sized(w));
      el.append(copy.node);
      return el;
    };
    const blankPage = (side: string, w: number, cls: string) =>
      div(`${cls} book-page book-page--${side} book-turn-blank`, sized(w));

    const children: HTMLElement[] = [];
    // 着地する側の、めくる前のページ(紙が覆うまで見えている)
    if (content.kind === "pages") {
      children.push(
        host(content.landing, this.landingW, "book-turn-landing"),
      );
      Object.assign(children[0].style, {
        left: `${this.landingRect.left}px`,
        top: `${this.landingRect.top}px`,
      });
    }
    // 持ち上がった所に見える下の紙と、そこへ落ちる影
    const outerClip = div("book-turn-clip");
    if (content.kind === "blank") {
      const under = blankPage(frontSide, this.W, "book-turn-under");
      Object.assign(under.style, {
        left: `${this.frontRect.left}px`,
        top: `${this.frontRect.top}px`,
      });
      outerClip.append(under);
    }
    const outerShadow = div("book-turn-shadow book-turn-shadow--outer");
    outerClip.append(outerShadow);
    children.push(outerClip);
    // めくる紙の表のうち、まだ折れていない部分
    let front: HTMLElement | undefined;
    if (content.kind === "pages") {
      front = host(content.front, this.W, "book-turn-front");
      Object.assign(front.style, {
        left: `${this.frontRect.left}px`,
        top: `${this.frontRect.top}px`,
      });
      children.push(front);
    }
    // 折れて裏返った部分(紙の裏)。綴じ目の手前と向こう(着地側は横に縮める)で2つに分けて描く
    const flaps = [0, 1].map(() => {
      const clip = div("book-turn-clip");
      const back =
        content.kind === "pages"
          ? host(
              { ...content.back, node: content.back.node.cloneNode(true) as HTMLElement },
              this.landingW,
              "book-turn-back",
            )
          : blankPage(landingSide, this.landingW, "book-turn-back");
      const shadow = div("book-turn-shadow book-turn-shadow--inner");
      clip.append(back, shadow);
      children.push(clip);
      return { clip, back, shadow };
    });
    this.layer.replaceChildren(...children);
    // 歌詞のスクロール位置を合わせる(DOM に入れてから)
    if (content.kind === "pages") {
      const sync = (root: ParentNode, copy: PageCopy) => {
        const v = root.querySelector(lyricViewport);
        if (v) v.scrollTop = copy.lyricScroll;
      };
      sync(children[0], content.landing);
      if (front) sync(front, content.front);
      for (const f of flaps) sync(f.back, content.back);
    }
    this.els = { front, outerClip, outerShadow, flaps };
  }

  /** 角が p(めくる紙の座標、limit 済み)にあるときの形を描く */
  render(p: Pt) {
    const els = this.els;
    if (!els) return;
    const { W, H, k } = this;
    const c = this.start;
    const dx = c.x - p.x;
    const dy = c.y - p.y;
    const len = Math.hypot(dx, dy);
    const page: Pt[] = [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: H },
      { x: 0, y: H },
    ];
    const hide = (el: HTMLElement) => (el.style.clipPath = "polygon(0 0)");
    if (len < 0.5) {
      // 折れていない
      if (els.front) els.front.style.clipPath = "none";
      hide(els.outerClip);
      els.flaps.forEach((f) => hide(f.clip));
      return;
    }
    // 折り目: 角の元の位置 c と p の垂直二等分線。n は c 側を向く
    const n = { x: dx / len, y: dy / len };
    const m = { x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 };
    const neg = { x: -n.x, y: -n.y };
    const lifted = clipHalfPlane(page, m, n); // 持ち上がった部分(下の紙が見える)
    const stays = clipHalfPlane(page, m, neg); // 折れていない部分
    // 折り目で裏返す(鏡映)
    const dot = m.x * n.x + m.y * n.y;
    const reflect: Mat = [
      1 - 2 * n.x * n.x,
      -2 * n.x * n.y,
      -2 * n.x * n.y,
      1 - 2 * n.y * n.y,
      2 * dot * n.x,
      2 * dot * n.y,
    ];
    const flap = lifted.map((q) => apply(reflect, q));
    const toBook = (pts: Pt[], m2: Mat = this.toBook) => pts.map((q) => apply(m2, q));

    // 表の折れていない部分(複製はページの位置に置いてあるので、ページの中の座標で切る)
    if (els.front) {
      const local = stays.map((q) => ({
        x: this.direction === "next" ? q.x : W - q.x,
        y: q.y,
      }));
      els.front.style.clipPath = polygon(local);
    }

    // 影(StPageFlip と同じ): 進み具合 0〜100、幅は紙の幅の 3/4 × 進み具合、濃さは (1 - 進み具合) × 最大の濃さ
    const progress = Math.min(100, Math.abs(((p.x - W) / (2 * W)) * 100));
    const width = ((W * 3) / 4) * (progress / 100);
    const opacity = +(((100 - progress) / 100) * MAX_SHADOW_OPACITY).toFixed(3);
    const reach = 2 * Math.hypot(W, H);
    /** 折り目に沿って置く帯。帯の x は折り目から dir の向き */
    const strip = (dir: Pt): Mat => {
      const d = { x: -dir.y, y: dir.x };
      return [dir.x, dir.y, d.x, d.y, m.x - d.x * reach, m.y - d.y * reach];
    };

    els.outerClip.style.clipPath = polygon(toBook(lifted));
    Object.assign(els.outerShadow.style, {
      width: `${width}px`,
      height: `${2 * reach}px`,
      transform: css(compose(this.toBook, strip(n))),
      background: `linear-gradient(to right, rgba(0,0,0,${opacity}), rgba(0,0,0,0))`,
    });

    // 紙の裏: 裏の複製の中の座標 a → めくる紙の座標 u(めくり終わると着地側のページに重なる)
    const backToSheet: Mat =
      this.direction === "next"
        ? [-1 / k, 0, 0, 1, this.landingW / k, 0]
        : [1 / k, 0, 0, 1, 0, 0];
    const sheetToDrawn = compose(reflect, backToSheet);
    const shrink: Mat = [k, 0, 0, 1, 0, 0];
    const halves: { poly: Pt[]; post: Mat }[] = [
      { poly: clipHalfPlane(flap, { x: 0, y: 0 }, { x: 1, y: 0 }), post: [1, 0, 0, 1, 0, 0] },
      { poly: clipHalfPlane(flap, { x: 0, y: 0 }, { x: -1, y: 0 }), post: shrink },
    ];
    const innerW = (width * 3) / 4;
    halves.forEach(({ poly, post }, i) => {
      const f = els.flaps[i];
      const toDrawn = compose(this.toBook, post);
      f.clip.style.clipPath = polygon(toBook(poly, toDrawn));
      f.back.style.transform = css(compose(toDrawn, sheetToDrawn));
      Object.assign(f.shadow.style, {
        width: `${innerW}px`,
        height: `${2 * reach}px`,
        transform: css(compose(toDrawn, strip(neg))),
        background: `linear-gradient(to right, rgba(0,0,0,${opacity}) 5%, rgba(0,0,0,0.05) 15%, rgba(0,0,0,${opacity}) 35%, rgba(0,0,0,0) 100%)`,
      });
    });
  }
}

/**
 * 角を from から to へ、一定の速さで動かす(StPageFlip の animateFlippingTo と同じく、
 * 1000px 以上なら 1000ms、それより短ければ距離の割合で短く)。
 * 画面が裏に回るなどで描画が止まっても、終了予定から 400ms 後には終える。戻り値で取り消せる。
 */
export function animateCorner(
  from: Pt,
  to: Pt,
  onFrame: (p: Pt) => void,
  onEnd: () => void,
): () => void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = Math.min(dist / 1000, 1) * FLIPPING_TIME_MS;
  const startAt = performance.now();
  let done = false;
  let raf = 0;
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(fallback);
    onFrame(to);
    onEnd();
  };
  const tick = (now: number) => {
    const t = duration === 0 ? 1 : Math.min(1, (now - startAt) / duration);
    if (t >= 1) return finish();
    onFrame({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    });
    raf = requestAnimationFrame(tick);
  };
  const fallback = window.setTimeout(finish, duration + 400);
  raf = requestAnimationFrame(tick);
  return () => {
    done = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(fallback);
  };
}
