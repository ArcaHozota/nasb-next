"use client";

// src/app/(admin)/hymns/random-five/page.tsx
// 旧 views/RandomFive.vue を移植
// shadcn/ui 版: 検索欄 = InputGroup、結果一覧 = Item(日本語名/韓国語名の2行表示)、
// 読み込み中 = Skeleton、結果なし = Empty、読み込みアイコン = Spinner。
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  Search,
  ListMusic,
  SearchX,
  Shuffle,
  SquarePlay,
} from "lucide-react";
import api from "@/api/axios";
import { usePlaylistCreation } from "@/hooks/use-playlist-creation";
import { useFeedbackStore } from "@/stores/feedback";
import PageBackground from "@/components/PageBackground";
import { EMPTY_STRING, extractErrorMessage } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Hint from "@/components/Hint";
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
  const toast = useFeedbackStore((s) => s.toast);
  const playlist = usePlaylistCreation();

  const [keyword, setKeyword] = useState(
    searchParams.get("keyword") ?? EMPTY_STRING,
  );
  const [records, setRecords] = useState<HymnRecord[]>([]);
  const [loading, setLoading] = useState(false);
  // 一度でも検索したか(未検索の案内と「該当データなし」を出し分けるため)
  const [searched, setSearched] = useState(false);

  // 検索の通し番号。連続で検索したとき、後から届いた古い応答で
  // 新しい結果を上書きしないよう、最後に出した検索の応答だけを画面に反映する
  // (画面内の検索ボタンとヘッダー検索の両方で共有する)
  const latestRequest = useRef(0);

  const runSearch = async (path: string, q: string) => {
    const requestNo = ++latestRequest.current;
    setLoading(true);
    try {
      const { data } = await api.get(path, {
        params: { keyword: q.normalize("NFC") },
      });
      if (requestNo !== latestRequest.current) return; // もっと新しい検索がある
      setRecords(data);
    } catch (e: unknown) {
      if (requestNo !== latestRequest.current) return;
      toast(extractErrorMessage(e, "通信エラー"));
    } finally {
      if (requestNo === latestRequest.current) {
        setLoading(false);
        setSearched(true);
      }
    }
  };

  const onRandom = () => runSearch("/hymns/random", keyword);

  // ヘッダーの検索欄から ?keyword=xxx&t=yyy 付きで遷移してきたら自動検索する。
  // t はヘッダーで検索した時刻。同じキーワードでも t が変わるので、この画面にいる状態で
  // ヘッダーから検索し直しても(同じキーワードでも)毎回検索が走り、新しい5曲を引き直せる。
  const headerKeyword = searchParams.get("keyword");
  const headerSearchAt = searchParams.get("t");
  // 画面内の検索欄もヘッダーのキーワードに合わせる(Effect ではなく描画中に state を調整する)
  const headerKey = `${headerKeyword ?? ""}|${headerSearchAt ?? ""}`;
  const [prevHeaderKey, setPrevHeaderKey] = useState(headerKey);
  if (prevHeaderKey !== headerKey) {
    setPrevHeaderKey(headerKey);
    if (headerKeyword) setKeyword(headerKeyword);
  }
  useEffect(() => {
    if (!headerKeyword) return;
    // runSearch は最初に setLoading する。Effect 本体で同期的に state を更新しないよう、マイクロタスクへ回す
    queueMicrotask(() => void runSearch("/common/search", headerKeyword));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerKeyword, headerSearchAt]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 入力欄が Enter を処理した後、下の window リスナーで二重実行しないよう止める
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onRandom();
    }
  };

  // 画面を開いた直後(入力欄にフォーカスが無い状態)でも Enter で検索できるようにする。
  // ボタン・リンク・入力欄にフォーカスがある時やダイアログ表示中は、本来の操作を邪魔しない。
  const onRandomRef = useRef(onRandom);
  const busyRef = useRef(false);
  useEffect(() => {
    onRandomRef.current = onRandom;
    busyRef.current = loading || playlist.creating;
  });
  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.isComposing || e.defaultPrevented) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (busyRef.current) return;
      const t = e.target as HTMLElement | null;
      if (
        t?.closest(
          "input, textarea, select, button, a, summary, [contenteditable], [role=button], [role=menuitem], [role=switch], [role=tab]",
        )
      )
        return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      e.preventDefault();
      onRandomRef.current();
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, []);

  const onCreatePlaylist = () =>
    playlist.create(async () => {
      const hymnIds = records
        .map((r) => r.id)
        .filter((id): id is string => !!id);
      if (hymnIds.length === 0) {
        toast("先にランダム選択してください");
        return null;
      }
      return hymnIds;
    });

  return (
    <div className="relative min-h-full bg-cover bg-fixed bg-center">
      <PageBackground src="/assets/mainmenu-bg6.webp" />

      <Card className="randomfive-card noto-serif glass-panel relative overflow-hidden rounded-[18px] gap-0 py-0">
        <CardHeader className="gap-0 flex items-center bg-gray-800 px-4 py-3 text-white">
          <LayoutGrid className="mr-2 h-5 w-5" />
          <CardTitle
            role="heading"
            aria-level={1}
            className="text-lg leading-normal"
          >
            賛美歌ランダム選択
          </CardTitle>
        </CardHeader>

        <CardContent className="p-6">
          <div className="mb-6 grid grid-cols-[1fr_minmax(0,30rem)_1fr] items-center gap-4">
            <div className="col-start-2 flex justify-center">
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
                  {/* InputGroupButton は shadcn/ui の Button なので波紋も付く */}
                  <Hint label="ランダム選択">
                    <InputGroupButton
                      size="icon-xs"
                      aria-label="ランダム選択"
                      disabled={loading}
                      onClick={onRandom}
                    >
                      {loading ? <Spinner /> : <Search />}
                    </InputGroupButton>
                  </Hint>
                </InputGroupAddon>
              </InputGroup>
            </div>

            {/* 選択結果があるときだけ表示(未検索時の案内は下の Empty が担当) */}
            {records.length > 0 && (
              <Button
                className="col-start-3 shrink-0 justify-self-end"
                type="button"
                disabled={playlist.creating}
                onClick={onCreatePlaylist}
              >
                {playlist.creating ? (
                  <Spinner />
                ) : (
                  <ListMusic className="h-4 w-4" />
                )}
                プレイリスト作成
                {playlist.creating &&
                  playlist.progress &&
                  ` ${playlist.progress}`}
              </Button>
            )}
          </div>

          <p className="mb-1 text-center text-xs text-black/60">
            ランダム選択した賛美歌情報一覧
          </p>
          <div className="header-mint mb-1.5 px-2 py-2 text-center font-bold">
            名称
          </div>

          {loading ? (
            <ItemGroup className="gap-1.5" aria-busy="true">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <Item
                  key={i}
                  variant="outline"
                  size="sm"
                  className="glass-item"
                >
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
                    <ItemMedia className="w-8 justify-center text-sm font-semibold text-black/40 group-has-data-[slot=item-description]/item:translate-y-0 group-has-data-[slot=item-description]/item:self-center">
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
        </CardContent>
      </Card>
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
