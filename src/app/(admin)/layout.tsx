"use client";

// src/app/(admin)/layout.tsx
// 旧 layouts/AdminLayout.vue + router/index.ts の requiresAuth ガードを統合したもの。
// (admin)グループ配下の全画面がこのlayoutを経由するため、認証チェックはここに集約する。
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import {
  Anchor,
  Package,
  Music,
  Shuffle,
  Receipt,
  UserCog,
  MessageSquare,
  LogOut,
  ChevronUp,
  Search,
} from "lucide-react";
import axios from "axios";
import api from "@/api/axios";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/auth";
import { useFeedbackStore } from "@/stores/feedback";
import { useUnsavedGuard } from "@/stores/unsavedGuard";
import { hardRedirectHome, SESSION_EXPIRED_MESSAGE } from "@/lib/session";
import { Spinner } from "@/components/ui/spinner";
import { DELAY_APOLOGY, EMPTY_STRING } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SESSION_CHECK_INTERVAL_MS = 15_000;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // ストア全体ではなく、使う値・関数だけを購読する
  // (確認ダイアログの開閉のたびに管理画面全体が再描画されないようにする)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const username = useAuthStore((s) => s.username);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const logout = useAuthStore((s) => s.logout);
  const toast = useFeedbackStore((s) => s.toast);
  const confirm = useFeedbackStore((s) => s.confirm);

  const [keyword, setKeyword] = useState(EMPTY_STRING);
  // 認証確認がまだ済んでいない間は描画しない(旧 router.beforeEach 相当)
  const [authChecked, setAuthChecked] = useState(false);
  const checking = useRef(false);

  useEffect(() => {
    if (checking.current) return;
    checking.current = true;
    (async () => {
      if (!isLoggedIn) {
        try {
          await fetchMe();
        } catch {
          // 401以外の予期しないエラー。ひとまずホームへ逃がす。
          router.replace("/home");
          return;
        }
      }
      // fetchMe()は401時に例外を投げず user=null を返す実装なので、
      // catch を抜けた後も改めてログイン状態を確認する。
      if (!useAuthStore.getState().isLoggedIn) {
        router.replace("/home");
        return;
      }
      setAuthChecked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 画面を開きっぱなしのブラウザでも、別端末ログインによる強制ログアウトに
  // 即座に気づけるよう定期的にログイン状態を確認する。
  // 実際の失効判定・メッセージ表示・リダイレクトは axios.ts のレスポンス
  // インターセプター(SESSION_INVALIDATED 検知)が一元的に行うので、ここでは
  // ただ /me を叩いて「次のリクエスト」を発生させるだけでよい。
  //
  // タブが裏に回っている間(別タブ・最小化・スリープ)は確認を止める。
  // 開きっぱなしのタブが15秒ごとに叩き続けると、それだけでサイト全体の
  // アクセスを上回ってしまうため。タブが表に戻った時点ですぐ1回確認し、
  // その後また15秒ごとの確認を再開するので、強制ログアウトの検知は遅れない。
  useEffect(() => {
    if (!authChecked) return;
    const checkSession = () => {
      api.get("/common/me").catch((e: unknown) => {
        // SESSION_INVALIDATED(別端末ログイン)はaxios.ts側で処理済み。
        // /common/me の通常の401(セッション切れ)はaxios.tsでは判定対象外なので、ここで処理する。
        if (axios.isAxiosError(e) && e.response?.status === 401) {
          hardRedirectHome(SESSION_EXPIRED_MESSAGE);
        }
        // それ以外の一時的な通信エラーでポーリング自体を止めたくないため、何もしない。
      });
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (timer === undefined) {
        timer = setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
      }
    };
    const stop = () => {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSession();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, [authChecked]);

  const navItems = [
    {
      key: "bookSearch",
      icon: Anchor,
      title: "聖書章節選択",
      action: () => toast(DELAY_APOLOGY),
      // 実ページが無い(トースト表示のみ)ため、アクティブ判定の対象外
      isActive: false,
    },
    {
      key: "bookAdd",
      icon: Package,
      title: "聖書章節入力",
      action: () => go("/books/add"),
      isActive: pathname === "/books/add",
    },
    {
      key: "hymns",
      icon: Music,
      title: "賛美歌一覧",
      action: () => go("/hymns"),
      // /hymns配下の一覧・追加・編集・楽譜画面をまとめて「賛美歌一覧」としてアクティブ扱いにする。
      // ただし /hymns/random-five は別ナビ項目なのでここには含めない。
      isActive:
        pathname === "/hymns" ||
        (pathname.startsWith("/hymns/") &&
          !pathname.startsWith("/hymns/random-five")),
    },
    {
      key: "randomFive",
      icon: Shuffle,
      title: "ランダム検索",
      action: () => go("/hymns/random-five"),
      isActive: pathname.startsWith("/hymns/random-five"),
    },
    {
      key: "receipts",
      icon: Receipt,
      title: "レシート明細入力",
      // /receipts のページはまだ無い(遷移すると404になる)ため、聖書章節選択と同じく
      // 「未実装」のトーストだけ出す。ページを作ったら go("/receipts") に戻すこと。
      action: () => toast(DELAY_APOLOGY),
      isActive: false,
    },
  ];

  // 編集中の内容(聖書章節入力など)があるまま画面内を移動するとき、先に確認する。
  // 同じ画面への移動は確認しない。ブラウザを閉じる等は useUnsavedChanges(beforeunload)が担当。
  const confirmLeave = async (toPath?: string) => {
    if (!useUnsavedGuard.getState().dirty) return true;
    if (toPath !== undefined && toPath.split("?")[0] === pathname) return true;
    return confirm("編集中の内容があります。破棄して移動しますか？", "お知らせ");
  };

  const go = async (url: string) => {
    if (await confirmLeave(url)) router.push(url);
  };

  const onLogout = async () => {
    if (!(await confirmLeave())) return;
    const ok = await confirm("ログアウトしますか？", "警告");
    if (!ok) return;
    await logout();
    // 状態を完全にリセットするためフルリロードする
    // (React Query のキャッシュを残すと、次にログインした人に前の人のデータが見えてしまう)。
    // 破棄に同意済みの未保存警告(beforeunload)は出さない。
    hardRedirectHome();
  };

  const onSearch = async () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    // t(検索した時刻)を付けて、同じキーワードでも毎回別のURLにする。
    // ランダム検索の画面は keyword と t の変化を見て検索し直す。
    const url = `/hymns/random-five?keyword=${encodeURIComponent(trimmed)}&t=${Date.now()}`;
    // ランダム検索の画面にいるときは履歴を積まずに置き換える
    // (何度ヘッダー検索しても「戻る」1回で前の画面へ戻れるように)。
    // 他の画面から来るときは今までどおり履歴に積む。
    if (pathname.startsWith("/hymns/random-five")) {
      router.replace(url);
    } else {
      await go(url);
    }
  };

  // 検索欄は <form> にして、Enter での送信(日本語変換中の Enter は除く)をブラウザに任せる
  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void onSearch();
  };

  const goPersonal = () => {
    void go("/personal");
  };

  // 認証確認中は、真っ白ではなく読み込み表示を出す
  if (!authChecked) {
    return (
      <div
        className="flex h-svh items-center justify-center"
        role="status"
        aria-label="読み込み中"
      >
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    // shadcn/ui の Sidebar。デスクトップ: 折りたたみ可能(アイコンのみ表示、Ctrl/⌘+B でも切替)、
    // モバイル(768px未満): 左から出るドロワー。開閉状態は Cookie に保存され次回も復元される。
    // 画面全体の高さを固定し、スクロールは右側のメインエリア内だけに閉じ込める。
    <SidebarProvider
      defaultOpen={readSidebarOpenCookie()}
      className="h-svh overflow-hidden"
    >
      <AdminSidebar
        navItems={navItems}
        username={username ?? EMPTY_STRING}
        onBrand={() => void go("/mainmenu")}
        onPersonal={goPersonal}
        onMessage={() => toast(DELAY_APOLOGY)}
        onLogout={onLogout}
      />

      <SidebarInset className="min-w-0 overflow-hidden bg-transparent">
        {/* ===== 上部バー(旧 AppBar) ===== */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 bg-gray-900 px-2 sm:px-4">
          <SidebarTrigger
            aria-label="サイドバーの開閉"
            className="size-8 text-white hover:bg-white/10 hover:text-white"
          />
          <div className="flex min-w-0 items-center gap-2">
            <form
              role="search"
              className="relative min-w-0"
              onSubmit={onSearchSubmit}
            >
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                type="text"
                placeholder="検索"
                aria-label="検索"
                className="h-8 w-44 rounded border-0 bg-gray-100 pl-8 text-gray-900 shadow-none focus-visible:ring-white/40 sm:w-60"
                enterKeyHint="search"
              />
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </form>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-500 hover:bg-white/10 hover:text-red-500"
                  type="button"
                  aria-label="ログアウト"
                  onClick={onLogout}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">ログアウト</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {/* ===== 各画面(ここだけがスクロールする) ===== */}
        {/* スクロールバーは出さない(従来どおり)。Radix の中身ラッパー(display: table)は block に戻す */}
        <ScrollArea className="min-h-0 flex-1 p-0.75 **:data-[slot=scroll-area-scrollbar]:hidden [&_[data-slot=scroll-area-viewport]>div]:block!">
          {children}
        </ScrollArea>
      </SidebarInset>
    </SidebarProvider>
  );
}

// shadcn/ui の Sidebar が保存する Cookie(sidebar_state)から前回の開閉状態を読む。
// このレイアウトは認証確認後にクライアント側でのみ描画されるため、document を直接読んでよい。
function readSidebarOpenCookie() {
  if (typeof document === "undefined") return true;
  return !document.cookie.split("; ").includes("sidebar_state=false");
}

type NavItem = {
  key: string;
  icon: LucideIcon;
  title: string;
  action: () => void;
  isActive: boolean;
};

function AdminSidebar({
  navItems,
  username,
  onBrand,
  onPersonal,
  onMessage,
  onLogout,
}: {
  navItems: NavItem[];
  username: string;
  onBrand: () => void;
  onPersonal: () => void;
  onMessage: () => void;
  onLogout: () => void;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  // モバイルのドロワーは、画面遷移したら閉じる
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const hasActive = navItems.some((i) => i.isActive);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      {/* ===== ブランド ===== */}
      <SidebarHeader className="bg-[#fffff0] p-0">
        <SidebarMenu className="gap-0">
          {/* 折りたたみ時は SidebarMenuButton が 32px 角に固定されるため、縦の余白は外側で確保する */}
          <SidebarMenuItem className="group-data-[collapsible=icon]:py-3">
            <SidebarMenuButton
              size="lg"
              aria-label="メインメニューへ"
              className="h-auto gap-2 rounded-none px-4 py-6 hover:bg-transparent active:bg-transparent group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0"
              onClick={() => {
                onBrand();
                closeOnMobile();
              }}
            >
              <Image
                src="/assets/jerusalem-cross2.svg"
                alt=""
                width={49}
                height={49}
                className="h-12.25 w-12.25 shrink-0 object-cover group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
              />
              <span className="effect-shine whitespace-nowrap text-[1.9rem] leading-none group-data-[collapsible=icon]:hidden">
                NASB1995
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ===== メインナビ ===== */}
      <SidebarContent className="relative gap-0 border-t border-white/10 py-2">
        {/* 右端に、ロゴ下から個人スペースまでを貫く6px幅の縦ストライプを常時表示する
            (折りたたみ時はタブ表現が成り立たないので出さない) */}
        {hasActive && (
          <span className="pointer-events-none absolute right-0 top-0 bottom-0 w-1.5 bg-white group-data-[collapsible=icon]:hidden" />
        )}
        <SidebarMenu className="gap-0">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  isActive={item.isActive}
                  tooltip={item.title}
                  onClick={() => {
                    item.action();
                    closeOnMobile();
                  }}
                  className={cn(
                    // 従来のタブ型デザイン: 高さ44px、アクティブ項目は左側が半円の白いタブ
                    "relative h-11 gap-3 overflow-visible rounded-none pl-4 pr-0 text-white [&>svg]:size-5",
                    "hover:bg-white/10 hover:text-white",
                    "data-[active=true]:rounded-l-full data-[active=true]:bg-white data-[active=true]:font-normal data-[active=true]:text-gray-900",
                    "data-[active=true]:hover:bg-white data-[active=true]:hover:text-gray-900",
                    // 折りたたみ時: 小さな角丸アイコンボタン
                    "group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:[&>svg]:size-4",
                    // 区切り線は「非アクティブ同士が隣り合う境界」だけに表示し、
                    // アクティブ項目とは接しないようにする(写真のブラウザタブと同じ挙動)
                    idx > 0 &&
                      !item.isActive &&
                      !navItems[idx - 1].isActive &&
                      "border-t border-white/15 group-data-[collapsible=icon]:border-t-0",
                  )}
                >
                  {/* スパンドレル(タブノッチ)。半径は左の半円(rounded-l-full、
                      ボタンの高さ44px÷2=22px)と同じ22pxに揃える。位置(right-1.5)は
                      直角が実際に生じるストライプの左端に合わせたまま変更しない。 */}
                  {item.isActive && (
                    <>
                      <span className="pointer-events-none absolute right-1.5 top-0 h-5.5 w-5.5 -translate-y-full bg-[radial-gradient(circle_at_top_left,#111827_22px,white_22px)] group-data-[collapsible=icon]:hidden" />
                      <span className="pointer-events-none absolute right-1.5 bottom-0 h-5.5 w-5.5 translate-y-full bg-[radial-gradient(circle_at_bottom_left,#111827_22px,white_22px)] group-data-[collapsible=icon]:hidden" />
                    </>
                  )}
                  <Icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* ===== ユーザードロップダウン ===== */}
      <SidebarFooter className="border-t border-white/10 p-0">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* modal={false}: メニューから確認ダイアログ(ログアウト)を開いても、
                Radix同士のフォーカス/ポインタ制御が衝突しないようにする */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                {/* tooltip は付けない: SidebarMenuButton が Tooltip で包まれると
                    DropdownMenuTrigger(asChild)が実際のボタンに届かず、メニューが開かなくなる */}
                <SidebarMenuButton
                  size="lg"
                  className="group/user h-auto rounded-none px-4 py-2 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:hover:bg-white/10 data-[state=open]:hover:text-white group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:rounded-md group-data-[collapsible=icon]:px-0"
                >
                  <Avatar className="size-7.5 group-data-[collapsible=icon]:size-8">
                    <AvatarFallback className="bg-white/20 text-xs">
                      {username.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-[0.9rem]">{username}</span>
                  <ChevronUp className="ml-auto transition-transform group-data-[state=open]/user:rotate-180" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-56 text-gray-800"
              >
                <DropdownMenuItem
                  onSelect={() => {
                    onPersonal();
                    closeOnMobile();
                  }}
                >
                  <UserCog /> 個人スペース
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onMessage}>
                  <MessageSquare /> メッセージ
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onLogout}>
                  <LogOut /> ログアウト
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* サイドバーの右端をクリックでも開閉できる細いつまみ */}
      <SidebarRail />
    </Sidebar>
  );
}
