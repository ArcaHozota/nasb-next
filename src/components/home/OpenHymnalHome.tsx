"use client";

// src/components/home/OpenHymnalHome.tsx
// PC版ホーム画面「開いた讃美歌集」。
//   左ページ: 讃美歌集の目次(番号・点線・◆の数で一致度)。1ページ11曲。
//   右ページ: 左で選んだ曲。調を選ぶと五線譜の調号が変わり、五線譜を押すとその調の楽譜をダウンロード。
//            歌詞は検索した語を下線で強調して表示する(歌詞の照合)。
// モバイル版(カルーセル)は page.tsx 側のまま。データ取得・検索・ページ送りの状態も page.tsx が持つ。
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, LogIn, Search, SquarePlay } from "lucide-react";
import Highlighted from "@/components/Highlighted";
import KeyStaff from "@/components/home/KeyStaff";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { extractErrorMessage } from "@/lib/constants";
import { keyLabel } from "@/lib/keySignature";
import { countHits, lyricQueryOptions } from "@/lib/lyrics";
import { scoreKeysQueryOptions } from "@/lib/scoreKeys";
import { cn } from "@/lib/utils";

export type BookHymn = {
  id: number;
  nameJp: string;
  nameKr: string;
  link: string;
  lineNumber: string;
};

/** 一致度(lineNumber)ごとの◆表示。検索していないときは出さない */
const MATCH: Record<string, { label: string; mark: string; tone: string }> = {
  CADMIUM: { label: "よく一致", mark: "◆◆◆", tone: "text-[#0d5c33]" },
  BURGUNDY: { label: "一致", mark: "◆◆◇", tone: "text-[#800020]" },
  NAPLES: { label: "やや一致", mark: "◆◇◇", tone: "text-[#8a6400]" },
};
const RELATED = { label: "関連", mark: "◇◇◇", tone: "text-[#8a7a64]" };
const matchOf = (line: string) => MATCH[line] ?? RELATED;

/** 目次の番号(全体での通し番号) */
const hymnNo = (page: number, pageSize: number, i: number) =>
  String((page - 1) * pageSize + i + 1).padStart(2, "0");

function JerusalemCross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 66 66" className={className} aria-hidden="true">
      <g fill="currentColor">
        <rect x="27" y="4" width="12" height="58" />
        <rect x="4" y="27" width="58" height="12" />
        <rect x="15" y="9" width="3" height="13" />
        <rect x="10" y="14" width="13" height="3" />
        <rect x="48" y="9" width="3" height="13" />
        <rect x="43" y="14" width="13" height="3" />
        <rect x="15" y="44" width="3" height="13" />
        <rect x="10" y="49" width="13" height="3" />
        <rect x="48" y="44" width="3" height="13" />
        <rect x="43" y="49" width="13" height="3" />
      </g>
    </svg>
  );
}

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
  onDownload: (id: number, chord?: string) => Promise<void>;
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
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {match && (
            <span className={cn("text-xs tracking-wider", match.tone)}>
              {match.mark} {match.label}
            </span>
          )}
          <h1 className="mt-1 text-[30px] leading-tight font-bold">
            <span className="text-[#800020]">{no}</span>　{hymn.nameJp}
          </h1>
          <p className="noto-serif-kr mt-0.5 text-[17px] text-[#5a4630]">
            {hymn.nameKr}
          </p>
        </div>
        <a
          href={hymn.link}
          target="_blank"
          rel="noopener noreferrer"
          className="book-outline-btn shrink-0"
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
        {keys.map((k) => (
          <button
            key={k.chord}
            type="button"
            aria-pressed={k.chord === chord}
            className={cn("book-key-chip", k.chord === chord && "is-selected")}
            onClick={() => setPicked(k.chord)}
          >
            {keyLabel(k.chord)}
            {k.isOriginal ? "＊" : ""}
          </button>
        ))}
        {keys.some((k) => k.isOriginal) && (
          <span className="text-xs">＊オリジナルキー</span>
        )}
        {keysQuery.error && (
          <span className="text-xs text-[#800020]">
            {extractErrorMessage(keysQuery.error, "楽譜の確認に失敗しました")}
          </span>
        )}
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col border-t border-[#e3d5b8] pt-2.5">
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
        <div className="book-lyric min-h-0 flex-1 overflow-y-auto pr-2">
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
              <Highlighted
                text={lyric}
                terms={terms}
                markClassName="book-mark"
              />
            ) : (
              <p className="book-sans py-6 text-sm text-[#6b5338]">
                歌詞が登録されていません。
              </p>
            ))}
        </div>
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
  onKeywordChange,
  onSearch,
  onReload,
  onLogin,
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
  onKeywordChange: (v: string) => void;
  onSearch: () => void;
  onReload: () => void;
  onLogin: () => void;
  onPageChange: (p: number) => void;
  onDownload: (id: number, chord?: string) => Promise<void>;
}) {
  // 選んだ曲。ページや検索が変わってその曲が一覧に無くなったら、先頭の曲を表示する
  const [selectedId, setSelectedId] = useState<number | null>(null);
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

  // ページが変わったら目次の先頭へ
  useEffect(() => {
    setSelectedId(null);
  }, [page, submittedKeyword]);

  const firstLoad = isFetching && records.length === 0;
  const caption = submittedKeyword.trim()
    ? `「${submittedKeyword.trim()}」を含む賛美歌 ・ ${totalRecords}曲`
    : `賛美歌 ・ ${totalRecords}曲`;

  return (
    <div className="open-hymnal">
      <header className="open-hymnal-header">
        <button
          type="button"
          className="flex items-center gap-2.5 text-[#f3e3c3]"
          aria-label="ホーム(検索をリセット)"
          onClick={onReload}
        >
          <JerusalemCross className="size-9" />
          <span className="open-hymnal-logo">NASB1995</span>
        </button>
        <div className="open-hymnal-search">
          <span className="text-[13px] text-[#f3e3c3]/85">索引</span>
          <input
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSearch();
            }}
            type="text"
            placeholder="韓国語単語で検索してください"
            aria-label="キーワード"
          />
          <button type="button" aria-label="検索" onClick={onSearch}>
            {isFetching ? (
              <Spinner className="size-4" />
            ) : (
              <Search className="size-4" />
            )}
          </button>
        </div>
        <button type="button" className="open-hymnal-login" onClick={onLogin}>
          <LogIn className="size-4" aria-hidden="true" /> ログイン
        </button>
      </header>

      <main className="open-hymnal-main">
        <div className="book">
          {/* ===== 左ページ: 目次 ===== */}
          <section className="book-page book-page--left" aria-label="目次">
            <p className="book-caption">{caption}</p>
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
                  <li key={i} className="book-row">
                    <Skeleton className="h-5 w-7 bg-[#e8dcc1]" />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <Skeleton className="h-4 w-3/4 bg-[#e8dcc1]" />
                      <Skeleton className="h-3 w-1/2 bg-[#e8dcc1]" />
                    </span>
                  </li>
                ))}
              {!isFetching && records.length === 0 && (
                <li className="book-sans m-auto flex flex-col items-center gap-2 py-10 text-center text-[#6b5338]">
                  <BookOpen className="size-8" aria-hidden="true" />
                  <span className="text-base font-bold">該当データなし</span>
                  <span className="text-sm">
                    別の韓国語単語で検索してください。
                  </span>
                </li>
              )}
              {records.map((r, i) => {
                const match = terms.length > 0 ? matchOf(r.lineNumber) : null;
                const active = i === selectedIndex;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      data-hymn-row
                      className={cn("book-row", active && "is-active")}
                      aria-current={active ? "true" : undefined}
                      onClick={() => setSelectedId(r.id)}
                    >
                      <span className="book-row-no">
                        {hymnNo(page, pageSize, i)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-baseline gap-1.5">
                          <span className="truncate text-[15px] font-bold">
                            {r.nameJp}
                          </span>
                          <span className="book-leader" aria-hidden="true" />
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
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <nav className="book-pager" aria-label="ページ送り">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                ← 前
              </button>
              <span aria-live="polite">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                次 →
              </button>
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
        </div>
      </main>
    </div>
  );
}
