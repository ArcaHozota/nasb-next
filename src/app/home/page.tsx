"use client";

// src/app/home/page.tsx
// 旧 views/HomeView.vue を移植
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useQuery,
  keepPreviousData,
} from "@tanstack/react-query";
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
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
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

// デスクトップ: 1ページあたりのカード数(ページャーで切替)
const PAGE_SIZE = 7;
// モバイル: カルーセルに一度に追加読み込みする件数
const MOBILE_BATCH_SIZE = 10;
// カルーセルの残りがこの枚数以下になったら次の分を先読みする
const MOBILE_PREFETCH_REMAINING = 4;

const lineClass = (line: string) =>
  ({
    BURGUNDY: "is-burgundy",
    NAPLES: "is-naples",
    CADMIUM: "is-cadmium",
  })[line] ?? EMPTY_STRING;

// ===== カード部品(デスクトップ・モバイル共通) =====

function HymnCard({
  item,
  onScore,
  className,
}: {
  item: HymnRecord;
  onScore: (id: number) => void;
  className?: string;
}) {
  return (
    <article className={cn("glass-card", lineClass(item.lineNumber), className)}>
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
            onClick={() => onScore(item.id)}
          >
            𝄞
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">楽譜ダウンロード</TooltipContent>
      </Tooltip>
    </article>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("glass-card", className)} aria-hidden="true">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-full bg-white/60" />
        <Skeleton className="h-4 w-4/5 bg-white/60" />
        <Skeleton className="h-4 w-3/5 bg-white/60" />
      </div>
      <Skeleton className="size-7 self-end rounded-full bg-white/60" />
    </div>
  );
}

function NoResults() {
  return (
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
  );
}

export default function HomeView() {
  const router = useRouter();
  const toast = useFeedbackStore((s) => s.toast);

  // --- レスポンシブ判定(旧 useMediaQuery("(max-width:700px)")相当) ---
  // null = まだ判定前。判定が済むまでデスクトップ/モバイルどちらのデータ取得も始めない
  // (以前は初回に必ずデスクトップ用の取得が走り、モバイルでは無駄なリクエストになっていた)
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
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

  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState(EMPTY_STRING); // 入力欄の値(即時反映)
  const [submittedKeyword, setSubmittedKeyword] = useState(EMPTY_STRING); // 検索確定値(クエリキー用)

  // モバイル/デスクトップが切り替わったらデスクトップ側は1ページ目に戻す
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
    enabled: isMobile === false,
  });

  // ===== モバイル: カルーセル用の無限読み込み =====
  // ページ送りではなく、横スワイプで1枚ずつ流し、終わりに近づいたら次の分を追加で読み込む。
  const {
    data: mobileData,
    isFetching: mobileFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error: mobileError,
  } = useInfiniteQuery<PaginationResponse>({
    queryKey: ["hymns-infinite", MOBILE_BATCH_SIZE, submittedKeyword],
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get("/hymns", {
        params: {
          pageNum: pageParam,
          pageSize: MOBILE_BATCH_SIZE,
          keyword: submittedKeyword.normalize("NFC"),
        },
      });
      return data;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      allPages.length * MOBILE_BATCH_SIZE < lastPage.totalRecords
        ? allPages.length + 1
        : undefined,
    enabled: isMobile === true,
  });

  const anyError = error ?? mobileError;
  useEffect(() => {
    if (anyError) {
      const msg =
        (anyError as AxiosError<string>)?.response?.data ?? "通信エラー";
      toast(typeof msg === "string" ? msg : "通信エラー");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyError]);

  const records = data?.records ?? [];
  const totalRecords = data?.totalRecords ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));

  const mobileRecords = mobileData?.pages.flatMap((p) => p.records) ?? [];
  const mobileTotal = mobileData?.pages[0]?.totalRecords ?? 0;

  // ===== モバイル: カルーセルの現在位置と先読み =====
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);

  // スライドの枚数は最初から「全件数」で固定し、未取得の分はスケルトンカードで埋めておく。
  // 追加読み込みではスライドの「中身」が入れ替わるだけで枚数は変わらないため、
  // Embla の再計測(reInit)が起きず、読み込みの瞬間にスワイプが空振りすることもない。
  const carouselOptions = useMemo(
    () => ({
      align: "start" as const,
      // 最後のカードも先頭位置まで送れるようにする
      // (カード番号と現在位置が1対1に対応し、「n / 全件」表示がずれない)
      containScroll: false as const,
    }),
    [],
  );

  useEffect(() => {
    if (!carouselApi) return;
    const onSelect = () => setCurrentSlide(carouselApi.selectedScrollSnap());
    onSelect();
    carouselApi.on("select", onSelect);
    carouselApi.on("reInit", onSelect);
    return () => {
      carouselApi.off("select", onSelect);
      carouselApi.off("reInit", onSelect);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (
      isMobile &&
      hasNextPage &&
      !isFetchingNextPage &&
      currentSlide >= mobileRecords.length - MOBILE_PREFETCH_REMAINING
    ) {
      fetchNextPage();
    }
  }, [
    isMobile,
    currentSlide,
    mobileRecords.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  // 検索やロゴクリックでデータが入れ替わる時は、カルーセルを先頭へ戻す
  const resetCarousel = () => {
    carouselApi?.scrollTo(0, true);
    setCurrentSlide(0);
  };
  const currentBg = isMobile
    ? "/assets/home-bg2.webp"
    : "/assets/home-bg3.webp";

  const onSearch = () => {
    setPage(1);
    setSubmittedKeyword(keyword);
    resetCarousel();
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
    resetCarousel();
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

      <main className="mx-auto max-w-270 px-4 pb-16 pt-8 md:px-4 md:pb-16 md:pt-8">
        <div
          className={`search-row ${isFetching || mobileFetching ? "search-loading" : EMPTY_STRING}`}
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

        {/* ===== デスクトップ: 横一列のカード + ページャー ===== */}
        {isMobile === false && (
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
                <SkeletonCard key={`skeleton-${i}`} />
              ))}
            {!isFetching && records.length === 0 && <NoResults />}
            {records.map((item) => (
              <HymnCard key={item.id} item={item} onScore={downloadScore} />
            ))}
          </div>
        )}

        {/* ===== モバイル: 1枚+次の端がのぞくカルーセル(横スワイプ、終わりに近づくと自動で追加読み込み) ===== */}
        {isMobile === true && (
          <>
            {mobileFetching && mobileRecords.length === 0 ? (
              <div className="flex gap-3 overflow-hidden">
                <SkeletonCard className="is-slide w-4/5 shrink-0" />
                <SkeletonCard className="is-slide w-4/5 shrink-0" />
              </div>
            ) : mobileRecords.length === 0 ? (
              <NoResults />
            ) : (
              <Carousel
                setApi={setCarouselApi}
                opts={carouselOptions}
                aria-label="賛美歌カード"
              >
                <CarouselContent className="-ml-3">
                  {Array.from({ length: mobileTotal }, (_, i) => {
                    const item = mobileRecords[i];
                    return (
                      // key は位置(i)で固定: 読み込み完了でスライド自体を差し替えず、中身だけ入れ替える
                      <CarouselItem key={i} className="basis-4/5 pl-3">
                        {item ? (
                          <HymnCard
                            item={item}
                            onScore={downloadScore}
                            className="is-slide h-full"
                          />
                        ) : (
                          <SkeletonCard className="is-slide h-full" />
                        )}
                      </CarouselItem>
                    );
                  })}
                </CarouselContent>
              </Carousel>
            )}
            {mobileTotal > 0 && (
              <p
                className="page-info mt-3 text-center text-xs text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]"
                aria-live="polite"
              >
                {Math.min(currentSlide + 1, mobileTotal)} / {mobileTotal}件
              </p>
            )}
          </>
        )}

        {isMobile === false && (
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
