"use client";

// src/app/(admin)/hymns/page.tsx
// 旧 views/HymnList.vue を移植
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  LayoutGrid,
  CirclePlus,
  Search,
  ListMusic,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import api from "@/api/axios";
import RippleButton from "@/components/RippleButton";
import { useFeedbackStore } from "@/stores/feedback";
import { useAuthStore } from "@/stores/auth";
import {
  EMPTY_STRING,
  extractErrorMessage,
  utf8ToBase64,
} from "@/lib/constants";
import HymnScoreModal from "@/components/HymnScoreModal";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getPageItems } from "@/lib/pagination";

type HymnRow = {
  id: number;
  nameJp: string;
  nameKr: string;
  link: string;
  lineNumber: string;
};

const rowClass = (line: string) =>
  ({
    BURGUNDY: "row-burgundy",
    NAPLES: "row-naples",
    CADMIUM: "row-cadmium",
  })[line] ?? EMPTY_STRING;

const asStr = (v: string | null) => v ?? EMPTY_STRING;


// ページャーのボタン(RippleButton に shadcn/ui の Button の見た目を当てる)
const pagerButtonClass = (active = false) =>
  cn(
    buttonVariants({ variant: active ? "default" : "ghost", size: "icon" }),
    "size-8 text-sm",
    active
      ? "pointer-events-none"
      : "text-gray-600 hover:bg-primary/10 hover:text-primary",
  );

function HymnListInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const feedback = useFeedbackStore();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.userId);

  const [page, setPage] = useState(Number(searchParams.get("pageNum")) || 1);
  const [pageSize, setPageSize] = useState(
    Number(searchParams.get("pageSize")) || 10,
  );
  const [keyword, setKeyword] = useState(asStr(searchParams.get("keyword")));
  const [submittedKeyword, setSubmittedKeyword] = useState(
    asStr(searchParams.get("keyword")),
  );

  const { data, isFetching } = useQuery({
    queryKey: ["hymns-list", page, pageSize, submittedKeyword],
    queryFn: async () => {
      const { data } = await api.get("/hymns", {
        params: {
          pageNum: page,
          pageSize: pageSize,
          keyword: submittedKeyword.normalize("NFC"),
        },
      });
      return data as { records: HymnRow[]; totalRecords: number };
    },
    placeholderData: keepPreviousData,
  });

  const records = data?.records ?? [];
  const totalRecords = data?.totalRecords ?? 0;
  const pageSizeOptions = [5, 10, 15];
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  const onSearch = () => {
    setPage(1);
    setSubmittedKeyword(keyword);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSearch();
  };

  const goAdd = () =>
    router.push(`/hymns/add?pageNum=${page}&pageSize=${pageSize}`);

  const goEdit = (id: number) =>
    router.push(
      `/hymns/edit?editId=${id}&pageNum=${page}&pageSize=${pageSize}&keyword=${encodeURIComponent(submittedKeyword)}`,
    );

  // 楽譜アップロードは専用画面への遷移ではなく、モーダルで行う
  const [scoreModalHymn, setScoreModalHymn] = useState<{
    id: number;
    nameKr: string;
  } | null>(null);
  const openScoreModal = (row: HymnRow) =>
    setScoreModalHymn({ id: row.id, nameKr: row.nameKr });
  const closeScoreModal = () => setScoreModalHymn(null);

  const onDelete = async (item: HymnRow) => {
    try {
      await api.get(`/hymns/${item.id}/delete-check`);
    } catch (e: unknown) {
      feedback.toast(extractErrorMessage(e, "削除できません"));
      return;
    }
    const ok = await feedback.confirm(
      `この「${item.nameJp}」という歌の情報を削除するとよろしいでしょうか。`,
      "メッセージ",
    );
    if (!ok) return;
    try {
      const { headers } = await api.delete(`/hymns/${item.id}`);
      const msg = headers["x-page-num"] ?? "削除しました";
      feedback.toast(msg);
      queryClient.invalidateQueries({ queryKey: ["hymns-list"] });
    } catch (e: unknown) {
      feedback.toast(extractErrorMessage(e, "削除に失敗しました"));
    }
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
      const msg = extractErrorMessage(e, "楽譜の取得に失敗しました");
      router.push(`/error?errMsg=${encodeURIComponent(utf8ToBase64(msg))}`);
    }
  };

  const onPageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  // BURGUNDY・CADMIUM行のみを対象にYouTubeプレイリストを作成する。
  // 表示中の1ページ分ではなく、キーワード検索にヒットした全件(ページ横断)が対象。
  // HYMNS.IDはSnowflake生成の19桁数値でJS numberでは精度が壊れるため、
  // String()で文字列として扱う(random-five画面と同じ理由)。
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const onCreatePlaylist = async () => {
    if (totalRecords === 0) {
      feedback.toast("対象の賛美歌がありません");
      return;
    }
    setCreatingPlaylist(true);
    try {
      const { data: allData } = await api.get("/hymns", {
        params: {
          pageNum: 1,
          pageSize: totalRecords,
          keyword: submittedKeyword.normalize("NFC"),
        },
      });
      const allRecords = (allData?.records ?? []) as HymnRow[];
      const hymnIds = allRecords
        .filter(
          (r) => r.lineNumber === "BURGUNDY" || r.lineNumber === "CADMIUM",
        )
        .map((r) => String(r.id));
      if (hymnIds.length === 0) {
        feedback.toast("対象の賛美歌（BURGUNDY・CADMIUM）がありません");
        return;
      }
      await api.post("/youtube/create-playlist", { hymnIds });
      const proceed = await feedback.confirm(
        "プレイリストを作成しました。今はYouTubeへ移動してよろしいでしょうか。",
        "お知らせ",
        { variant: "success", cancelLabel: "いいえ", confirmLabel: "はい" },
      );
      if (proceed) {
        window.open(
          "https://www.youtube.com/feed/playlists",
          "_blank",
          "noopener,noreferrer",
        );
      }
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "response" in e &&
        (e as { response?: { status?: number } }).response?.status === 409
      ) {
        const ok = await feedback.confirm(
          "YouTube連携がまだ完了していません。連携ページへ移動しますか？",
        );
        if (ok) router.push(`/personal?userId=${userId}`);
        return;
      }
      feedback.toast(extractErrorMessage(e, "プレイリスト作成に失敗しました"));
    } finally {
      setCreatingPlaylist(false);
    }
  };

  return (
    <div className="relative min-h-full bg-cover bg-fixed bg-center">
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/mainmenu-bg5.webp"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <div className="hymnlist-card glass-panel glass-panel--gray relative overflow-hidden rounded-[18px]">
        <div className="noto-serif flex items-center bg-gray-800 px-4 py-3 text-white">
          <LayoutGrid className="mr-2 h-5 w-5" />
          <h1 className="text-lg font-semibold">賛美歌情報メンテナンス</h1>
        </div>

        <div className="p-6">
          <div className="mb-4 grid grid-cols-[30%_26%_10%_10%_24%] items-center gap-2">
            <div className="col-span-2">
              <div className="relative w-full max-w-120">
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  type="text"
                  placeholder="キーワードを入力してください"
                  aria-label="キーワード"
                  className="pr-9 focus-visible:border-primary focus-visible:ring-primary/20"
                  onKeyDown={onSearchKeyDown}
                />
                <RippleButton
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  rippleColor="rgba(0, 0, 0, 0.12)"
                  onClick={onSearch}
                >
                  <Search className="h-4 w-4" />
                </RippleButton>
              </div>
            </div>

            {/* リンク・楽譜列に対応する空セル(グリッド比率合わせのためのスペーサー) */}
            <div />
            <div />

            {/* 操作列と同じ30%+26%+10%+10%=76%幅のセルに収め、列内で中央寄せにする
                (下の操作列の「楽譜」等ボタンと同じjustify-center) */}
            <div className="flex items-center justify-center gap-2">
              <RippleButton
                type="button"
                className="flex items-center gap-1 rounded-md bg-success px-4 py-1.5 text-sm font-bold text-white"
                onClick={goAdd}
              >
                <CirclePlus className="h-4 w-4" /> 賛美歌情報追加
              </RippleButton>
              <RippleButton
                type="button"
                title="プレイリスト作成"
                className="flex items-center justify-center rounded-md bg-primary p-2 text-white disabled:opacity-60"
                disabled={creatingPlaylist}
                onClick={onCreatePlaylist}
              >
                {creatingPlaylist ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ListMusic className="h-4 w-4" />
                )}
              </RippleButton>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-gray-200">
            <Table className="hymn-table table-fixed">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "24%" }} />
              </colgroup>
              <TableHeader className="bg-gray-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3 font-bold text-gray-600">
                    名称
                  </TableHead>
                  <TableHead className="px-3 font-bold text-gray-600">
                    韓国語名称
                  </TableHead>
                  <TableHead className="px-3 text-center font-bold text-gray-600">
                    リンク
                  </TableHead>
                  <TableHead className="px-3 text-center font-bold text-gray-600">
                    楽譜
                  </TableHead>
                  <TableHead className="px-3 text-center font-bold text-gray-600">
                    操作
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="noto-serif font-medium">
                {/* 初回読み込み中はスケルトン行(ページ切替中は keepPreviousData で前の行を薄く残す) */}
                {isFetching &&
                  records.length === 0 &&
                  Array.from({ length: pageSize }, (_, i) => (
                    <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                      <TableCell className="px-3 py-2">
                        <Skeleton className="h-4 w-3/4 bg-gray-300/70" />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Skeleton className="h-4 w-2/3 bg-gray-300/70" />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Skeleton className="mx-auto h-4 w-8 bg-gray-300/70" />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Skeleton className="mx-auto h-4 w-4 bg-gray-300/70" />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Skeleton className="mx-auto h-6 w-32 bg-gray-300/70" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isFetching && records.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="px-3 py-6 text-center text-gray-400"
                    >
                      データがありません
                    </TableCell>
                  </TableRow>
                )}
                {records.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      rowClass(row.lineNumber),
                      // ページ切替中は前ページの行を薄く表示する
                      isFetching && "opacity-50",
                    )}
                  >
                    <TableCell className="col-name px-3 py-2">
                      {/* 長い名称は2行まで折り返し、それ以上は「…」で省略。全文はホバーで表示 */}
                      <span className="line-clamp-2" title={row.nameJp}>
                        {row.nameJp}
                      </span>
                    </TableCell>
                    <TableCell className="col-name px-3 py-2">
                      {/* 長い名称は2行まで折り返し、それ以上は「…」で省略。全文はホバーで表示 */}
                      <span
                        className="col-name-kr line-clamp-2"
                        title={row.nameKr}
                      >
                        {row.nameKr}
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-center">
                      <a
                        href={row.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Link
                      </a>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-center">
                      <a
                        href="#"
                        aria-label="楽譜をダウンロード"
                        onClick={(e) => {
                          e.preventDefault();
                          downloadScore(row.id);
                        }}
                      >
                        𝄞
                      </a>
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex justify-center gap-1">
                        <RippleButton
                          className="rounded bg-secondary px-2 py-1 text-xs text-white"
                          onClick={() => openScoreModal(row)}
                        >
                          楽譜
                        </RippleButton>
                        <RippleButton
                          className="rounded bg-primary px-2 py-1 text-xs text-white"
                          onClick={() => goEdit(row.id)}
                        >
                          編集
                        </RippleButton>
                        <RippleButton
                          className="rounded bg-warning px-2 py-1 text-xs text-gray-900"
                          rippleColor="rgba(0, 0, 0, 0.18)"
                          onClick={() => onDelete(row)}
                        >
                          削除
                        </RippleButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ページネーション(旧 DataGrid の paginationMode="server" 相当) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
            <div>
              全{totalRecords}件 / {page} / {totalPages}ページ
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={String(pageSize)}
                onValueChange={onPageSizeChange}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="1ページの件数"
                  className="bg-white focus-visible:border-primary focus-visible:ring-primary/20"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((opt) => (
                    <SelectItem key={opt} value={String(opt)}>
                      {opt}件/ページ
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Pagination className="mx-0 w-auto">
                <PaginationContent className="gap-0.5 rounded-md border border-gray-300 bg-white p-0.5">
                  <PaginationItem>
                    <RippleButton
                      type="button"
                      aria-label="前のページ"
                      title="前のページ"
                      className={cn(pagerButtonClass(), "disabled:opacity-30")}
                      rippleColor="rgba(128, 0, 32, 0.2)"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft />
                    </RippleButton>
                  </PaginationItem>
                  {getPageItems(page, totalPages).map((item, i) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis className="size-8 text-gray-400" />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <RippleButton
                          type="button"
                          aria-label={`${item}ページ目`}
                          aria-current={item === page ? "page" : undefined}
                          className={pagerButtonClass(item === page)}
                          rippleColor="rgba(128, 0, 32, 0.2)"
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </RippleButton>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <RippleButton
                      type="button"
                      aria-label="次のページ"
                      title="次のページ"
                      className={cn(pagerButtonClass(), "disabled:opacity-30")}
                      rippleColor="rgba(128, 0, 32, 0.2)"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      <ChevronRight />
                    </RippleButton>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </div>
      </div>

      {scoreModalHymn !== null && (
        <HymnScoreModal
          hymnId={scoreModalHymn.id}
          hymnNameKr={scoreModalHymn.nameKr}
          onClose={closeScoreModal}
          onUploaded={() =>
            queryClient.invalidateQueries({ queryKey: ["hymns-list"] })
          }
        />
      )}
    </div>
  );
}

export default function HymnList() {
  return (
    <Suspense fallback={null}>
      <HymnListInner />
    </Suspense>
  );
}
