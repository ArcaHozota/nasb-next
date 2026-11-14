"use client";

// src/app/(admin)/hymns/page.tsx
// 旧 views/HymnList.vue を移植
import { useState } from "react";
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
  fetchHymnPage,
  hymnKeys,
  invalidateHymns,
  type HymnSummary,
} from "@/api/hymns";
import { usePlaylistCreation } from "@/hooks/use-playlist-creation";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import PageBackground from "@/components/PageBackground";
import HymnScoreModal from "@/components/HymnScoreModal";
import HymnFormModal from "@/components/HymnFormModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import Hint from "@/components/Hint";
import ClampText from "@/components/ClampText";
import ScoreKeyPopover from "@/components/ScoreKeyPopover";
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
import { fetchScoreKeysOrToast, invalidateScoreKeys } from "@/lib/scoreKeys";
import { downloadScoreOrToast } from "@/lib/download";
import { hymnNameSizeClass } from "@/lib/text";

type HymnRow = HymnSummary;

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

// 名称列: 2行まで折り返す(行数の制限は ClampText 側の line-clamp-2)。
// 日本語は通常の禁則処理(line-break: strict)で文字間改行、韓国語は break-keep(単語=分かち書きの空白単位)。
// 空白の無い長い英数字列だけは wrap-anywhere で強制的に折り返す。
const COL_NAME =
  "whitespace-normal leading-[1.4] [line-break:strict] wrap-anywhere";

export default function HymnList() {
  const toast = useFeedbackStore((s) => s.toast);
  const confirm = useFeedbackStore((s) => s.confirm);
  const queryClient = useQueryClient();
  const playlist = usePlaylistCreation();

  // 追加・編集はモーダルなので、ページ位置や検索条件を URL で受け渡す必要はない
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState(EMPTY_STRING);
  const [submittedKeyword, setSubmittedKeyword] = useState(EMPTY_STRING);

  const pageParams = { pageNum: page, pageSize, keyword: submittedKeyword };
  const { data, isFetching } = useQuery({
    queryKey: hymnKeys.page(pageParams),
    queryFn: () => fetchHymnPage(pageParams),
    placeholderData: keepPreviousData,
  });

  const records = data?.records ?? [];
  const totalRecords = data?.totalRecords ?? 0;
  const pageSizeOptions = [5, 10, 15];
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  // 最後のページの最後の1件を削除した等で、今のページが総ページ数を超えたら最終ページへ戻す
  // (Effect ではなく描画中に state を調整する。取得中は前ページのデータなので判定しない)
  if (!isFetching && data && page > totalPages) {
    setPage(totalPages);
  }

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

  // 検索欄は <form> にして、Enter での送信(日本語変換中の Enter は除く)をブラウザに任せる
  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSearch();
  };

  // 追加・編集は画面遷移ではなく、モーダルで行う(一覧の page / pageSize / keyword はそのまま保たれる)。
  // HYMNS.ID は Snowflake の19桁でJS numberでは精度が壊れるため、IDは string で持つ。
  const [formModal, setFormModal] = useState<
    { mode: "add" } | { mode: "edit"; id: string } | null
  >(null);
  const goAdd = () => setFormModal({ mode: "add" });
  const goEdit = (id: string) => setFormModal({ mode: "edit", id });
  const closeFormModal = () => setFormModal(null);

  const onFormSaved = (result: { mode: "add" | "edit"; pageNum?: number }) => {
    setFormModal(null);
    if (result.mode === "add") {
      // 新しい曲は検索条件なしの一覧の最後のページに載るので、検索を解除してそのページへ移動する
      setKeyword(EMPTY_STRING);
      setSubmittedKeyword(EMPTY_STRING);
      if (result.pageNum) setPage(result.pageNum);
    }
    // キャッシュは HymnFormModal が保存後に捨てている(invalidateHymns)
  };

  // 楽譜アップロードは専用画面への遷移ではなく、モーダルで行う
  const [scoreModalHymn, setScoreModalHymn] = useState<{
    id: string;
    nameKr: string;
  } | null>(null);
  const openScoreModal = (row: HymnRow) =>
    setScoreModalHymn({ id: row.id, nameKr: row.nameKr });
  const closeScoreModal = () => setScoreModalHymn(null);

  const onDelete = async (item: HymnRow) => {
    try {
      await api.get(`/hymns/${item.id}/delete-check`);
    } catch (e: unknown) {
      toast(extractErrorMessage(e, "削除できません"));
      return;
    }
    const ok = await confirm(
      `この「${item.nameJp}」という歌の情報を削除してもよろしいですか？`,
      "メッセージ",
    );
    if (!ok) return;
    try {
      const { headers } = await api.delete(`/hymns/${item.id}`);
      const msg = headers["x-page-num"] ?? "削除しました";
      toast(msg);
      void invalidateHymns(queryClient);
    } catch (e: unknown) {
      toast(extractErrorMessage(e, "削除に失敗しました"));
    }
  };

  const onPageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  // 検索にヒットした全件(ページ横断)のうち、一致(BURGUNDY)・よく一致(CADMIUM)の曲で
  // YouTube プレイリストを作成する。全件を取り直して ID を集めるのはサーバー側が行う
  // (検索条件だけを送る。曲が増えても画面の通信量が膨らまないように)。
  // 対象が1曲も無いときは、サーバーが「賛美歌情報が見つかりませんでした」を返す。
  const onCreatePlaylist = () =>
    playlist.create(async () => {
      if (totalRecords === 0) {
        toast("対象の賛美歌がありません");
        return null;
      }
      return { keyword: submittedKeyword };
    });

  return (
    <div className="relative min-h-full bg-cover bg-fixed bg-center">
      <PageBackground src="/assets/mainmenu-bg5.webp" />

      <Card className="hymnlist-card glass-panel relative overflow-hidden rounded-[18px] gap-0 py-0">
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
            <form role="search" className="col-span-2" onSubmit={onSearchSubmit}>
              <InputGroup className="max-w-120 has-[[data-slot=input-group-control]:focus-visible]:border-primary has-[[data-slot=input-group-control]:focus-visible]:ring-primary/20">
                <InputGroupInput
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  type="text"
                  placeholder="キーワードを入力してください"
                  aria-label="キーワード"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="submit"
                    size="icon-xs"
                    aria-label="検索"
                  >
                    <Search />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>

            {/* 韓国語名列に対応する空セル(グリッド比率合わせのためのスペーサー) */}
            <div />

            {/* 操作列と同じ幅のセルに収め、列内で中央寄せにする
                (下の操作列のアイコンボタンと同じjustify-center) */}
            <div className="flex items-center justify-center gap-2">
              <Button
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
                  disabled={playlist.creating}
                  onClick={onCreatePlaylist}
                >
                  {playlist.creating ? (
                    <Spinner />
                  ) : (
                    <ListMusic className="h-4 w-4" />
                  )}
                </Button>
              </Hint>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-gray-200">
            <Table className="table-fixed">
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
                        "hover:brightness-[0.97]",
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
                          <Badge
                            className={cn(
                              "border-0 px-2.5 font-bold",
                              level.chip,
                            )}
                          >
                            {level.label}
                          </Badge>
                        ) : (
                          <span className="font-bold text-gray-500 tabular-nums">
                            {String((page - 1) * pageSize + i + 1).padStart(
                              2,
                              "0",
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={`${COL_NAME} px-3 py-2`}>
                        {/* 長い名称は文字サイズを縮小(表示幅34〜66: 0.8倍 / 67以上: 0.66倍)。
                            2行まで折り返し、それ以上は「…」で省略。省略時のみホバーで全文を表示 */}
                        <ClampText
                          text={row.nameJp}
                          className={hymnNameSizeClass(row.nameJp)}
                        />
                      </TableCell>
                      <TableCell className={`${COL_NAME} px-3 py-2`}>
                        {/* 日本語名称と同じルールで縮小・2行まで */}
                        <ClampText
                          text={row.nameKr}
                          className={cn(
                            "break-keep",
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
                            fetchKeys={(id) =>
                              fetchScoreKeysOrToast(queryClient, id)
                            }
                            download={downloadScoreOrToast}
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

      {formModal !== null && (
        <HymnFormModal
          key={formModal.mode === "edit" ? formModal.id : "add"}
          mode={formModal.mode}
          editId={formModal.mode === "edit" ? formModal.id : undefined}
          pageSize={pageSize}
          onClose={closeFormModal}
          onSaved={onFormSaved}
        />
      )}

      {scoreModalHymn !== null && (
        <HymnScoreModal
          hymnId={scoreModalHymn.id}
          hymnNameKr={scoreModalHymn.nameKr}
          onClose={closeScoreModal}
          onUploaded={() => {
            void invalidateHymns(queryClient);
            // 調の一覧も変わるので、この曲のキャッシュを捨てる
            void invalidateScoreKeys(queryClient, scoreModalHymn.id);
          }}
        />
      )}
    </div>
  );
}
