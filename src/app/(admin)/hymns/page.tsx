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
  Music,
  NotebookPen,
  Trash2,
  FileDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import api from "@/api/axios";
import {
  createPlaylistAndWait,
  getYoutubeReauthConfirmText,
  PlaylistError,
} from "@/lib/youtube";
import { useFeedbackStore } from "@/stores/feedback";
import { useAuthStore } from "@/stores/auth";
import {
  EMPTY_STRING,
  extractErrorMessage,
  utf8ToBase64,
} from "@/lib/constants";
import { asStr } from "@/lib/form";
import HymnScoreModal from "@/components/HymnScoreModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import Hint from "@/components/Hint";
import ClampText from "@/components/ClampText";
import ScoreKeyPopover, { type ScoreKey } from "@/components/ScoreKeyPopover";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
import { fetchScoreKeysCached, invalidateScoreKeys } from "@/lib/scoreKeys";
import { hymnNameSizeClass } from "@/lib/text";

type HymnRow = {
  id: number;
  nameJp: string;
  nameKr: string;
  link: string;
  lineNumber: string;
};

// 検索時に「番号」列へ出す一致度(lineNumber の値 → 表示)
const MATCH_LEVEL: Record<string, { label: string; chip: string }> = {
  CADMIUM: { label: "よく一致", chip: "bg-emerald-100 text-emerald-800" },
  BURGUNDY: { label: "一致", chip: "bg-rose-100 text-[#800020]" },
  NAPLES: { label: "やや一致", chip: "bg-amber-100 text-amber-900" },
};
const MATCH_RELATED = { label: "関連", chip: "bg-gray-100 text-gray-600" };

// 操作列のアイコンボタン(白地・薄い枠・角丸の正方形)
const ACTION_BUTTON =
  "size-8 rounded-lg border border-gray-200 bg-white shadow-none hover:bg-gray-50";

// ページャーのボタン(shadcn/ui の Button。現在ページは default=burgundy の塗り)
const PAGER_BUTTON =
  "text-sm text-gray-600 hover:bg-primary/10 hover:text-primary disabled:opacity-30";
const PAGER_RIPPLE = "rgba(128, 0, 32, 0.2)";

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

  // 検索中は「番号」列を一致度に切り替える(検索確定後のキーワードで判定)
  const isSearching = submittedKeyword.trim() !== EMPTY_STRING;

  // 行クリック: 曲のYouTubeリンクを新しいタブで開く
  const openYoutube = (row: HymnRow) => {
    if (row.link) window.open(row.link, "_blank", "noopener,noreferrer");
  };

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
      `この「${item.nameJp}」という歌の情報を削除してもよろしいですか？`,
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

  // この曲で楽譜が登録されている調の一覧(失敗時はトーストを出して null)
  const fetchScoreKeys = async (id: number): Promise<ScoreKey[] | null> => {
    try {
      return await fetchScoreKeysCached(queryClient, id);
    } catch (e: unknown) {
      feedback.toast(extractErrorMessage(e, "楽譜の取得に失敗しました"));
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
      await createPlaylistAndWait(hymnIds);
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
        // 連携トークン失効・取り消し(再認証が必要)の場合は、専用文言で「はい／いいえ」を確認する
        const reauthText = getYoutubeReauthConfirmText(e);
        const ok = reauthText
          ? await feedback.confirm(reauthText, "確認", {
              cancelLabel: "いいえ",
              confirmLabel: "はい",
            })
          : await feedback.confirm(
              "YouTube連携がまだ完了していません。連携ページへ移動しますか？",
            );
        if (ok) router.push(`/personal?userId=${userId}`);
        return;
      }
      feedback.toast(
        e instanceof PlaylistError
          ? e.message
          : extractErrorMessage(e, "プレイリスト作成に失敗しました"),
      );
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

      <Card className="hymnlist-card glass-panel glass-panel--gray relative overflow-hidden rounded-[18px] gap-0 py-0">
        <CardHeader className="gap-0 noto-serif flex items-center bg-gray-800 px-4 py-3 text-white">
          <LayoutGrid className="mr-2 h-5 w-5" />
          <CardTitle
            role="heading"
            aria-level={1}
            className="text-lg leading-normal"
          >
            賛美歌情報メンテナンス
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <div className="mb-4 grid grid-cols-[12%_34%_30%_24%] items-center gap-2">
            <div className="col-span-2">
              <InputGroup className="max-w-120 has-[[data-slot=input-group-control]:focus-visible]:border-primary has-[[data-slot=input-group-control]:focus-visible]:ring-primary/20">
                <InputGroupInput
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  type="text"
                  placeholder="キーワードを入力してください"
                  aria-label="キーワード"
                  onKeyDown={onSearchKeyDown}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label="検索"
                    onClick={onSearch}
                  >
                    <Search />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>

            {/* 韓国語名列に対応する空セル(グリッド比率合わせのためのスペーサー) */}
            <div />

            {/* 操作列と同じ幅のセルに収め、列内で中央寄せにする
                (下の操作列のアイコンボタンと同じjustify-center) */}
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="success"
                className="font-bold"
                type="button"
                onClick={goAdd}
              >
                <CirclePlus className="h-4 w-4" /> 賛美歌情報追加
              </Button>
              <Hint label="プレイリスト作成">
                <Button
                  size="icon"
                  aria-label="プレイリスト作成"
                  type="button"
                  disabled={creatingPlaylist}
                  onClick={onCreatePlaylist}
                >
                  {creatingPlaylist ? (
                    <Spinner />
                  ) : (
                    <ListMusic className="h-4 w-4" />
                  )}
                </Button>
              </Hint>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-gray-200">
            <Table className="hymn-table table-fixed">
              <colgroup>
                <col style={{ width: "12%" }} />
                <col style={{ width: "34%" }} />
                <col style={{ width: "30%" }} />
                <col style={{ width: "24%" }} />
              </colgroup>
              <TableHeader className="bg-gray-50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-3 font-bold text-gray-600">
                    {isSearching ? "一致度" : "番号"}
                  </TableHead>
                  <TableHead className="px-3 font-bold text-gray-600">
                    曲名
                  </TableHead>
                  <TableHead className="px-3 font-bold text-gray-600">
                    韓国語名
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
                    <TableRow
                      key={`skeleton-${i}`}
                      className="hover:bg-transparent"
                    >
                      <TableCell className="px-3 py-2">
                        <Skeleton className="h-4 w-8 bg-gray-300/70" />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Skeleton className="h-4 w-3/4 bg-gray-300/70" />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Skeleton className="h-4 w-2/3 bg-gray-300/70" />
                      </TableCell>
                      <TableCell className="px-3 py-2">
                        <Skeleton className="mx-auto h-8 w-32 bg-gray-300/70" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isFetching && records.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={4}
                      className="px-3 py-6 text-center text-gray-400"
                    >
                      データがありません
                    </TableCell>
                  </TableRow>
                )}
                {records.map((row, i) => {
                  const level = MATCH_LEVEL[row.lineNumber] ?? MATCH_RELATED;
                  return (
                    <TableRow
                      key={row.id}
                      // 行をクリック(またはEnter)すると YouTube を新しいタブで開く
                      tabIndex={row.link ? 0 : undefined}
                      aria-label={
                        row.link ? `${row.nameJp}をYouTubeで開く` : undefined
                      }
                      className={cn(
                        row.link && "cursor-pointer",
                        // ページ切替中は前ページの行を薄く表示する
                        isFetching && "opacity-50",
                      )}
                      onClick={() => openYoutube(row)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && e.target === e.currentTarget)
                          openYoutube(row);
                      }}
                    >
                      <TableCell className="px-3 py-2">
                        {isSearching ? (
                          <span
                            className={cn(
                              "inline-block rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap",
                              level.chip,
                            )}
                          >
                            {level.label}
                          </span>
                        ) : (
                          <span className="font-bold text-gray-500 tabular-nums">
                            {String((page - 1) * pageSize + i + 1).padStart(
                              2,
                              "0",
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="col-name px-3 py-2">
                        {/* 長い名称は文字サイズを縮小(表示幅34〜66: 0.8倍 / 67以上: 0.66倍)。
                            2行まで折り返し、それ以上は「…」で省略。省略時のみホバーで全文を表示 */}
                        <ClampText
                          text={row.nameJp}
                          className={hymnNameSizeClass(row.nameJp)}
                        />
                      </TableCell>
                      <TableCell className="col-name px-3 py-2">
                        {/* 日本語名称と同じルールで縮小・2行まで */}
                        <ClampText
                          text={row.nameKr}
                          className={cn(
                            "col-name-kr",
                            hymnNameSizeClass(row.nameKr),
                          )}
                        />
                      </TableCell>
                      {/* 操作列のクリックは行(YouTube)へ伝えない。
                          調を選ぶふきだしは Portal だが React 上は子なので、ここで止まる */}
                      <TableCell
                        className="px-3 py-2"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-center gap-1.5">
                          <Hint label="楽譜アップロード">
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className={cn(ACTION_BUTTON, "text-gray-700")}
                              aria-label="楽譜アップロード"
                              onClick={() => openScoreModal(row)}
                            >
                              <Music />
                            </Button>
                          </Hint>
                          <Hint label="編集">
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className={cn(ACTION_BUTTON, "text-gray-700")}
                              aria-label="編集"
                              onClick={() => goEdit(row.id)}
                            >
                              <NotebookPen />
                            </Button>
                          </Hint>
                          <Hint label="削除">
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className={cn(
                                ACTION_BUTTON,
                                "text-red-600 hover:text-red-700",
                              )}
                              aria-label="削除"
                              onClick={() => onDelete(row)}
                            >
                              <Trash2 />
                            </Button>
                          </Hint>
                          {/* 楽譜が複数あるときは、アイコンの右にふきだしで調を選ばせる */}
                          <ScoreKeyPopover
                            id={row.id}
                            fetchKeys={fetchScoreKeys}
                            download={downloadScore}
                            side="right"
                          >
                            {({ onClick, loading, open, anchorRef }) => (
                              <Hint label="楽譜をダウンロード">
                                <Button
                                  ref={anchorRef}
                                  variant="outline"
                                  size="icon-sm"
                                  className={cn(
                                    ACTION_BUTTON,
                                    "text-gray-700",
                                    loading && "pointer-events-none opacity-50",
                                  )}
                                  aria-label="楽譜をダウンロード"
                                  aria-haspopup="menu"
                                  aria-expanded={open}
                                  onClick={onClick}
                                >
                                  <FileDown />
                                </Button>
                              </Hint>
                            )}
                          </ScoreKeyPopover>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* ページネーション(旧 DataGrid の paginationMode="server" 相当) */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
            <div>
              全{totalRecords}件 / {page} / {totalPages}ページ
            </div>
            <div className="flex items-center gap-3">
              <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
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
                    <Hint label="前のページ">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className={PAGER_BUTTON}
                        rippleColor={PAGER_RIPPLE}
                        type="button"
                        aria-label="前のページ"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft />
                      </Button>
                    </Hint>
                  </PaginationItem>
                  {getPageItems(page, totalPages).map((item, i) =>
                    item === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${i}`}>
                        <PaginationEllipsis className="size-8 text-gray-400" />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={item}>
                        <Button
                          variant={item === page ? "default" : "ghost"}
                          size="icon-sm"
                          className={
                            item === page ? "pointer-events-none" : PAGER_BUTTON
                          }
                          rippleColor={PAGER_RIPPLE}
                          type="button"
                          aria-label={`${item}ページ目`}
                          aria-current={item === page ? "page" : undefined}
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </Button>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <Hint label="次のページ">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className={PAGER_BUTTON}
                        rippleColor={PAGER_RIPPLE}
                        type="button"
                        aria-label="次のページ"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight />
                      </Button>
                    </Hint>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </div>
        </CardContent>
      </Card>

      {scoreModalHymn !== null && (
        <HymnScoreModal
          hymnId={scoreModalHymn.id}
          hymnNameKr={scoreModalHymn.nameKr}
          onClose={closeScoreModal}
          onUploaded={() => {
            queryClient.invalidateQueries({ queryKey: ["hymns-list"] });
            // 調の一覧も変わるので、この曲のキャッシュを捨てる
            void invalidateScoreKeys(queryClient, scoreModalHymn.id);
          }}
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
