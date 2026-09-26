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
import api from "@/api/axios";
import { useAuthStore } from "@/stores/auth";
import { useFeedbackStore } from "@/stores/feedback";
import { DELAY_APOLOGY, EMPTY_STRING } from "@/lib/constants";
import { Input } from "@/components/ui/input";
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
  const auth = useAuthStore();
  const feedback = useFeedbackStore();

  const [keyword, setKeyword] = useState(EMPTY_STRING);
  // 認証確認がまだ済んでいない間は描画しない(旧 router.beforeEach 相当)
  const [authChecked, setAuthChecked] = useState(false);
  const checking = useRef(false);

  useEffect(() => {
    if (checking.current) return;
    checking.current = true;
    (async () => {
      if (!auth.isLoggedIn) {
        try {
          await auth.fetchMe();
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
  useEffect(() => {
    if (!authChecked) return;
    const timer = setInterval(() => {
      api.get("/common/me").catch(() => {
        // 401(SESSION_INVALIDATEDを含む)はaxios.ts側で既に処理済み。
        // それ以外の一時的な通信エラーでポーリング自体を止めたくないため、
        // ここでは意図的に何もしない。
      });
    }, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [authChecked]);

  const navItems = [
    {
      key: "bookSearch",
      icon: Anchor,
      title: "聖書章節選択",
      action: () => feedback.toast(DELAY_APOLOGY),
      // 実ページが無い(トースト表示のみ)ため、アクティブ判定の対象外
      isActive: false,
    },
    {
      key: "bookAdd",
      icon: Package,
      title: "聖書章節入力",
      action: () => router.push("/books/add"),
      isActive: pathname === "/books/add",
    },
    {
      key: "hymns",
      icon: Music,
      title: "賛美歌一覧",
      action: () => router.push("/hymns"),
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
      title: "ランダム五つ",
      action: () => router.push("/hymns/random-five"),
      isActive: pathname.startsWith("/hymns/random-five"),
    },
    {
      key: "receipts",
      icon: Receipt,
      title: "レシート明細入力",
      action: () => router.push("/receipts"),
      isActive: pathname.startsWith("/receipts"),
    },
  ];

  const onLogout = async () => {
    const ok = await feedback.confirm(
      "これからログアウトしています、よろしいでしょうか。",
      "警告",
    );
    if (!ok) return;
    await auth.logout();
    // 旧実装同様、状態を完全にリセットするためフルリロードする
    window.location.href = "/home";
  };

  const onSearch = () => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    router.push(`/hymns/random-five?keyword=${encodeURIComponent(trimmed)}`);
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") onSearch();
  };

  const goPersonal = () => {
    router.push(`/personal?userId=${auth.userId || EMPTY_STRING}`);
  };

  if (!authChecked) return null;

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
        username={auth.username ?? EMPTY_STRING}
        onBrand={() => router.push("/mainmenu")}
        onPersonal={goPersonal}
        onMessage={() => feedback.toast(DELAY_APOLOGY)}
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
            <div className="relative min-w-0">
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                type="text"
                placeholder="検索"
                aria-label="検索"
                className="h-8 w-44 rounded border-0 bg-gray-100 pl-8 text-gray-900 shadow-none focus-visible:ring-white/40 sm:w-60"
                onKeyDown={onSearchKeyDown}
              />
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-red-500 hover:bg-white/10 hover:text-red-500"
                  rippleColor="rgba(255, 255, 255, 0.25)"
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
        <div className="admin-main-scroll flex-1 overflow-y-auto p-0.75">
          {children}
        </div>
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
        <button
          type="button"
          aria-label="メインメニューへ"
          className="flex items-center gap-2 px-4 py-6 text-left group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-3"
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
        </button>
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
                  <span className="inline-flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
                    {username.slice(0, 1)}
                  </span>
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
