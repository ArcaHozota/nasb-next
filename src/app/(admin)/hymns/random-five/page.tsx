"use client";

// src/app/(admin)/hymns/random-five/page.tsx
// 旧 views/RandomFive.vue を移植
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Search, LoaderCircle } from "lucide-react";
import api from "@/api/axios";
import { useFeedbackStore } from "@/stores/feedback";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";

type HymnRecord = { id?: number; nameJp: string; nameKr: string; link: string };

function RandomFiveInner() {
  const searchParams = useSearchParams();
  const toast = useFeedbackStore((s) => s.toast);

  const [keyword, setKeyword] = useState(EMPTY_STRING);
  const [records, setRecords] = useState<HymnRecord[]>([]);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="relative min-h-full bg-cover bg-fixed bg-center">
      <div className="fixed inset-0 -z-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/mainmenu-bg6.webp" alt="" className="h-full w-full object-cover" />
      </div>

      <div className="randomfive-card noto-serif glass-panel glass-panel--gray relative overflow-hidden rounded-[18px]">
        <div className="flex items-center bg-gray-800 px-4 py-3 text-white">
          <LayoutGrid className="mr-2 h-5 w-5" />
          <h1 className="text-lg font-semibold">賛美歌ランドム選択</h1>
        </div>

        <div className="p-6">
          <div className="mb-6 flex justify-center">
            <div className="relative w-full max-w-[480px]">
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                type="text"
                placeholder="キーワードを入力してください"
                className="w-full rounded-md border border-gray-300 py-1.5 pl-3 pr-9 text-sm outline-none focus:border-primary"
                onKeyDown={onKeyDown}
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={onRandom}
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
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
