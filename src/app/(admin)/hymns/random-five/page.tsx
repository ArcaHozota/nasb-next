"use client";

// src/app/(admin)/hymns/random-five/page.tsx
// 旧 views/RandomFive.vue を移植
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, Search, LoaderCircle, ListMusic } from "lucide-react";
import api from "@/api/axios";
import { useFeedbackStore } from "@/stores/feedback";
import { useAuthStore } from "@/stores/auth";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import RippleButton from "@/components/RippleButton";

// HYMNS.IDはSnowflake生成の19桁数値。JavaScriptのnumberでは安全に表現できる
// 整数の上限(2^53)を超えて精度が壊れるため、number化せず文字列のまま扱う。
type HymnRecord = { id?: string; nameJp: string; nameKr: string; link: string };

function RandomFiveInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useFeedbackStore((s) => s.toast);
  const confirm = useFeedbackStore((s) => s.confirm);
  const userId = useAuthStore((s) => s.userId);

  const [keyword, setKeyword] = useState(EMPTY_STRING);
  const [records, setRecords] = useState<HymnRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [creatingPlaylist, setCreatingPlaylist] = useState(false);

  const onRandom = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/hymns/random", {
        params: { keyword: keyword.normalize("NFC") },
      });
      setRecords(data);
    } catch (e: unknown) {
      toast(extractErrorMessage(e, "通信エラー"));
    } finally {
      setLoading(false);
    }
  };

  // ナビバーの検索ボックスから ?keyword=xxx 付きで遷移してきた場合、自動検索
  useEffect(() => {
    const q = searchParams.get("keyword");
    if (q) {
      setKeyword(q);
      (async () => {
        setLoading(true);
        try {
          const { data } = await api.get("/common/search", {
            params: { keyword: q.normalize("NFC") },
          });
          setRecords(data);
        } catch (e: unknown) {
          toast(extractErrorMessage(e, "通信エラー"));
        } finally {
          setLoading(false);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onRandom();
  };

  const onCreatePlaylist = async () => {
    const hymnIds = records.map((r) => r.id).filter((id): id is string => !!id);
    if (hymnIds.length === 0) {
      toast("先にランダム選択してください");
      return;
    }
    setCreatingPlaylist(true);
    try {
      const { data } = await api.post("/youtube/create-playlist", {
        hymnIds,
      });
      toast("プレイリストを作成しました");
      if (data?.playlistUrl) {
        window.open(data.playlistUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e: unknown) {
      if (
        e &&
        typeof e === "object" &&
        "response" in e &&
        (e as { response?: { status?: number } }).response?.status === 409
      ) {
        const ok = await confirm(
          "YouTube連携がまだ完了していません。連携ページへ移動しますか？",
        );
        if (ok) router.push(`/personal?userId=${userId}`);
        return;
      }
      toast(extractErrorMessage(e, "プレイリスト作成に失敗しました"));
    } finally {
      setCreatingPlaylist(false);
    }
  };

  return (
    <div className="relative min-h-full bg-cover bg-fixed bg-center">
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/mainmenu-bg6.webp"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

      <div className="randomfive-card noto-serif glass-panel glass-panel--gray relative overflow-hidden rounded-[18px]">
        <div className="flex items-center bg-gray-800 px-4 py-3 text-white">
          <LayoutGrid className="mr-2 h-5 w-5" />
          <h1 className="text-lg font-semibold">賛美歌ランドム選択</h1>
        </div>

        <div className="p-6">
          <div className="mb-6 flex justify-center">
            <div className="relative w-full max-w-120">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                type="text"
                placeholder="キーワードを入力してください"
                className="w-full rounded-md border border-gray-300 py-1.5 pl-3 pr-9 text-sm outline-none focus:border-primary"
                onKeyDown={onKeyDown}
              />
              <RippleButton
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={onRandom}
              >
                <Search className="h-4 w-4" />
              </RippleButton>
            </div>
          </div>

          <div className="mb-4 flex justify-end">
            <RippleButton
              type="button"
              className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              disabled={creatingPlaylist || records.length === 0}
              onClick={onCreatePlaylist}
            >
              {creatingPlaylist ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ListMusic className="h-4 w-4" />
              )}
              YouTubeプレイリスト作成
            </RippleButton>
          </div>

          <table className="glass-table">
            <caption>ランドム選択した賛美歌情報一覧</caption>
            <thead>
              <tr className="header-row-mint">
                <th>名称</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr className="body-row-glass">
                  <td className="py-4 text-center">
                    <LoaderCircle className="inline-block h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!loading && records.length === 0 && (
                <tr className="body-row-glass">
                  <td className="py-4 text-center">該当データなし</td>
                </tr>
              )}
              {!loading &&
                records.map((item) => (
                  <tr key={item.id ?? item.nameJp} className="body-row-glass">
                    <td className="text-center">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="record-link"
                      >
                        {item.nameJp} / {item.nameKr}
                      </a>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function RandomFive() {
  return (
    <Suspense fallback={null}>
      <RandomFiveInner />
    </Suspense>
  );
}
