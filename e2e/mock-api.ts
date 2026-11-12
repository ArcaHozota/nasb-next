// E2E 用の偽バックエンド。ブラウザから出る /api/** のリクエストを page.route で受けて応答する。
// 実際のバックエンド・DB は使わない。
import type { Page, Route } from "@playwright/test";

export type Hymn = {
  id: string;
  nameJp: string;
  nameKr: string;
  link: string;
  lineNumber: string;
};

export const makeHymns = (n: number): Hymn[] =>
  Array.from({ length: n }, (_, i) => ({
    // Snowflake ID と同じ19桁(数値にすると丸まる桁数)
    id: String(1000000000000000000n + BigInt(i + 1)),
    nameJp: `賛美歌${i + 1}`,
    nameKr: `찬송가${i + 1}`,
    link: "",
    lineNumber: "SNOWY",
  }));

type Options = {
  /** ログイン済みとして振る舞うか(GET /common/me が 200 を返す) */
  loggedIn?: boolean;
  /** POST /login の応答 */
  login?: { status: number; delayMs?: number };
  /** 賛美歌の一覧(DELETE で減る) */
  hymns?: Hymn[];
};

export type MockApi = {
  /** 受け取ったリクエスト(メソッド・パス・クエリ・本文) */
  calls: {
    method: string;
    path: string;
    query: Record<string, string>;
    body: unknown;
  }[];
  hymns: Hymn[];
};

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });

export async function mockApi(page: Page, opts: Options = {}): Promise<MockApi> {
  const state: MockApi = { calls: [], hymns: [...(opts.hymns ?? [])] };
  let loggedIn = opts.loggedIn ?? false;

  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/api/, "");
    const method = req.method();
    const raw = req.postData();
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      // JSON ではない本文(ログインのフォームなど)は文字列のまま
    }
    state.calls.push({
      method,
      path,
      query: Object.fromEntries(url.searchParams),
      body,
    });

    if (path === "/common/csrf") {
      return json(route, 200, {
        token: "test-token",
        headerName: "X-CSRF-TOKEN",
        parameterName: "_csrf",
      });
    }

    if (path === "/common/me") {
      return loggedIn
        ? json(route, 200, { id: "1", username: "テストユーザー" })
        : json(route, 401, {});
    }

    if (path === "/login" && method === "POST") {
      const { status = 200, delayMs = 0 } = opts.login ?? {};
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (status === 200) loggedIn = true;
      return status === 200
        ? json(route, 200, {})
        : json(route, status, "error");
    }

    if (path === "/hymns" && method === "GET") {
      const pageNum = Number(url.searchParams.get("pageNum") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 10);
      const start = (pageNum - 1) * pageSize;
      return json(route, 200, {
        records: state.hymns.slice(start, start + pageSize),
        totalRecords: state.hymns.length,
      });
    }

    // ランダム選択(画面内の検索ボタン / ヘッダーの検索)。先頭から5曲を返す
    if ((path === "/hymns/random" || path === "/common/search") && method === "GET") {
      return json(route, 200, state.hymns.slice(0, 5));
    }

    if (path === "/youtube/create-playlist" && method === "POST") {
      return json(route, 202, {
        playlistId: "PL1",
        playlistUrl: "https://www.youtube.com/playlist?list=PL1",
        state: "done",
        total: 1,
        added: 1,
      });
    }

    const detail = path.match(/^\/hymns\/(\d+)$/);
    if (detail && method === "GET") {
      const h = state.hymns.find((x) => x.id === detail[1]);
      return h
        ? json(route, 200, {
            ...h,
            lyric: `${h.nameJp}の歌詞`,
            classic: false,
            updatedTime: "2026-01-01 10:00:00",
            updatedUser: "テストユーザー",
          })
        : json(route, 404, "賛美歌情報が見つかりませんでした");
    }

    const deleteCheck = path.match(/^\/hymns\/(\d+)\/delete-check$/);
    if (deleteCheck && method === "GET") return json(route, 200, "");

    const hymn = path.match(/^\/hymns\/(\d+)$/);
    if (hymn && method === "DELETE") {
      state.hymns = state.hymns.filter((h) => h.id !== hymn[1]);
      return route.fulfill({ status: 204 });
    }

    // 想定していない API は、テストで気づけるよう 404 にする
    return json(route, 404, `mock: ${method} ${path} is not defined`);
  });

  return state;
}
