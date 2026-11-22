"use client";

// src/components/home/OpenHymnalHome.tsx
// PC版ホーム画面「開いた讃美歌集」。
//   左ページ: 讃美歌集の目次(番号・点線・◆の数で一致度)。1ページ10曲。
//   右ページ: 左で選んだ曲。調を選ぶと五線譜の調号が変わり、五線譜を押すとその調の楽譜をダウンロード。
//            歌詞は検索した語を下線で強調して表示する(歌詞の照合)。
// モバイル版(カルーセル)は page.tsx 側のまま。データ取得・検索・ページ送りの状態も page.tsx が持つ。
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, LogIn, Search, SquarePlay } from "lucide-react";
import Highlighted from "@/components/Highlighted";
import JerusalemCross from "@/components/JerusalemCross";
import {
  animateCorner,
  captureTurnPages,
  copyPage,
  HOVER_FOLD_PX,
  livePages,
  SoftPage,
  type Corner,
  type Direction,
} from "@/components/home/BookPageTurn";
import KeyStaff from "@/components/home/KeyStaff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Item, ItemContent, ItemMedia } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
import { extractErrorMessage } from "@/lib/constants";
import { keyLabel } from "@/lib/keySignature";
import { countHits, lyricQueryOptions } from "@/lib/lyrics";
import { useHymnScore } from "@/hooks/use-hymn-score";
import { cn } from "@/lib/utils";
import { useFeedbackStore } from "@/stores/feedback";
import type { HymnSummary } from "@/api/hymns";

type BookHymn = HymnSummary;

type Pt = { x: number; y: number };

/** めくっている紙の状態(描くたびに React を通さないよう ref に持つ) */
type FlipState = {
  direction: Direction;
  corner: Corner;
  /** hover: 角に乗って折れているだけ / drag: 角をつかんでいる / auto: 最後まで自動でめくる */
  mode: "hover" | "drag" | "auto";
  soft: SoftPage | null;
  /** 紙の角の今の位置(めくる紙の座標) */
  point: Pt | null;
  /** 指・マウスの位置(本の中の座標)と、押した位置 */
  pointer: Pt | null;
  down: Pt;
  moved: boolean;
  released: boolean;
  /** 角に乗ったときの折り返しが終わった */
  folded: boolean;
  /** 紙の中身が、移動先のページの複製になった */
  ready: boolean;
  captured: ReturnType<typeof captureTurnPages>;
  target: number;
  /** めくる前のページと選んでいた曲(途中でやめたとき、ここへ戻す) */
  from: { page: number; selectedId: string | null } | null;
  stop: (() => void) | null;
  onReady: (() => void) | null;
};

const newFlip = (
  direction: Direction,
  corner: Corner,
  mode: FlipState["mode"],
): FlipState => ({
  direction,
  corner,
  mode,
  soft: null,
  point: null,
  pointer: null,
  down: { x: 0, y: 0 },
  moved: false,
  released: false,
  folded: false,
  ready: false,
  captured: null,
  target: 0,
  from: null,
  stop: null,
  onReady: null,
});

/** 角の範囲にあっても、押したときに紙をめくらない(本来の操作を優先する)要素 */
const INTERACTIVE =
  "button, a, input, textarea, select, label, [role=button], [role=radio], [role=option], [data-slot=scroll-area-scrollbar]";

/** 一致度(lineNumber)ごとの◆表示。検索していないときは出さない */
const MATCH: Record<string, { label: string; mark: string; tone: string }> = {
  CADMIUM: { label: "よく一致", mark: "◆◆◆", tone: "text-[#0d5c33]" },
  BURGUNDY: { label: "一致", mark: "◆◆◇", tone: "text-[#800020]" },
  NAPLES: { label: "やや一致", mark: "◆◇◇", tone: "text-[#8a6400]" },
};
const RELATED = { label: "関連", mark: "◇◇◇", tone: "text-[#8a7a64]" };
const matchOf = (line: string) => MATCH[line] ?? RELATED;

/** ページ送りのボタン(ホームの本のデザインに合わせて、余白・背景なしの文字だけにしている) */
const PAGER_BTN =
  "h-auto p-0 text-[13px] font-normal text-(--book-accent) hover:bg-transparent hover:text-(--book-accent) aria-disabled:opacity-50";

/** 目次の1行(shadcn/ui の Item)。点線の下罫線・押せる行のホバーと選択中の背景は、本のデザインに合わせて上書きする */
// 1行の高さは約 58.5px(上下の余白 7.5px × 2 + 曲名2行 42.48px + 点線 1px)
const BOOK_ROW =
  "w-full flex-nowrap! items-baseline! text-base! leading-normal! gap-3! rounded-none! border-0 border-b border-dotted border-(--book-rule)! px-2! py-[7.5px]! text-left";
const BOOK_ROW_BTN =
  "hover:bg-(--book-hover) data-[active=true]:bg-(--book-selected) focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--book-accent)";
/** 目次の番号 */
const BOOK_ROW_NO =
  "w-7.5 justify-start text-lg leading-[27px] font-bold text-(--book-accent)";

/** 目次の番号(全体での通し番号) */
const hymnNo = (page: number, pageSize: number, i: number) =>
  String((page - 1) * pageSize + i + 1).padStart(2, "0");

// ===== 右ページ: 選んだ曲 =====
// key={id} で曲ごとに作り直すので、選んだ調などの状態は曲を変えると初期化される
function HymnPage({
  hymn,
  terms,
  onDownload,
}: {
  hymn: BookHymn;
  terms: string[];
  onDownload: (id: string, chord?: string) => Promise<void>;
}) {
  const {
    keysQuery,
    keys,
    chord,
    isOriginal,
    staffState,
    setPicked,
    download,
  } = useHymnScore(hymn.id, onDownload);
  const lyricQuery = useQuery(lyricQueryOptions(hymn.id));

  const match = terms.length > 0 ? matchOf(hymn.lineNumber) : null;
  const lyric = lyricQuery.data ?? "";
  const hits = countHits(lyric, terms);

  return (
    <article
      className="book-page book-page--right"
      aria-label={`${hymn.nameJp}の詳細`}
    >
      {/* 曲名は左の列で折り返し、「YouTubeで聴く」は右の列で常に右上に置く(曲名の長さで位置が変わらない) */}
      <div className="book-song-heading grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4">
        <div className="min-w-0">
          {match && (
            <span className={cn("text-xs tracking-wider", match.tone)}>
              {match.mark} {match.label}
            </span>
          )}
          <h1 className="mt-1 text-[30px] leading-tight font-bold text-(--book-accent) wrap-anywhere">
            {hymn.nameJp}
          </h1>
          <p className="noto-serif-kr mt-0.5 text-[17px] text-[#5a4630]">
            {hymn.nameKr}
          </p>
        </div>
        <a
          href={hymn.link}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "book-sans h-9 shrink-0 gap-1.5 rounded-lg border-(--book-accent) bg-transparent! px-3.5 text-[13px] font-normal text-(--book-accent) shadow-none hover:bg-(--book-accent)! hover:text-white",
          )}
        >
          <SquarePlay className="size-4" aria-hidden="true" />
          YouTubeで聴く
        </a>
      </div>

      {/* 五線譜: 選んだ調の調号を描き、押すとその調の楽譜をダウンロードする */}
      <KeyStaff
        chord={chord}
        isOriginal={isOriginal}
        state={staffState}
        onDownload={() => void download()}
      />
      {/* 調を選ぶと上の五線譜の調号が変わる */}
      <div className="book-sans flex flex-wrap items-center gap-2 text-[13px] text-[#6b5338]">
        <span>調を選ぶ</span>
        {keysQuery.isPending &&
          [0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-7.5 w-11 bg-[#e8dcc1]" />
          ))}
        {keys.length > 0 && (
          <ToggleGroup
            value={chord ? [chord] : []}
            onValueChange={([value]) => {
              // 選択中の調を再クリックしても、その調を維持する
              if (value) setPicked(value);
            }}
            aria-label="調を選ぶ"
            className="flex-wrap gap-2"
          >
            {keys.map((k) => (
              // 調ボタンはどれも同じ大きさ(44×30px)。オリジナルキーの「＊」は幅を取らないよう右上に小さく重ねる
              <ToggleGroupItem
                key={k.chord}
                value={k.chord}
                className="relative h-7.5 w-11 rounded-lg! border border-(--book-rule) bg-transparent px-0 text-[13px] font-normal text-[#2b1d14] hover:bg-(--book-hover) hover:text-[#2b1d14] data-pressed:border-(--book-accent) data-pressed:bg-(--book-accent) data-pressed:text-white"
              >
                {keyLabel(k.chord)}
                {k.isOriginal && (
                  <>
                    <span
                      className="absolute top-0.5 right-1 text-[10px] leading-none"
                      aria-hidden="true"
                    >
                      ＊
                    </span>
                    <span className="sr-only">(オリジナルキー)</span>
                  </>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {keys.some((k) => k.isOriginal) && (
          <span className="text-xs">＊オリジナルキー</span>
        )}
        {keysQuery.error && (
          <span className="text-xs text-[#800020]">
            {extractErrorMessage(keysQuery.error, "楽譜の確認に失敗しました")}
          </span>
        )}
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col border-t border-(--book-rule) pt-2.5">
        {terms.length > 0 && lyricQuery.isSuccess && (
          <p
            className="book-sans mb-1 text-xs text-[#6b5338]"
            aria-live="polite"
          >
            {hits > 0
              ? `「${terms.join("・")}」に一致: ${hits}箇所`
              : `「${terms.join("・")}」は歌詞に含まれていません（歌詞が似ている曲）`}
          </p>
        )}
        <ScrollArea className="min-h-0 flex-1">
          <div className="book-lyric pr-2">
            {lyricQuery.isPending && (
              <div className="flex justify-center py-10">
                <Spinner className="size-6 text-[#800020]" />
              </div>
            )}
            {lyricQuery.error && (
              <p className="book-sans py-6 text-sm">
                {extractErrorMessage(
                  lyricQuery.error,
                  "歌詞の取得に失敗しました",
                )}
              </p>
            )}
            {lyricQuery.isSuccess &&
              (lyric ? (
                <div
                  className={
                    terms.length === 0 && /^\p{L}/u.test(lyric)
                      ? "book-illuminated"
                      : undefined
                  }
                >
                  <Highlighted
                    text={lyric}
                    terms={terms}
                    markClassName="book-mark"
                  />
                </div>
              ) : (
                <p className="book-sans py-6 text-sm text-[#6b5338]">
                  歌詞が登録されていません。
                </p>
              ))}
          </div>
        </ScrollArea>
      </div>
    </article>
  );
}

export default function OpenHymnalHome({
  records,
  totalRecords,
  page,
  totalPages,
  pageSize,
  isFetching,
  keyword,
  submittedKeyword,
  terms,
  hitCount,
  notice,
  onKeywordChange,
  onSearch,
  onReload,
  onLogin,
  onPreparePage,
  onPageChange,
  onDownload,
}: {
  records: BookHymn[];
  totalRecords: number;
  page: number;
  totalPages: number;
  pageSize: number;
  isFetching: boolean;
  keyword: string;
  submittedKeyword: string;
  terms: string[];
  /** 画面側検索で一致した曲数(サーバー検索のときは未指定) */
  hitCount?: number;
  /** 画面側検索で一致が無かったときの案内 */
  notice?: string | null;
  onKeywordChange: (v: string) => void;
  onSearch: () => void;
  onReload: () => void;
  onLogin: () => void;
  onPreparePage: (p: number) => Promise<void>;
  onPageChange: (p: number) => void;
  onDownload: (id: string, chord?: string) => Promise<void>;
}) {
  const toast = useFeedbackStore((s) => s.toast);
  const bookRef = useRef<HTMLDivElement>(null);
  const turnRequest = useRef<symbol | null>(null);
  const [preparingPage, setPreparingPage] = useState(false);
  // 紙をめくっている(ボタン・角のクリック・ドラッグ)間は true。角に乗って少し折れているだけのときは false
  const [turning, setTurning] = useState(false);
  // めくる紙を描く層。key が変わると描き直す
  const [flipView, setFlipView] = useState<{
    direction: Direction;
    key: number;
  } | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const flip = useRef<FlipState | null>(null);
  const flipKey = useRef(0);
  // めくるのを途中でやめて元のページへ戻したときに、選び直す曲
  const [restoreId, setRestoreId] = useState<string | null>(null);

  const reduceMotion = () =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const setCursor = (cursor: "grab" | "grabbing" | null) => {
    const book = bookRef.current;
    if (!book) return;
    if (cursor) book.dataset.corner = cursor;
    else delete book.dataset.corner;
  };

  /** 検索・ロゴでのリセット時: 待っていたページ送りや、めくっている紙をすべて取り消す */
  const stopPaging = () => {
    flip.current?.stop?.();
    flip.current = null;
    setFlipView(null);
    setCursor(null);
    turnRequest.current = null;
    setTurning(false);
    setPreparingPage(false);
  };

  /** めくる紙を片付ける。completed=false(途中でやめた)なら、めくる前のページと曲へ戻す */
  const endFlip = useCallback(
    (completed: boolean) => {
      const f = flip.current;
      f?.stop?.();
      flip.current = null;
      setFlipView(null);
      setCursor(null);
      if (!f || f.mode === "hover") return;
      turnRequest.current = null;
      setTurning(false);
      setPreparingPage(false);
      if (!completed && f.from && f.ready) {
        setRestoreId(f.from.selectedId);
        onPageChange(f.from.page);
      }
    },
    [onPageChange],
  );

  useEffect(
    () => () => {
      // 画面幅の切り替えや画面離脱後に、待機していた応答でページを変更しない。
      turnRequest.current = null;
      flip.current?.stop?.();
      flip.current = null;
    },
    [],
  );

  /** 紙の角を to まで動かし、終わったら done を呼ぶ */
  const moveCorner = (f: FlipState, to: Pt, done: () => void) => {
    const soft = f.soft;
    if (!soft) return;
    f.stop?.();
    f.stop = animateCorner(
      f.point ?? soft.start,
      to,
      (p) => {
        f.point = p;
        soft.render(p);
      },
      () => {
        f.stop = null;
        done();
      },
    );
  };

  /** 紙の用意や指を離したことなど、たまっていた操作を進める */
  const advance = (f: FlipState) => {
    const soft = f.soft;
    if (!soft || !f.ready || f.stop) return;
    const yDest = f.corner === "top" ? 0 : soft.H;
    if (f.mode === "auto") {
      // 最後までめくる(StPageFlip の flip: 角を綴じ目の向こう、紙の幅だけ先まで動かす)
      moveCorner(f, { x: -soft.W, y: yDest }, () => endFlip(true));
      return;
    }
    if (f.mode === "drag" && f.released) {
      // 動かさずに離した(クリック)なら最後までめくる。動かしたなら、角が綴じ目を越えていればめくり、
      // 越えていなければ元へ戻す(StPageFlip の stopMove と同じ)
      const complete = !f.moved || (f.point?.x ?? soft.W) <= 0;
      moveCorner(f, { x: complete ? -soft.W : soft.W, y: yDest }, () =>
        endFlip(complete),
      );
    }
  };

  // めくる紙の層ができたら紙を作り、移動先のページに差し替わったら紙の中身を本物に入れ替える
  useLayoutEffect(() => {
    const f = flip.current;
    const layer = layerRef.current;
    const book = bookRef.current;
    if (!f || !layer || !book || !flipView) return;
    if (!f.soft) {
      f.soft = new SoftPage(layer, book, f.direction, f.corner);
      f.soft.setContent({ kind: "blank" });
      f.point ??= f.soft.start;
      if (f.pointer) f.point = f.soft.limit(f.soft.fromBook(f.pointer));
      f.soft.render(f.point);
      f.onReady?.();
      f.onReady = null;
    }
    if (f.captured && page === f.target && !f.ready) {
      const pages = livePages(book);
      if (pages) {
        const landing = f.direction === "next" ? pages.left : pages.right;
        f.soft.setContent({
          kind: "pages",
          front: f.captured.front,
          landing: f.captured.landing,
          back: copyPage(landing),
        });
        f.ready = true;
        f.soft.render(f.point ?? f.soft.start);
      }
    }
    advance(f);
  });

  const turnPage = async (targetPage: number, viaCorner = false) => {
    if (turnRequest.current || targetPage < 1 || targetPage > totalPages)
      return;
    const direction: Direction = targetPage > page ? "next" : "previous";
    const request = Symbol();
    turnRequest.current = request;
    setPreparingPage(true);
    setTurning(true);

    try {
      await onPreparePage(targetPage);
    } catch (error) {
      if (turnRequest.current === request) {
        endFlip(false);
        turnRequest.current = null;
        setTurning(false);
        setPreparingPage(false);
        toast(
          extractErrorMessage(
            error,
            "ページを取得できませんでした。もう一度お試しください。",
          ),
        );
      }
      return;
    }
    if (turnRequest.current !== request) return;

    const captured = reduceMotion()
      ? null
      : captureTurnPages(bookRef.current, direction);
    if (!captured) {
      // 動きを減らす設定では、紙をめくらずにページを切り替える
      flip.current?.stop?.();
      flip.current = null;
      setFlipView(null);
      setCursor(null);
      turnRequest.current = null;
      setTurning(false);
      setPreparingPage(false);
      onPageChange(targetPage);
      return;
    }
    let f = flip.current;
    if (!viaCorner || !f || f.direction !== direction) {
      // ボタンでめくる: 上の角から(StPageFlip の flipNext / flipPrev の既定)。
      // 角に乗って折れていた紙があれば、作り直す
      f?.stop?.();
      f = newFlip(direction, "top", "auto");
      flip.current = f;
      flipKey.current += 1;
    }
    Object.assign(f, {
      captured,
      target: targetPage,
      from: { page, selectedId },
    });
    setPreparingPage(false);
    setFlipView({ direction, key: flipKey.current });
    onPageChange(targetPage);
  };

  // ===== 角に乗る・角をつかむ(StPageFlip の showCorner / start・do・stopMove) =====
  /** 本の中の座標(表紙の枠の内側が原点) */
  const bookPoint = (e: React.PointerEvent) => {
    const book = bookRef.current!;
    const rect = book.getBoundingClientRect();
    return {
      x: e.clientX - rect.left - book.clientLeft,
      y: e.clientY - rect.top - book.clientTop,
    };
  };
  /** 角の、つかめる範囲(StPageFlip と同じく、紙の対角線の 1/5)にあるか */
  const cornerAt = (
    e: React.PointerEvent,
  ): { direction: Direction; corner: Corner } | null => {
    const book = bookRef.current;
    const pages = livePages(book);
    if (!book || !pages) return null;
    if ((e.target as Element).closest(INTERACTIVE)) return null;
    const p = bookPoint(e);
    const H = pages.left.offsetHeight;
    const width = book.clientWidth;
    if (p.x <= 0 || p.y <= 0 || p.x >= width || p.y >= H) return null;
    const dPrev = Math.hypot(pages.left.offsetWidth, H) / 5;
    const dNext = Math.hypot(pages.right.offsetWidth, H) / 5;
    const direction: Direction | null =
      p.x < dPrev && page > 1
        ? "previous"
        : p.x > width - dNext && page < totalPages
          ? "next"
          : null;
    if (!direction) return null;
    const d = direction === "next" ? dNext : dPrev;
    if (p.y >= d && p.y <= H - d) return null;
    return { direction, corner: p.y < H / 2 ? "top" : "bottom" };
  };

  /** 角に乗ったら、角を 50px 折り返す。そのあとは角がマウスについてくる */
  const onBookPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const f = flip.current;
    if (f && f.mode === "drag") {
      if (f.released) return;
      const p = bookPoint(e);
      f.pointer = p;
      if (Math.hypot(p.x - f.down.x, p.y - f.down.y) > 4) f.moved = true;
      if (f.soft && !f.stop) {
        f.point = f.soft.limit(f.soft.fromBook(p));
        f.soft.render(f.point);
      }
      return;
    }
    if (turning || preparingPage || e.pointerType !== "mouse" || reduceMotion())
      return;
    const at = cornerAt(e);
    if (f && f.mode === "hover") {
      if (!at || at.direction !== f.direction || at.corner !== f.corner) {
        leaveCorner();
        return;
      }
      f.pointer = bookPoint(e);
      if (f.soft && !f.stop && f.folded) {
        f.point = f.soft.limit(f.soft.fromBook(f.pointer));
        f.soft.render(f.point);
      }
      return;
    }
    if (!at) return;
    const hover = newFlip(at.direction, at.corner, "hover");
    hover.onReady = () => {
      const soft = hover.soft!;
      const y = at.corner === "top" ? HOVER_FOLD_PX : soft.H - HOVER_FOLD_PX;
      hover.point = { x: soft.W - 1, y: at.corner === "top" ? 1 : soft.H - 1 };
      moveCorner(hover, { x: soft.W - HOVER_FOLD_PX, y }, () => {
        hover.folded = true;
      });
    };
    flip.current = hover;
    flipKey.current += 1;
    setFlipView({ direction: at.direction, key: flipKey.current });
    setCursor("grab");
  };

  /** 角から離れたら、折り返した角を戻して片付ける */
  const leaveCorner = () => {
    const f = flip.current;
    if (!f || f.mode !== "hover") return;
    if (!f.soft) {
      endFlip(false);
      return;
    }
    moveCorner(f, f.soft.start, () => endFlip(false));
  };

  const onBookPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || turning || preparingPage) return;
    const at = cornerAt(e);
    if (!at) return;
    e.preventDefault();
    const target = at.direction === "next" ? page + 1 : page - 1;
    if (reduceMotion()) {
      void turnPage(target);
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    let f = flip.current;
    if (!f || f.direction !== at.direction || f.corner !== at.corner) {
      f?.stop?.();
      f = newFlip(at.direction, at.corner, "drag");
      flip.current = f;
      flipKey.current += 1;
      setFlipView({ direction: at.direction, key: flipKey.current });
    }
    f.stop?.();
    const down = bookPoint(e);
    Object.assign(f, { stop: null, mode: "drag", down, pointer: down });
    if (f.soft) {
      const point = f.soft.limit(f.soft.fromBook(down));
      Object.assign(f, { point });
      f.soft.render(point);
    }
    setCursor("grabbing");
    void turnPage(target, true);
  };

  const onBookPointerUp = () => {
    const f = flip.current;
    if (!f || f.mode !== "drag" || f.released) return;
    f.released = true;
    advance(f);
  };

  const paging = preparingPage || turning;
  // 選んだ曲。ページや検索が変わってその曲が一覧に無くなったら、先頭の曲を表示する
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ページや検索が変わったら目次の先頭へ。Effect ではなく描画中に state を調整する
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const resetKey = `${page}|${submittedKeyword}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setSelectedId(restoreId);
    if (restoreId !== null) setRestoreId(null);
  }
  const selectedIndex = Math.max(
    0,
    records.findIndex((r) => r.id === selectedId),
  );
  const selected = records[selectedIndex];

  // ↑↓キーで目次の曲を移動する
  const listRef = useRef<HTMLOListElement>(null);
  const onListKeyDown = (e: React.KeyboardEvent<HTMLOListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const next = Math.min(
      records.length - 1,
      Math.max(0, selectedIndex + (e.key === "ArrowDown" ? 1 : -1)),
    );
    setSelectedId(records[next]?.id ?? null);
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>("button[data-hymn-row]")
      [next]?.focus();
  };

  const firstLoad = isFetching && records.length === 0;
  const caption = submittedKeyword.trim()
    ? hitCount !== undefined
      ? hitCount > 0
        ? `「${submittedKeyword.trim()}」に近い賛美歌 ・ ${hitCount}曲(全${totalRecords}曲)`
        : `賛美歌 ・ ${totalRecords}曲`
      : `「${submittedKeyword.trim()}」を含む賛美歌 ・ ${totalRecords}曲`
    : `賛美歌 ・ ${totalRecords}曲`;

  return (
    <div className="open-hymnal">
      <header className="open-hymnal-header">
        <Button
          type="button"
          variant="ghost"
          className="h-auto gap-2.5 p-0! font-normal text-[#f3e3c3] hover:bg-transparent hover:text-[#f3e3c3]"
          aria-label="ホーム(検索をリセット)"
          onClick={() => {
            stopPaging();
            onReload();
          }}
        >
          <JerusalemCross className="size-9" />
          <span className="open-hymnal-logo">NASB1995</span>
        </Button>
        {/* 下線だけの検索欄(暗いヘッダー用に枠・背景・影を消している) */}
        {/* <form> にして、Enter での送信(日本語変換中の Enter は除く)をブラウザに任せる */}
        <form
          role="search"
          className="contents"
          onSubmit={(e) => {
            e.preventDefault();
            stopPaging();
            onSearch();
          }}
        >
          <InputGroup className="h-auto w-[min(420px,40vw)] rounded-none border-0 border-b border-[#f3e3c3]/60 bg-transparent px-0.5 py-1.5 text-[#f3e3c3] shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-[#f3e3c3] has-[[data-slot=input-group-control]:focus-visible]:ring-0 dark:bg-transparent">
            <InputGroupAddon className="p-0 text-[13px] font-normal text-[#f3e3c3]/85">
              索引
            </InputGroupAddon>
            <InputGroupInput
              value={keyword}
              onChange={(e) => onKeywordChange(e.target.value)}
              type="text"
              placeholder="曲名・歌詞のキーワードで検索してください"
              aria-label="キーワード"
              className="noto-serif-kr h-auto px-2 py-0 text-base text-white placeholder:font-sans placeholder:text-[13px] placeholder:text-[#f3e3c3]/55 md:text-base dark:bg-transparent"
            />
            <InputGroupAddon align="inline-end" className="p-0">
              <InputGroupButton
                type="submit"
                size="icon-xs"
                aria-label="検索"
                className="text-[#f3e3c3] hover:bg-[#f3e3c3]/12 hover:text-[#f3e3c3]"
              >
                {isFetching ? <Spinner /> : <Search />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
        <Button
          type="button"
          variant="outline"
          className="h-8.5 gap-1.5 rounded-lg border-[#f3e3c3] bg-transparent! px-4 has-[>svg]:px-4 text-sm font-semibold text-[#f3e3c3] shadow-none hover:bg-[#f3e3c3]/12! hover:text-[#f3e3c3]"
          onClick={onLogin}
        >
          <LogIn aria-hidden="true" /> ログイン
        </Button>
      </header>

      <main className="open-hymnal-main">
        {/* 角に乗ると角が折れ、角をつかんでドラッグ・クリックすると紙をめくれる(StPageFlip の soft ページと同じ)。
            キーボードでは下の「← 前」「次 →」を使う */}
        <div
          className="book"
          ref={bookRef}
          onPointerMove={onBookPointerMove}
          onPointerLeave={leaveCorner}
          onPointerDown={onBookPointerDown}
          onPointerUp={onBookPointerUp}
          onPointerCancel={onBookPointerUp}
        >
          {/* ===== 左ページ: 目次 ===== */}
          <section className="book-page book-page--left" aria-label="目次">
            <p className="book-caption">{caption}</p>
            {notice && (
              <Alert
                role="status"
                className="book-sans rounded-none border-0 bg-transparent px-1 pt-0 pb-1 text-xs text-[#8a6400]"
              >
                <AlertDescription className="text-xs text-[#8a6400]">
                  {notice}
                </AlertDescription>
              </Alert>
            )}
            <ol
              ref={listRef}
              className={cn(
                "flex flex-1 flex-col transition-opacity",
                isFetching && records.length > 0 && "opacity-50",
              )}
              onKeyDown={onListKeyDown}
            >
              {firstLoad &&
                Array.from({ length: pageSize }, (_, i) => (
                  <li key={i}>
                    <Item className={BOOK_ROW}>
                      <Skeleton className="h-5 w-7 bg-[#e8dcc1]" />
                      <span className="flex flex-1 flex-col gap-1.5">
                        <Skeleton className="h-4 w-3/4 bg-[#e8dcc1]" />
                        <Skeleton className="h-3 w-1/2 bg-[#e8dcc1]" />
                      </span>
                    </Item>
                  </li>
                ))}
              {!isFetching && records.length === 0 && (
                <li className="book-sans m-auto flex flex-col items-center gap-2 py-10 text-center text-[#6b5338]">
                  <BookOpen className="size-8" aria-hidden="true" />
                  <span className="text-base font-bold">該当データなし</span>
                  <span className="text-sm">
                    別のキーワードで検索してください。
                  </span>
                </li>
              )}
              {records.map((r, i) => {
                const match = terms.length > 0 ? matchOf(r.lineNumber) : null;
                const active = i === selectedIndex;
                return (
                  <li key={r.id}>
                    <Item
                      className={cn(BOOK_ROW, BOOK_ROW_BTN)}
                      render={
                        <button
                          type="button"
                          data-hymn-row
                          data-active={active}
                          aria-current={active ? "true" : undefined}
                          onClick={() => setSelectedId(r.id)}
                        />
                      }
                    >
                      <ItemMedia className={BOOK_ROW_NO}>
                        {hymnNo(page, pageSize, i)}
                      </ItemMedia>
                      <ItemContent className="min-w-0 gap-0">
                        <span className="flex items-baseline gap-1.5">
                          <span className="truncate text-[15px] font-bold">
                            {r.nameJp}
                          </span>
                          <span
                            className="min-w-3 flex-1 -translate-y-1 border-b-2 border-dotted border-(--book-rule)"
                            aria-hidden="true"
                          />
                          {match && (
                            <span
                              className={cn(
                                "shrink-0 text-[11px] tracking-[1px]",
                                match.tone,
                              )}
                              aria-label={match.label}
                            >
                              {match.mark}
                            </span>
                          )}
                        </span>
                        <span className="noto-serif-kr truncate text-xs text-[#5a4630]">
                          {r.nameKr}
                        </span>
                      </ItemContent>
                    </Item>
                  </li>
                );
              })}
            </ol>
            <nav className="book-pager" aria-label="ページ送り">
              <Button
                type="button"
                variant="ghost"
                className={PAGER_BTN}
                aria-disabled={page <= 1 || paging}
                onClick={() => void turnPage(page - 1)}
              >
                ← 前
              </Button>
              <span aria-live="polite">
                {page} / {totalPages}
              </span>
              {preparingPage && (
                <span
                  className="book-pager-progress"
                  role="status"
                  aria-label="ページを読み込み中"
                >
                  <Spinner className="size-3.5" />
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                className={PAGER_BTN}
                aria-disabled={page >= totalPages || paging}
                onClick={() => void turnPage(page + 1)}
              >
                次 →
              </Button>
            </nav>
          </section>

          {/* ===== 右ページ: 選んだ曲 ===== */}
          {selected ? (
            <HymnPage
              key={selected.id}
              hymn={selected}
              terms={terms}
              onDownload={onDownload}
            />
          ) : (
            <article className="book-page book-page--right items-center justify-center text-[#8a7a64]">
              {firstLoad ? (
                <Spinner className="size-6 text-[#800020]" />
              ) : (
                <span className="book-sans text-sm">
                  左の目次から曲を選んでください。
                </span>
              )}
            </article>
          )}
          {flipView && (
            <div
              key={flipView.key}
              ref={layerRef}
              className="book-turn"
              data-direction={flipView.direction}
              aria-hidden="true"
              inert
            />
          )}
        </div>
      </main>
    </div>
  );
}
