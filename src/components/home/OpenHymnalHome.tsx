"use client";

// src/components/home/OpenHymnalHome.tsx
// PC版ホーム画面「開いた讃美歌集」。
//   左ページ: 讃美歌集の目次(番号・点線・◆の数で一致度)。1ページ10曲。
//   右ページ: 左で選んだ曲。調を選ぶと五線譜の調号が変わり、五線譜を押すとその調の楽譜をダウンロード。
//            歌詞は検索した語を下線で強調して表示する(歌詞の照合)。
// モバイル版(カルーセル)は page.tsx 側のまま。データ取得・検索・ページ送りの状態も page.tsx が持つ。
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, LogIn, Search, SquarePlay } from "lucide-react";
import Highlighted from "@/components/Highlighted";
import JerusalemCross from "@/components/JerusalemCross";
import BookPageTurn, {
  captureBookTurn,
  type BookTurn,
} from "@/components/home/BookPageTurn";
import KeyStaff from "@/components/home/KeyStaff";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { scoreKeysQueryOptions } from "@/lib/scoreKeys";
import { cn } from "@/lib/utils";
import { useFeedbackStore } from "@/stores/feedback";
import type { HymnSummary } from "@/api/hymns";

type BookHymn = HymnSummary;

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
  "h-auto p-0 text-[13px] font-normal text-(--book-blue) hover:bg-transparent hover:text-(--book-blue) aria-disabled:opacity-50";

/** 目次の1行(shadcn/ui の Item)。点線の下罫線・押せる行のホバーと選択中の背景は、本のデザインに合わせて上書きする */
// 1行の高さは約 58.5px(上下の余白 7.5px × 2 + 曲名2行 42.48px + 点線 1px)
const BOOK_ROW =
  "w-full flex-nowrap! items-baseline! text-base! leading-normal! gap-3! rounded-none! border-0 border-b border-dotted border-(--book-rule)! px-2! py-[7.5px]! text-left";
const BOOK_ROW_BTN =
  "hover:bg-(--book-hover) data-[active=true]:bg-(--book-selected) focus-visible:ring-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--book-blue)";
/** 目次の番号 */
const BOOK_ROW_NO =
  "w-7.5 justify-start text-lg leading-[27px] font-bold text-(--book-blue)";

/** 目次の番号(全体での通し番号) */
const hymnNo = (page: number, pageSize: number, i: number) =>
  String((page - 1) * pageSize + i + 1).padStart(2, "0");

// ===== 右ページ: 選んだ曲 =====
// key={id} で曲ごとに作り直すので、選んだ調などの状態は曲を変えると初期化される
function HymnPage({
  hymn,
  no,
  terms,
  onDownload,
}: {
  hymn: BookHymn;
  no: string;
  terms: string[];
  onDownload: (id: string, chord?: string) => Promise<void>;
}) {
  const keysQuery = useQuery(scoreKeysQueryOptions(hymn.id));
  const lyricQuery = useQuery(lyricQueryOptions(hymn.id));
  const keys = keysQuery.data ?? [];

  // 最初はオリジナルキー、無ければ並びの最初の調
  const [picked, setPicked] = useState<string | null>(null);
  const defaultChord =
    keys.find((k) => k.isOriginal)?.chord ?? keys[0]?.chord ?? null;
  const chord =
    picked && keys.some((k) => k.chord === picked) ? picked : defaultChord;
  const isOriginal = keys.find((k) => k.chord === chord)?.isOriginal ?? false;

  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    if (!chord) return;
    setDownloading(true);
    try {
      await onDownload(hymn.id, chord);
    } finally {
      setDownloading(false);
    }
  };

  const staffState = keysQuery.isPending
    ? "loading"
    : keys.length === 0
      ? "empty"
      : downloading
        ? "downloading"
        : "ready";

  const match = terms.length > 0 ? matchOf(hymn.lineNumber) : null;
  const lyric = lyricQuery.data ?? "";
  const hits = countHits(lyric, terms);

  return (
    <article
      className="book-page book-page--right"
      aria-label={`${hymn.nameJp}の詳細`}
    >
      <div className="book-song-heading flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {match && (
            <span className={cn("text-xs tracking-wider", match.tone)}>
              {match.mark} {match.label}
            </span>
          )}
          <h1 className="mt-1 text-[30px] leading-tight font-bold text-(--book-blue) wrap-anywhere">
            {no}　{hymn.nameJp}
          </h1>
          <p className="noto-serif-kr mt-0.5 text-[17px] text-[#5a4630]">
            {hymn.nameKr}
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          className="book-sans h-9 shrink-0 gap-1.5 rounded-lg border-(--book-blue) bg-transparent! px-3.5 has-[>svg]:px-3.5 text-[13px] font-normal text-(--book-blue) shadow-none hover:bg-(--book-blue)! hover:text-white"
        >
          <a href={hymn.link} target="_blank" rel="noopener noreferrer">
            <SquarePlay className="size-4" aria-hidden="true" />
            YouTubeで聴く
          </a>
        </Button>
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
            type="single"
            value={chord ?? ""}
            onValueChange={(v) => {
              // 選択済みを再クリックすると v が空になるので、選択を維持する
              if (v) setPicked(v);
            }}
            aria-label="調を選ぶ"
            className="flex-wrap gap-2"
          >
            {keys.map((k) => (
              <ToggleGroupItem
                key={k.chord}
                value={k.chord}
                className="h-7.5 min-w-11 rounded-lg! border border-(--book-rule) bg-transparent px-3 text-[13px] font-normal text-[#2b1d14] hover:bg-(--book-hover) hover:text-[#2b1d14] data-[state=on]:border-(--book-blue) data-[state=on]:bg-(--book-blue) data-[state=on]:text-white"
              >
                {keyLabel(k.chord)}
                {k.isOriginal ? "＊" : ""}
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
        {/* Radix の中身ラッパー(display: table)だと長い行で横に伸びるため、block に戻す */}
        <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block!">
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
  const [bookTurn, setBookTurn] = useState<BookTurn | null>(null);
  const finishTurn = useCallback(() => {
    turnRequest.current = null;
    setPreparingPage(false);
    setBookTurn(null);
  }, []);

  useEffect(
    () => () => {
      // 画面幅の切り替えや画面離脱後に、待機していた応答でページを変更しない。
      turnRequest.current = null;
    },
    [],
  );

  const turnPage = async (targetPage: number) => {
    if (turnRequest.current || targetPage < 1 || targetPage > totalPages)
      return;
    const request = Symbol();
    turnRequest.current = request;
    setPreparingPage(true);

    try {
      await onPreparePage(targetPage);
    } catch (error) {
      if (turnRequest.current === request) {
        finishTurn();
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

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const turn = reduceMotion
      ? null
      : captureBookTurn(
          bookRef.current,
          targetPage > page ? "next" : "previous",
        );
    if (turn) {
      setPreparingPage(false);
      setBookTurn(turn);
    } else {
      finishTurn();
    }
    onPageChange(targetPage);
  };

  const paging = preparingPage || bookTurn !== null;
  // 選んだ曲。ページや検索が変わってその曲が一覧に無くなったら、先頭の曲を表示する
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // ページや検索が変わったら目次の先頭へ。Effect ではなく描画中に state を調整する
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const resetKey = `${page}|${submittedKeyword}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey);
    setSelectedId(null);
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
            finishTurn();
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
            finishTurn();
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
        <div className="book" ref={bookRef}>
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
                    <Item asChild className={cn(BOOK_ROW, BOOK_ROW_BTN)}>
                      <button
                        type="button"
                        data-hymn-row
                        data-active={active}
                        aria-current={active ? "true" : undefined}
                        onClick={() => setSelectedId(r.id)}
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
                      </button>
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
              no={hymnNo(page, pageSize, selectedIndex)}
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
          {bookTurn && <BookPageTurn turn={bookTurn} onFinish={finishTurn} />}
        </div>
      </main>
    </div>
  );
}
