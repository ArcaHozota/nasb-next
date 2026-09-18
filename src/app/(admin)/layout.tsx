"use client";

// src/app/(admin)/layout.tsx
// 旧 layouts/AdminLayout.vue + router/index.ts の requiresAuth ガードを統合したもの。
// (admin)グループ配下の全画面がこのlayoutを経由するため、認証チェックはここに集約する。
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import {
  Anchor,
  Package,
  Music,
  Shuffle,
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
import RippleButton from "@/components/RippleButton";

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
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
    setUserMenuOpen(false);
    router.push(`/personal?userId=${auth.userId || EMPTY_STRING}`);
  };

  if (!authChecked) return null;

  return (
    // 画面全体をFlexboxで固定し、スクロールは<main>内だけに閉じ込める。
    <div className="flex h-screen overflow-hidden">
      {/* ===== 左サイドバー(旧 Drawer) ===== */}
      <aside className="flex w-64 shrink-0 flex-col bg-gray-900 text-white">
        {/* ブランド */}
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 bg-[#fffff0] px-4 py-6 text-left"
          onClick={() => router.push("/mainmenu")}
        >
          <Image
            src="/assets/jerusalem-cross2.svg"
            alt=""
            width={49}
            height={49}
            className="h-12.25 w-12.25 object-cover"
          />
          <span className="effect-shine whitespace-nowrap text-[1.9rem] leading-none">
            NASB1995
          </span>
        </button>
        <hr className="border-white/10" />

        {/* メインナビ */}
        {/* 右端に、ロゴ下から個人スペースまでを貫く6px幅の縦ストライプを常時表示する */}
        <nav className="relative flex-1 overflow-y-auto py-2">
          {navItems.some((i) => i.isActive) && (
            <span className="pointer-events-none absolute right-0 top-0 bottom-0 w-1.5 bg-white" />
          )}
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={[
                  "relative flex h-11 w-full items-center gap-3 pl-4 pr-0 text-sm transition-colors",
                  item.isActive
                    ? "rounded-l-full bg-white text-gray-900"
                    : "text-white hover:bg-white/10",
                  // 区切り線は「非アクティブ同士が隣り合う境界」だけに表示し、
                  // アクティブ項目とは接しないようにする(写真のブラウザタブと同じ挙動)
                  idx > 0 && !item.isActive && !navItems[idx - 1].isActive
                    ? "border-t border-white/15"
                    : EMPTY_STRING,
                ].join(" ")}
                onClick={item.action}
              >
                {/* スパンドレル(タブノッチ)。半径は左の半円(rounded-l-full、
                    ボタンの高さ44px÷2=22px)と同じ22pxに揃える。位置(right-1.5)は
                    直角が実際に生じるストライプの左端に合わせたまま変更しない。 */}
                {item.isActive && (
                  <>
                    <span className="pointer-events-none absolute right-1.5 top-0 h-5.5 w-5.5 -translate-y-full bg-[radial-gradient(circle_at_top_left,#111827_22px,white_22px)]" />
                    <span className="pointer-events-none absolute right-1.5 bottom-0 h-5.5 w-5.5 translate-y-full bg-[radial-gradient(circle_at_bottom_left,#111827_22px,white_22px)]" />
                  </>
                )}
                <Icon className="h-5 w-5 shrink-0" />
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>

        {/* ユーザードロップダウン */}
        <hr className="border-white/10" />
        <div className="relative shrink-0">
          <RippleButton
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-white/10"
            onClick={() => setUserMenuOpen((v) => !v)}
          >
            <span className="inline-flex h-7.5 w-7.5 items-center justify-center rounded-full bg-white/20 text-xs">
              {auth.username?.slice(0, 1)}
            </span>
            <span className="flex-1 text-[0.9rem]">{auth.username}</span>
            <ChevronUp className="h-4 w-4 shrink-0" />
          </RippleButton>

          {/* クリック外を検知して閉じるための透明レイヤー */}
          {userMenuOpen && (
            <div
              className="fixed inset-0 z-10"
              onClick={() => setUserMenuOpen(false)}
            />
          )}

          {userMenuOpen && (
            <div className="absolute bottom-full left-0 z-20 mb-1 w-56 rounded-md border border-gray-200 bg-white py-1 text-sm text-gray-800 shadow-lg">
              <RippleButton
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-100"
                onClick={goPersonal}
              >
                <UserCog className="h-4 w-4" /> 個人スペース
              </RippleButton>
              <RippleButton
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 hover:bg-gray-100"
                onClick={() => {
                  setUserMenuOpen(false);
                  feedback.toast(DELAY_APOLOGY);
                }}
              >
                <MessageSquare className="h-4 w-4" /> メッセージ
              </RippleButton>
              <hr className="my-1 border-gray-200" />
              <RippleButton
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-red-700 hover:bg-gray-100"
                onClick={onLogout}
              >
                <LogOut className="h-4 w-4" /> ログアウト
              </RippleButton>
            </div>
          )}
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ===== 上部バー(旧 AppBar) ===== */}
        <header className="flex h-12 shrink-0 items-center justify-end gap-2 bg-gray-900 px-4">
          <div className="relative">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              type="text"
              placeholder="検索"
              className="w-60 rounded bg-gray-100 py-1.5 pl-8 pr-2 text-sm text-gray-900 outline-none"
              onKeyDown={onSearchKeyDown}
            />
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          </div>
          <button
            type="button"
            className="rounded p-1.5 text-red-500 hover:bg-white/10"
            title="ログアウト"
            onClick={onLogout}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        {/* ===== 各画面(ここだけがスクロールする) ===== */}
        <main className="admin-main-scroll flex-1 overflow-y-auto p-0.75">
          {children}
        </main>
      </div>
    </div>
  );
}
