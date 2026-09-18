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
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import api from "@/api/axios";
import RippleButton from "@/components/RippleButton";
import { useFeedbackStore } from "@/stores/feedback";
import {
  EMPTY_STRING,
  extractErrorMessage,
  utf8ToBase64,
} from "@/lib/constants";
import HymnScoreModal from "@/components/HymnScoreModal";

type HymnRow = {
  id: number;
  nameJp: string;
  nameKr: string;
  link: string;
  lineNumber: string;
};

/**
 * 文字列の「表示幅」を計算する。
 * 全角文字(漢字・ひらがな・カタカナ・全角記号など)は2、
 * それ以外(半角英数字・半角記号など)は1としてカウントする。
 */
const getDisplayWidth = (str: string): number => {
  let width = 0;
  for (const char of str) {
    // 全角文字の判定(Unicodeのコードポイントで判定)
    const code = char.codePointAt(0) ?? 0;
    const isFullWidth =
      (code >= 0x1100 && code <= 0x115f) || // ハングル字母
      (code >= 0x2e80 && code <= 0x303e) || // CJK部首・記号
      (code >= 0x3041 && code <= 0x33ff) || // ひらがな・カタカナ・CJK記号
      (code >= 0x3400 && code <= 0x4dbf) || // CJK拡張A
      (code >= 0x4e00 && code <= 0x9fff) || // CJK統一漢字
      (code >= 0xf900 && code <= 0xfaff) || // CJK互換漢字
      (code >= 0xff00 && code <= 0xff60) || // 全角英数・記号
      (code >= 0xffe0 && code <= 0xffe6); // 全角記号

    width += isFullWidth ? 2 : 1;
  }
  return width;
};

const textSizeClass = (str: string) => {
  const width = getDisplayWidth(str ?? EMPTY_STRING);
  if (width >= 66) return "hymn-text-xs"; // 半角66 or 全角33相当
  if (width >= 42) return "hymn-text-sm"; // 半角42 or 全角21相当
  return EMPTY_STRING;
};

const rowClass = (line: string) =>
  ({
    BURGUNDY: "row-burgundy",
    NAPLES: "row-naples",
    CADMIUM: "row-cadmium",
  })[line] ?? EMPTY_STRING;

const asStr = (v: string | null) => v ?? EMPTY_STRING;

function HymnListInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const feedback = useFeedbackStore();
  const queryClient = useQueryClient();

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

  const onPageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPageSize(Number(e.target.value));
    setPage(1);
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
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative w-full md:w-[42%]">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                type="text"
                placeholder="キーワードを入力してください"
                className="w-full rounded-md border border-gray-300 py-1.5 pl-3 pr-9 text-sm outline-none focus:border-primary"
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

            <div className="ml-auto">
              <RippleButton
                type="button"
                className="flex items-center gap-1 rounded-md bg-success px-4 py-1.5 text-sm font-bold text-white"
                onClick={goAdd}
              >
                <CirclePlus className="h-4 w-4" /> 賛美歌情報追加
              </RippleButton>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-gray-200">
            <table className="hymn-table w-full table-fixed text-sm">
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "26%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "24%" }} />
              </colgroup>
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left">名称</th>
                  <th className="px-3 py-2 text-left">韓国語名称</th>
                  <th className="px-3 py-2 text-center">リンク</th>
                  <th className="px-3 py-2 text-center">楽譜</th>
                  <th className="px-3 py-2 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="noto-serif font-medium">
                {isFetching && records.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-gray-400"
                    >
                      読み込み中...
                    </td>
                  </tr>
                )}
                {!isFetching && records.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-gray-400"
                    >
                      データがありません
                    </td>
                  </tr>
                )}
                {records.map((row) => (
                  <tr key={row.id} className={rowClass(row.lineNumber)}>
                    <td
                      className={`col-name px-3 py-2 ${textSizeClass(row.nameJp)}`}
                    >
                      {row.nameJp}
                    </td>
                    <td
                      className={`col-name px-3 py-2 ${textSizeClass(row.nameKr)}`}
                    >
                      {row.nameKr}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={row.link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Link
                      </a>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          downloadScore(row.id);
                        }}
                      >
                        𝄞
                      </a>
                    </td>
                    <td className="px-3 py-2">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 簡易ページネーション(旧 DataGrid の paginationMode="server" 相当) */}
          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <div>
              全{totalRecords}件 / {page} / {totalPages}ページ
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                className="rounded border border-gray-300 bg-white px-2 py-1"
                onChange={onPageSizeChange}
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}件/ページ
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-0.5 rounded-md border border-gray-300 bg-white p-0.5">
                <RippleButton
                  type="button"
                  title="最初のページ"
                  className="rounded p-1.5 text-gray-600 hover:bg-primary hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  rippleColor="rgba(0, 0, 0, 0.12)"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </RippleButton>
                <RippleButton
                  type="button"
                  title="前のページ"
                  className="rounded p-1.5 text-gray-600 hover:bg-primary hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  rippleColor="rgba(0, 0, 0, 0.12)"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </RippleButton>
                <span className="px-2 text-sm font-medium text-primary">
                  {page} / {totalPages}
                </span>
                <RippleButton
                  type="button"
                  title="次のページ"
                  className="rounded p-1.5 text-gray-600 hover:bg-primary hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  rippleColor="rgba(0, 0, 0, 0.12)"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </RippleButton>
                <RippleButton
                  type="button"
                  title="最後のページ"
                  className="rounded p-1.5 text-gray-600 hover:bg-primary hover:text-white disabled:pointer-events-none disabled:opacity-30"
                  rippleColor="rgba(0, 0, 0, 0.12)"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsRight className="h-4 w-4" />
                </RippleButton>
              </div>
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
