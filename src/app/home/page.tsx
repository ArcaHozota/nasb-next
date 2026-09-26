"use client";

// src/app/home/page.tsx
// 旧 views/HomeView.vue を移植
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { ChevronLeft, ChevronRight, LogIn, Search, SearchX } from "lucide-react";
import api from "@/api/axios";
import RippleButton from "@/components/RippleButton";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import { getPageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type HymnRecord = {
  id: number;
  nameJp: string;
  nameKr: string;
  link: string;
  lineNumber: "BURGUNDY" | "NAPLES" | "CADMIUM" | string;
};

type PaginationResponse = {
  records: HymnRecord[];
  totalRecords: number;
};

const SWIPE_THRESHOLD = 50;

const lineClass = (line: string) =>
  ({
    BURGUNDY: "is-burgundy",
    NAPLES: "is-naples",
    CADMIUM: "is-cadmium",
  })[line] ?? EMPTY_STRING;

export default function HomeView() {
  const router = useRouter();
  const toast = useFeedbackStore((s) => s.toast);

  // --- レスポンシブ判定(旧 useMediaQuery("(max-width:700px)")相当) ---
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 700px)");
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // 別端末ログインによる強制ログアウト(axios.ts の401ハンドラ)等で
  // localStorageにセットされたメッセージをトースト表示する。
  useEffect(() => {
    const msg = localStorage.getItem("redirectMessage");
    if (msg) {
      toast(msg);
      localStorage.removeItem("redirectMessage");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const PAGE_SIZE = isMobile ? 4 : 7;

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState(EMPTY_STRING); // 入力欄の値(即時反映)
  const [submittedKeyword, setSubmittedKeyword] = useState(EMPTY_STRING); // 検索確定値(クエリキー用)

  // モバイル/デスクトップ切替でページサイズが変わるため1ページ目から取り直す
  // (初回マウント時は実行しない)
  const isMobileMounted = useRef(false);
  useEffect(() => {
    if (!isMobileMounted.current) {
      isMobileMounted.current = true;
      return;
    }
    setPage(1);
  }, [isMobile]);

  const { data, isFetching, error } = useQuery<PaginationResponse>({
    queryKey: ["hymns-pagination", page, PAGE_SIZE, submittedKeyword],
    queryFn: async () => {
      const { data } = await api.get("/hymns", {
        params: {
          pageNum: page,
          pageSize: PAGE_SIZE,
          keyword: submittedKeyword.normalize("NFC"),
        },
      });
      return data;
    },
    placeholderData: keepPreviousData, // 旧: loading中もDOMを維持しopacity制御、と同じ狙い
  });

  useEffect(() => {
    if (error) {
      const msg = (error as AxiosError<string>)?.response?.data ?? "通信エラー";
      toast(typeof msg === "string" ? msg : "通信エラー");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const records = data?.records ?? [];
  const totalRecords = data?.totalRecords ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const currentBg = isMobile
    ? "/assets/home-bg2.webp"
    : "/assets/home-bg3.webp";

  const onSearch = () => {
    setPage(1);
    setSubmittedKeyword(keyword);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSearch();
  };

  const downloadScore = async (id: number) => {
    try {
      const res = await api.get(`/hymns/${id}/score`, {
        responseType: "blob",
        headers: { Accept: "*/*" },
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast(extractErrorMessage(e, "楽譜の取得に失敗しました"));
    }
  };

  const goLogin = () => router.push("/login");
  const reload = () => {
    setPage(1);
    setKeyword(EMPTY_STRING);
    setSubmittedKeyword(EMPTY_STRING);
  };

  // ===== モバイル: 左右スワイプでページ送り =====
  const touchStart = useRef({ x: 0, y: 0 });

  const onTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStart.current = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
    };
  };

  const goNextPage = () => {
    if (page >= totalPages) {
      toast("これが最後です");
      return;
    }
    setPage((p) => p + 1);
  };

  const goPrevPage = () => {
    if (page <= 1) {
      toast("これが最初です");
      return;
    }
    setPage((p) => p - 1);
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!isMobile) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;

    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) goNextPage();
    else goPrevPage();
  };

  // 旧 MUI <Pagination siblingCount={2}> 相当(前後2ページずつ表示)。
  // 計算は賛美歌一覧と共通の src/lib/pagination.ts に集約。
  const pageItems = getPageItems(page, totalPages, 2);

  return (
    <div className="home relative z-0 min-h-screen bg-cover bg-fixed bg-center">
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={currentBg} alt="" className="h-full w-full object-cover" />
      </div>

      <header className="home-nav sticky top-0 z-10 flex items-center justify-between bg-[#fffef7] px-6 py-2 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
        <div
          className="flex cursor-pointer items-center gap-2"
          onClick={reload}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/jerusalem-cross2.svg"
            alt="NASB1995"
            width={66}
            height={66}
          />
          <span className="effect-shine text-[2.2rem]">NASB1995</span>
        </div>
        <RippleButton
          className={cn(
            buttonVariants({ size: "lg" }),
            "hidden gap-1 bg-warning px-4 font-extrabold text-gray-900 hover:bg-warning/90 md:inline-flex",
          )}
          rippleColor="rgba(0, 0, 0, 0.15)"
          onClick={goLogin}
        >
          <LogIn className="h-4 w-4" /> ログイン
        </RippleButton>
      </header>

      <main
        className="mx-auto max-w-270 px-4 pb-16 pt-8 md:px-4 md:pb-16 md:pt-8"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={`search-row ${isFetching ? "search-loading" : EMPTY_STRING}`}
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            type="text"
            placeholder="韓国語単語で検索してください"
            aria-label="キーワード"
            className="w-full rounded-full border-none bg-white/67 py-3 pl-5 pr-11 text-base outline-none"
            onKeyDown={onSearchKeyDown}
          />
          <button
            type="button"
            className="absolute right-3.5 top-1/2 -translate-y-1/2 border-none bg-none"
            aria-label="検索"
            onClick={onSearch}
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        <div
          // 薄くするのは「前のページのカードを表示したまま次を読み込む」時だけ
          // (初回のスケルトンまで薄くなると見えにくいため)
          className={`card-row ${isFetching && records.length > 0 ? "card-row--loading" : EMPTY_STRING}`}
        >
          {/* 初回読み込み中: カードと同じ形のスケルトン
              (2回目以降のページ切替は keepPreviousData + .card-row--loading で前のカードを薄く表示) */}
          {isFetching &&
            records.length === 0 &&
            Array.from({ length: PAGE_SIZE }, (_, i) => (
              <div key={`skeleton-${i}`} className="glass-card" aria-hidden="true">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-full bg-white/60" />
                  <Skeleton className="h-4 w-4/5 bg-white/60" />
                  <Skeleton className="h-4 w-3/5 bg-white/60" />
                </div>
                <Skeleton className="size-7 self-end rounded-full bg-white/60" />
              </div>
            ))}
          {!isFetching && records.length === 0 && (
            <Empty className="w-full py-10 text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="bg-white/25 text-white backdrop-blur-sm"
                >
                  <SearchX />
                </EmptyMedia>
                <EmptyTitle className="text-white">該当データなし</EmptyTitle>
                <EmptyDescription className="text-white/85">
                  別の韓国語単語で検索してください。
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {records.map((item) => (
            <article
              key={item.id}
              className={`glass-card ${lineClass(item.lineNumber)}`}
            >
              <a
                className="song-name"
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {item.nameJp} / {item.nameKr}
              </a>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="score-btn"
                    aria-label="楽譜ダウンロード"
                    onClick={() => downloadScore(item.id)}
                  >
                    𝄞
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">楽譜ダウンロード</TooltipContent>
              </Tooltip>
            </article>
          ))}
        </div>

        {!isMobile && (
          <div className="pager-row mt-7 flex flex-wrap items-center justify-between gap-3">
            <span className="page-info text-xs text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
              {totalPages}ページ中の{page}ページ、{totalRecords}件
            </span>
            {/* 見た目は従来のすりガラス(.pager-glass / .pager-item)のまま、構造を shadcn/ui の Pagination に */}
            <Pagination className="mx-0 w-auto">
              <PaginationContent className="pager-glass gap-0">
                <PaginationItem>
                  <RippleButton
                    className="pager-item inline-flex items-center justify-center"
                    rippleColor="rgba(0, 0, 0, 0.15)"
                    aria-label="前のページ"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </RippleButton>
                </PaginationItem>
                {pageItems.map((item, idx) =>
                  item === "ellipsis" ? (
                    <PaginationItem key={`e-${idx}`}>
                      <PaginationEllipsis className="pager-ellipsis size-8" />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={item}>
                      <RippleButton
                        className={cn(
                          "pager-item",
                          item === page && "is-selected",
                        )}
                        rippleColor={
                          item === page
                            ? "rgba(255, 255, 255, 0.45)"
                            : "rgba(0, 0, 0, 0.15)"
                        }
                        aria-label={`${item}ページ目`}
                        aria-current={item === page ? "page" : undefined}
                        onClick={() => setPage(item)}
                      >
                        {item}
                      </RippleButton>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <RippleButton
                    className="pager-item inline-flex items-center justify-center"
                    rippleColor="rgba(0, 0, 0, 0.15)"
                    aria-label="次のページ"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </RippleButton>
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        {isMobile && (
          <p className="hint-verse mt-5 text-[13px] font-bold text-[#fffff0] [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]">
            &quot;Heaven and Earth will pass away, but My words will not pass
            away.&quot; --- Luke 21:33
          </p>
        )}
      </main>
    </div>
  );
}
