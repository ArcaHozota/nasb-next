"use client";

// src/app/(admin)/hymns/random-five/page.tsx
// 旧 views/RandomFive.vue を移植
// shadcn/ui 版: 検索欄 = InputGroup、結果一覧 = Item(日本語名/韓国語名の2行表示)、
// 読み込み中 = Skeleton、結果なし = Empty、読み込みアイコン = Spinner。
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  Search,
  ListMusic,
  SearchX,
  Shuffle,
  SquarePlay,
} from "lucide-react";
import api from "@/api/axios";
import { useFeedbackStore } from "@/stores/feedback";
import { useAuthStore } from "@/stores/auth";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import RippleButton from "@/components/RippleButton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

// HYMNS.IDはSnowflake生成の19桁数値。JavaScriptのnumberでは安全に表現できる
// 整数の上限(2^53)を超えて精度が壊れるため、number化せず文字列のまま扱う。
type HymnRecord = { id?: string; nameJp: string; nameKr: string; link: string };

// 読み込み中に表示するスケルトン行の数
const SKELETON_ROWS = 5;

function RandomFiveInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useFeedbackStore((s) => s.toast);
  const confirm = useFeedbackStore((s) => s.confirm);
  const userId = useAuthStore((s) => s.userId);

  const [keyword, setKeyword] = useState(EMPTY_STRING);
  const [records, setRecords] = useState<HymnRecord[]>([]);
  const [loading, setLoading] = useState(false);
  // 一度でも検索したか(未検索の案内と「該当データなし」を出し分けるため)
  const [searched, setSearched] = useState(false);
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
      setSearched(true);
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
          setSearched(true);
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
      await api.post("/youtube/create-playlist", {
        hymnIds,
      });
      const proceed = await confirm(
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
          <div className="mb-6 flex items-center gap-4">
            <div className="flex flex-1 justify-center">
              <InputGroup className="max-w-120 bg-white/60 has-[[data-slot=input-group-control]:focus-visible]:border-primary has-[[data-slot=input-group-control]:focus-visible]:ring-primary/20">
                <InputGroupInput
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  type="text"
                  placeholder="キーワードを入力してください"
                  aria-label="キーワード"
                  onKeyDown={onKeyDown}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton asChild size="icon-xs">
                    <RippleButton
                      aria-label="ランダム選択"
                      title="ランダム選択"
                      rippleColor="rgba(0, 0, 0, 0.12)"
                      disabled={loading}
                      onClick={onRandom}
                    >
                      {loading ? <Spinner /> : <Search />}
                    </RippleButton>
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </div>

            {/* 選択結果があるときだけ表示(未検索時の案内は下の Empty が担当) */}
            {records.length > 0 && (
              <RippleButton
                type="button"
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                disabled={creatingPlaylist}
                onClick={onCreatePlaylist}
              >
                {creatingPlaylist ? (
                  <Spinner className="h-4 w-4" />
                ) : (
                  <ListMusic className="h-4 w-4" />
                )}
                プレイリスト作成
              </RippleButton>
            )}
          </div>

          <p className="mb-1 text-center text-xs text-black/60">
            ランドム選択した賛美歌情報一覧
          </p>
          <div className="header-mint mb-1.5 px-2 py-2 text-center font-bold">
            名称
          </div>

          {loading ? (
            <ItemGroup className="gap-1.5" aria-busy="true">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <Item key={i} variant="outline" size="sm" className="glass-item">
                  <ItemContent className="items-center">
                    <Skeleton className="h-5 w-2/5 bg-gray-300/70" />
                    <Skeleton className="h-4 w-1/4 bg-gray-300/70" />
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          ) : records.length === 0 ? (
            <Empty className="glass-item rounded-md border py-10">
              <EmptyHeader className="max-w-lg">
                <EmptyMedia variant="icon">
                  {searched ? <SearchX /> : <Shuffle />}
                </EmptyMedia>
                <EmptyTitle className="text-base">
                  {searched ? "該当データなし" : "ランダム選択してください"}
                </EmptyTitle>
                <EmptyDescription>
                  {searched ? (
                    "別のキーワードで試してください。"
                  ) : (
                    <>
                      キーワードを入力して検索ボタンを押すと、
                      <br />
                      賛美歌をランダムに選びます。
                    </>
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ItemGroup className="gap-1.5">
              {records.map((item, i) => (
                <Item
                  key={item.id ?? item.nameJp}
                  asChild
                  variant="outline"
                  size="sm"
                  className="glass-item"
                >
                  <a href={item.link} target="_blank" rel="noopener noreferrer">
                    {/* 左右の幅を揃えて(番号 / YouTubeアイコン)、名称を中央に置く */}
                    <ItemMedia className="w-8 justify-center text-sm font-semibold text-black/40 group-has-[[data-slot=item-description]]/item:translate-y-0 group-has-[[data-slot=item-description]]/item:self-center">
                      {i + 1}
                    </ItemMedia>
                    <ItemContent className="items-center gap-0.5 text-center">
                      <ItemTitle className="text-base font-semibold text-[#006b3c]">
                        {item.nameJp}
                      </ItemTitle>
                      <ItemDescription className="text-gray-700">
                        {item.nameKr}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="w-8 justify-center">
                      <SquarePlay
                        aria-hidden="true"
                        className="size-5 text-[#c4302b] opacity-70 transition-opacity group-hover/item:opacity-100"
                      />
                    </ItemActions>
                  </a>
                </Item>
              ))}
            </ItemGroup>
          )}
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
