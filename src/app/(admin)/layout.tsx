"use client";

// src/app/(admin)/layout.tsx
// 旧 layouts/AdminLayout.vue + router/index.ts の requiresAuth ガードを統合したもの。
// (admin)グループ配下の全画面がこのlayoutを経由するため、認証チェックはここに集約する。
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import JerusalemCross from "@/components/JerusalemCross";
import PcOnly from "@/components/PcOnly";
import {
  Anchor,
  Package,
  Music,
  Shuffle,
  Receipt,
  UserCog,
  MessageSquare,
  LogOut,
  ChevronsUpDown,
  Search,
} from "lucide-react";
import axios from "axios";
import api from "@/api/axios";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/auth";
import { useFeedbackStore } from "@/stores/feedback";
import { confirmLeave } from "@/lib/confirmLeave";
import { useGuardedNavigation } from "@/hooks/use-guarded-navigation";
import { hardRedirectHome, SESSION_EXPIRED_MESSAGE } from "@/lib/session";
import { Spinner } from "@/components/ui/spinner";
import {
  DELAY_APOLOGY,
  EMPTY_STRING,
  extractErrorMessage,
} from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Hint from "@/components/Hint";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
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
  return (
    <PcOnly>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </PcOnly>
  );
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { go } = useGuardedNavigation();
  // ストア全体ではなく、使う値・関数だけを購読する
  // (確認ダイアログの開閉のたびに管理画面全体が再描画されないようにする)
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);
  const username = useAuthStore((s) => s.username);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const logout = useAuthStore((s) => s.logout);
  const toast = useFeedbackStore((s) => s.toast);
  const loggingOut = useRef(false);

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

  const navItems: NavItem[] = [
    {
      key: "bookSearch",
      icon: Anchor,
      title: "聖書章節選択",
      group: "聖書",
      pending: true,
      action: () => toast(DELAY_APOLOGY),
      // 実ページが無い(トースト表示のみ)ため、アクティブ判定の対象外
      isActive: false,
    },
    {
      key: "bookAdd",
      icon: Package,
      title: "聖書章節入力",
      group: "聖書",
      action: () => go("/books/add"),
      isActive: pathname === "/books/add",
    },
    {
      key: "hymns",
      icon: Music,
      title: "賛美歌一覧",
      group: "賛美歌",
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
      group: "賛美歌",
      action: () => go("/hymns/random-five"),
      isActive: pathname.startsWith("/hymns/random-five"),
    },
    {
      key: "receipts",
      icon: Receipt,
      title: "レシート明細入力",
      group: "その他",
      pending: true,
      // /receipts のページはまだ無い(遷移すると404になる)ため、聖書章節選択と同じく
      // 「未実装」のトーストだけ出す。ページを作ったら go("/receipts") に戻すこと。
      action: () => toast(DELAY_APOLOGY),
      isActive: false,
    },
  ];

  // 編集中の内容(聖書章節入力など)があるまま画面内を移動するとき、先に確認する。
  // 同じ画面への移動は確認しない。ブラウザを閉じる等は useUnsavedChanges(beforeunload)が担当。
  const onLogout = async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    try {
      if (!(await confirmLeave(true))) return;
      await logout();
      hardRedirectHome();
    } catch (e) {
      toast(
        extractErrorMessage(
          e,
          "ログアウトに失敗しました。もう一度お試しください。",
        ),
      );
    } finally {
      loggingOut.current = false;
    }
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
        <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-input bg-border px-2 text-card-foreground sm:px-4">
          <SidebarTrigger
            aria-label="サイドバーの開閉"
            className="size-8 hover:bg-accent hover:text-accent-foreground"
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
                className="h-8 w-44 rounded bg-background pl-8 text-foreground shadow-none sm:w-60"
                enterKeyHint="search"
              />
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </form>
            <Hint label="ログアウト" side="bottom">
              <Button
                variant="ghost"
                size="icon-sm"
                className="hover:bg-accent hover:text-accent-foreground"
                type="button"
                aria-label="ログアウト"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </Hint>
          </div>
        </header>

        {/* ===== 各画面(ここだけがスクロールする) ===== */}
        <ScrollArea className="min-h-0 flex-1 p-0.75 **:data-[slot=scroll-area-scrollbar]:hidden">
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
  /** サイドバーで項目をまとめる見出し */
  group: NavGroup;
  /** まだ実装されていない(押すと「未実装」のトーストだけ出る)。文字を薄くし「準備中」を付ける */
  pending?: boolean;
  action: () => void;
  isActive: boolean;
};

const NAV_GROUPS = ["聖書", "賛美歌", "その他"] as const;
type NavGroup = (typeof NAV_GROUPS)[number];

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

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      {/* ===== ブランド ===== */}
      <SidebarHeader className="border-b border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Button variant="ghost" />}
              size="lg"
              aria-label="メインメニューへ"
              className="h-auto justify-start gap-2.5 border-0 py-3 font-normal transition-[width,height,padding,translate] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
              onClick={() => {
                onBrand();
                closeOnMobile();
              }}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary group-data-[collapsible=icon]:size-8">
                <JerusalemCross className="size-7! text-primary group-data-[collapsible=icon]:size-5!" />
              </span>
              <span className="font-[family-name:var(--font-niconne),cursive] text-[1.6rem] leading-none whitespace-nowrap text-primary">
                NASB1995
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ===== メインナビ ===== */}
      <SidebarContent className="gap-0 py-1">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group} className="py-1">
            <SidebarGroupLabel className="font-semibold text-muted-foreground">
              {group}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const Icon = item.icon;
                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          render={<Button variant="ghost" />}
                          isActive={item.isActive}
                          tooltip={
                            item.pending ? `${item.title}(準備中)` : item.title
                          }
                          onClick={() => {
                            item.action();
                            closeOnMobile();
                          }}
                          className={cn(
                            "h-9 justify-start gap-3 border-0 text-[0.95rem] font-normal transition-[width,height,padding,translate] [&>svg]:size-5 group-data-[collapsible=icon]:[&>svg]:size-4",
                            "hover:bg-muted hover:text-foreground",
                            "data-active:font-semibold data-active:shadow-[inset_3px_0_0_var(--primary)] data-active:hover:bg-accent data-active:hover:text-accent-foreground",
                            item.pending && "pr-16 text-muted-foreground",
                          )}
                        >
                          <Icon />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                        {item.pending && (
                          <SidebarMenuBadge className="top-1/2! -translate-y-1/2 border border-border bg-muted font-normal text-muted-foreground group-data-[collapsible=icon]:hidden">
                            準備中
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {/* ===== ユーザードロップダウン ===== */}
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* メニューからログアウト確認を開けるよう、メニューは非モーダルにする */}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="aria-expanded:bg-accent aria-expanded:text-accent-foreground"
                  />
                }
              >
                <Avatar className="size-8">
                  <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
                    {username.slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 truncate text-[0.9rem]">
                  {username}
                </span>
                <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-56">
                <DropdownMenuItem
                  onClick={() => {
                    onPersonal();
                    closeOnMobile();
                  }}
                >
                  <UserCog /> 個人スペース
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMessage}>
                  <MessageSquare /> メッセージ
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onLogout}>
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
