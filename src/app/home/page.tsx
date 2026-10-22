"use client";

// src/app/home/page.tsx
// 旧 views/HomeView.vue を移植
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { LogIn, ScrollText, Search, SearchX } from "lucide-react";
import api from "@/api/axios";
import { type ScoreKey } from "@/components/ScoreKeyPopover";
import ScoreKeyDialog from "@/components/ScoreKeyDialog";
import LyricViewer, { type LyricTarget } from "@/components/LyricViewer";
import OpenHymnalHome from "@/components/home/OpenHymnalHome";
import { extractTerms } from "@/lib/lyrics";
import {
  searchIndexQueryOptions,
  searchLocal,
  shouldSearchOnServer,
} from "@/lib/localSearch";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import { fetchScoreKeysCached } from "@/lib/scoreKeys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  /** 検索キーワードを含む歌詞の一行(検索したときだけサーバーが付ける) */
  snippet?: string | null;
};

type PaginationResponse = {
  records: HymnRecord[];
  totalRecords: number;
};

// デスクトップ(開いた讃美歌集): 左ページの目次に並べる曲数(ページ送りで切替)
const PAGE_SIZE = 11;
// モバイル: カルーセルに一度に追加読み込みする件数
const MOBILE_BATCH_SIZE = 10;
// カルーセルの残りがこの枚数以下になったら次の分を先読みする
const MOBILE_PREFETCH_REMAINING = 4;
// 未取得のスライドのうち、現在位置からこの枚数以内だけスケルトンカードを描く。
// それより遠いスライドは同じ大きさの空の箱にして、ぼかし・影・アニメーションを持たせない
// (画面に入らないので見た目は変わらない。スワイプで近づくとスケルトンに切り替わる)
const MOBILE_SKELETON_WINDOW = 4;

const lineClass = (line: string) =>
  ({
    BURGUNDY: "is-burgundy",
    NAPLES: "is-naples",
    CADMIUM: "is-cadmium",
  })[line] ?? EMPTY_STRING;

// ===== カード部品(モバイルのカルーセル) =====
// PC版は components/home/OpenHymnalHome.tsx(開いた讃美歌集)で表示する。

// 調を選ぶダイアログ・歌詞シートをカードと同じガラス風にする。
// 色はカードの色(.glass-card.is-burgundy 等)に合わせ、カードの兄弟のように見せる。
const BUBBLE_GLASS =
  "rounded-[18px] border-white/45 text-white backdrop-blur-[20px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.8)]";
const BUBBLE_ITEM =
  "text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.66)] hover:bg-white/25 hover:text-white focus-visible:bg-white/25";
const bubbleTone = (line: string) =>
  ({
    BURGUNDY: {
      bg: "bg-[rgba(128,0,32,0.55)]",
      arrow: "fill-[rgba(128,0,32,0.55)]",
    },
    NAPLES: {
      bg: "bg-[rgba(246,201,28,0.6)]",
      arrow: "fill-[rgba(246,201,28,0.6)]",
    },
    CADMIUM: {
      bg: "bg-[rgba(13,92,51,0.55)]",
      arrow: "fill-[rgba(13,92,51,0.55)]",
    },
  })[line] ?? {
    bg: "bg-[rgba(255,255,255,0.4)]",
    arrow: "fill-[rgba(255,255,255,0.4)]",
  };

// React.memo: モバイルではスワイプのたびに親(HomeView)が再描画されるため、
// props が変わらないカードは描き直さない
const HymnCard = memo(function HymnCard({
  item,
  onScore,
  onLyric,
  className,
}: {
  item: HymnRecord;
  onScore: (id: number) => void;
  /** 歌詞を表示する(画面の下から出るシート) */
  onLyric: (item: HymnRecord) => void;
  className?: string;
}) {
  return (
    <article
      className={cn("glass-card", lineClass(item.lineNumber), className)}
    >
      <div className="flex flex-col gap-2">
        <a
          className="song-name"
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.nameJp} / {item.nameKr}
        </a>
      </div>
      <div className="card-actions">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="score-btn lyric-btn"
              aria-label="歌詞"
              onClick={() => onLyric(item)}
            >
              <ScrollText aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">歌詞</TooltipContent>
        </Tooltip>
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
      </div>
    </article>
  );
});

const SkeletonCard = memo(function SkeletonCard({
  className,
}: {
  className?: string;
}) {
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
});

/** モバイルのカルーセルの1スライドに何を描くか */
type SlideKind = "card" | "skeleton" | "placeholder";

/**
 * モバイルのカルーセルの1スライド。
 * スライドの枚数は全件数で固定のまま(Embla の reInit を起こさない)、中身だけを3段階で切り替える。
 *   card        : 取得済みの賛美歌カード
 *   skeleton    : 未取得で、現在位置の近く(読み込み中だと分かる見た目)
 *   placeholder : 未取得で、現在位置から遠い(同じ大きさの空の箱。描画コストほぼゼロ)
 * memo により、スワイプで親が再描画されても kind / item が変わったスライドだけが描き直される。
 */
const CarouselSlide = memo(function CarouselSlide({
  kind,
  item,
  onScore,
  onLyric,
}: {
  kind: SlideKind;
  item: HymnRecord | undefined;
  onScore: (id: number) => void;
  onLyric: (item: HymnRecord) => void;
}) {
  return (
    <CarouselItem className="basis-4/5 pl-3">
      {kind === "card" && item ? (
        <HymnCard
          item={item}
          onScore={onScore}
          onLyric={onLyric}
          className="is-slide h-full"
        />
      ) : kind === "skeleton" ? (
        <SkeletonCard className="is-slide h-full" />
      ) : (
        // .glass-card.is-slide と同じ高さを確保し、カルーセルの高さが変わらないようにする
        <div className="h-full min-h-[44vh]" aria-hidden="true" />
      )}
    </CarouselItem>
  );
});

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
  const queryClient = useQueryClient();

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

  // ===== 検索の振り分け =====
  // ハングルを含む / 先頭が * ★ # / & を含む入力はサーバー検索(従来どおり)。
  // それ以外(日本語・英語など)は、画面側で曲名・日本語/英語の歌詞に照らして並べる。
  const localCandidate = useMemo(
    () => submittedKeyword.trim() !== "" && !shouldSearchOnServer(submittedKeyword),
    [submittedKeyword],
  );
  const indexQuery = useQuery({
    ...searchIndexQueryOptions,
    enabled: localCandidate,
  });
  // 索引の取得に失敗したときは、画面検索をあきらめてサーバー検索に戻す
  const isLocal = localCandidate && !indexQuery.isError;
  const local = useMemo(
    () =>
      isLocal && indexQuery.data
        ? searchLocal(indexQuery.data, submittedKeyword)
        : null,
    [isLocal, indexQuery.data, submittedKeyword],
  );
  const localAll: HymnRecord[] = local?.records ?? [];
  // モバイル: カルーセルの現在位置(画面検索では、この位置から先読み分だけカードを描く)
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentSlide, setCurrentSlide] = useState(0);
  // 一致が1曲も無かったときの案内(全曲を通常の順序で出している)
  const localNotice =
    isLocal && local && local.hitCount === 0
      ? "一致する曲が見つからなかったため、通常の順序で表示しています"
      : null;

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
    enabled: isMobile === false && !isLocal,
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
    enabled: isMobile === true && !isLocal,
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

  const records: HymnRecord[] = isLocal
    ? localAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : (data?.records ?? []);
  const totalRecords = isLocal ? localAll.length : (data?.totalRecords ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  // 画面検索では、索引を取得し終えるまでが「読み込み中」
  const desktopBusy = isLocal ? indexQuery.isPending : isFetching;

  const mobileRecords: HymnRecord[] = isLocal
    ? localAll.slice(0, currentSlide + MOBILE_BATCH_SIZE)
    : (mobileData?.pages.flatMap((p) => p.records) ?? []);
  const mobileTotal = isLocal
    ? localAll.length
    : (mobileData?.pages[0]?.totalRecords ?? 0);
  const mobileBusy = isLocal ? indexQuery.isPending : mobileFetching;

  // ===== モバイル: カルーセルの現在位置と先読み =====

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
      !isLocal &&
      hasNextPage &&
      !isFetchingNextPage &&
      currentSlide >= mobileRecords.length - MOBILE_PREFETCH_REMAINING
    ) {
      fetchNextPage();
    }
  }, [
    isMobile,
    isLocal,
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

  // この曲で楽譜が登録されている調の一覧(失敗時はトーストを出して null)
  const fetchScoreKeys = async (id: number): Promise<ScoreKey[] | null> => {
    try {
      return await fetchScoreKeysCached(queryClient, id);
    } catch (e: unknown) {
      toast(extractErrorMessage(e, "楽譜の取得に失敗しました"));
      return null;
    }
  };

  // chord を省略すると、サーバー側がオリジナルキー優先で1件選ぶ
  const downloadScore = async (id: number, chord?: string) => {
    try {
      const res = await api.get(`/hymns/${id}/score`, {
        params: chord ? { chord } : undefined,
        responseType: "blob",
        headers: { Accept: "*/*" },
      });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = chord ? `${id}(${chord}).pdf` : `${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: unknown) {
      toast(extractErrorMessage(e, "楽譜の取得に失敗しました"));
    }
  };

  // モバイル: 調が複数ある曲は中央ダイアログで選ばせ、1件ならそのままダウンロード
  const [keyDialog, setKeyDialog] = useState<{
    item: HymnRecord;
    keys: ScoreKey[];
  } | null>(null);
  const onMobileScore = async (id: number) => {
    const keys = await fetchScoreKeys(id);
    if (keys === null) return;
    const item = mobileRecords.find((r) => r?.id === id);
    if (keys.length > 1 && item) setKeyDialog({ item, keys });
    else await downloadScore(id);
  };
  // カード(memo)に渡すための、参照が変わらない版。
  // 中身は毎回の描画で最新の onMobileScore に差し替えるので、古い mobileRecords を掴むことはない
  const onMobileScoreRef = useRef(onMobileScore);
  useEffect(() => {
    onMobileScoreRef.current = onMobileScore;
  });
  const stableOnMobileScore = useCallback(
    (id: number) => void onMobileScoreRef.current(id),
    [],
  );

  // ===== 歌詞の表示(照合) =====
  // 表示中の曲(null なら閉じている)。モバイルは画面の下から出るシートで表示する
  // (PC版は開いた讃美歌集の右ページに歌詞を常に表示する)
  const [lyricTarget, setLyricTarget] = useState<LyricTarget | null>(null);
  // setState は参照が変わらないので、memo したカードに渡しても再描画を起こさない
  const openLyric = useCallback(
    (item: HymnRecord) =>
      setLyricTarget({
        id: item.id,
        nameJp: item.nameJp,
        nameKr: item.nameKr,
        lineNumber: item.lineNumber,
      }),
    [],
  );
  // ハイライトする語。確定した検索キーワードから作る(入力中の文字では変わらない)
  const lyricTerms = useMemo(
    () => extractTerms(submittedKeyword),
    [submittedKeyword],
  );

  const goLogin = () => router.push("/login");
  const reload = () => {
    setPage(1);
    setKeyword(EMPTY_STRING);
    setSubmittedKeyword(EMPTY_STRING);
    resetCarousel();
  };

  // ===== PC版: 開いた讃美歌集 =====
  // 左ページに目次、右ページに選んだ曲(調号つき五線譜で楽譜ダウンロード・歌詞の照合)
  if (isMobile === false) {
    return (
      <OpenHymnalHome
        records={records}
        totalRecords={totalRecords}
        page={page}
        totalPages={totalPages}
        pageSize={PAGE_SIZE}
        isFetching={desktopBusy}
        keyword={keyword}
        submittedKeyword={submittedKeyword}
        terms={lyricTerms}
        hitCount={isLocal && local ? local.hitCount : undefined}
        notice={localNotice}
        onKeywordChange={setKeyword}
        onSearch={onSearch}
        onReload={reload}
        onLogin={goLogin}
        onPageChange={setPage}
        onDownload={downloadScore}
      />
    );
  }

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
        <Button
          variant="warning"
          size="lg"
          className="hidden gap-1 px-4 font-extrabold md:inline-flex"
          onClick={goLogin}
        >
          <LogIn className="h-4 w-4" /> ログイン
        </Button>
      </header>

      <main className="mx-auto max-w-270 px-4 pb-16 pt-8 md:px-4 md:pb-16 md:pt-8">
        <div
          className={`search-row ${desktopBusy || mobileBusy ? "search-loading" : EMPTY_STRING}`}
        >
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            type="text"
            placeholder="曲名・歌詞のキーワードで検索してください"
            aria-label="キーワード"
            className="w-full rounded-full border-none bg-white/67 py-3 pl-5 pr-11 text-base outline-none"
            onKeyDown={onSearchKeyDown}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full hover:bg-white/50"
            type="button"
            aria-label="検索"
            onClick={onSearch}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {isMobile === true && localNotice && (
          <p
            className="mb-3 text-center text-xs text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.5)]"
            role="status"
          >
            {localNotice}
          </p>
        )}

        {/* ===== モバイル: 1枚+次の端がのぞくカルーセル(横スワイプ、終わりに近づくと自動で追加読み込み) ===== */}
        {isMobile === true && (
          <>
            {mobileBusy && mobileRecords.length === 0 ? (
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
                    const kind: SlideKind = item
                      ? "card"
                      : Math.abs(i - currentSlide) <= MOBILE_SKELETON_WINDOW
                        ? "skeleton"
                        : "placeholder";
                    return (
                      // key は位置(i)で固定: 読み込み完了でスライド自体を差し替えず、中身だけ入れ替える
                      <CarouselSlide
                        key={i}
                        kind={kind}
                        item={item}
                        onScore={stableOnMobileScore}
                        onLyric={openLyric}
                      />
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

        <LyricViewer
          target={lyricTarget}
          terms={lyricTerms}
          variant="sheet"
          onClose={() => setLyricTarget(null)}
          contentClassName={cn(
            BUBBLE_GLASS,
            bubbleTone(lyricTarget?.lineNumber ?? "").bg,
            "border",
          )}
        />

        <ScoreKeyDialog
          open={keyDialog !== null}
          onOpenChange={(o) => {
            if (!o) setKeyDialog(null);
          }}
          title={
            keyDialog
              ? `${keyDialog.item.nameJp} / ${keyDialog.item.nameKr}`
              : undefined
          }
          keys={keyDialog?.keys ?? []}
          onSelect={(chord) => {
            if (keyDialog) void downloadScore(keyDialog.item.id, chord);
          }}
          contentClassName={cn(
            BUBBLE_GLASS,
            bubbleTone(keyDialog?.item.lineNumber ?? "").bg,
            "border",
          )}
          itemClassName={BUBBLE_ITEM}
        />

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
