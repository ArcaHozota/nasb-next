// api/axios.ts のインターセプター(CSRFトークンの付与・403時の再送・401時の強制ログアウト)。
// 実際の通信はせず、axios の adapter を差し替えて応答を作る。
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { hardRedirectHome } = vi.hoisted(() => ({ hardRedirectHome: vi.fn() }));
vi.mock("@/lib/session", () => ({
  hardRedirectHome,
  SESSION_EXPIRED_MESSAGE: "期限切れ",
  REDIRECT_MESSAGE_KEY: "redirectMessage",
}));

import api from "./axios";
import { useAuthStore } from "@/stores/auth";
import { useCsrfStore } from "@/stores/csrf";

type Reply = { status: number; data?: unknown };
type Handler = (config: InternalAxiosRequestConfig) => Reply;

/** 送られたリクエストの記録 */
let calls: { method: string; url: string; csrf: unknown }[] = [];

/** handler の返す status で応答する adapter を api に付ける */
function respondWith(handler: Handler) {
  api.defaults.adapter = async (config) => {
    calls.push({
      method: (config.method ?? "get").toUpperCase(),
      url: config.url ?? "",
      csrf: config.headers?.["X-CSRF-TOKEN"],
    });
    const { status, data } = handler(config);
    const response: AxiosResponse = {
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
    };
    if (status >= 400) {
      throw new AxiosError(`HTTP ${status}`, "ERR_BAD_RESPONSE", config, null, response);
    }
    return response;
  };
}

/** 何度呼ばれても新しいトークンを返す CSRF 取得の応答 */
let csrfIssued = 0;
const csrfReply = (): Reply => ({
  status: 200,
  data: {
    token: `token-${++csrfIssued}`,
    headerName: "X-CSRF-TOKEN",
    parameterName: "_csrf",
  },
});

beforeEach(() => {
  calls = [];
  csrfIssued = 0;
  hardRedirectHome.mockReset();
  useCsrfStore.setState({
    csrf: { token: "token-0", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" },
  });
  useAuthStore.setState({ isLoggedIn: false });
});

describe("CSRF トークン", () => {
  it("POST などには付け、GET には付けない", async () => {
    respondWith(() => ({ status: 200, data: "ok" }));

    await api.get("/hymns");
    await api.post("/hymns", {});
    await api.delete("/hymns/1");

    expect(calls).toEqual([
      { method: "GET", url: "/hymns", csrf: undefined },
      { method: "POST", url: "/hymns", csrf: "token-0" },
      { method: "DELETE", url: "/hymns/1", csrf: "token-0" },
    ]);
  });
});

describe("403 のときの再送", () => {
  it("トークンを取り直して、新しいトークンで1回だけ再送する", async () => {
    let posts = 0;
    respondWith((config) =>
      config.url === "/common/csrf"
        ? csrfReply()
        : ++posts === 1
          ? { status: 403 }
          : { status: 200, data: "保存しました" },
    );

    const { data } = await api.post("/books", {});

    expect(data).toBe("保存しました");
    expect(calls).toEqual([
      { method: "POST", url: "/books", csrf: "token-0" },
      { method: "GET", url: "/common/csrf", csrf: undefined },
      { method: "POST", url: "/books", csrf: "token-1" },
    ]);
  });

  it("CSRF 以外の本当の 403 でも、再送は1回で止まる(無限に再送しない)", async () => {
    respondWith((config) =>
      config.url === "/common/csrf" ? csrfReply() : { status: 403 },
    );

    await expect(api.post("/books", {})).rejects.toMatchObject({
      response: { status: 403 },
    });
    expect(calls.filter((c) => c.url === "/books")).toHaveLength(2);
  });
});

describe("401 のとき", () => {
  it("別端末ログイン(SESSION_INVALIDATED)なら、メッセージつきでホームへ戻す", async () => {
    respondWith(() => ({ status: 401, data: { error: "SESSION_INVALIDATED" } }));

    // ページ遷移するので Promise は決着しない(以降のエラー表示を走らせないため)
    void api.get("/hymns");
    await vi.waitFor(() => expect(hardRedirectHome).toHaveBeenCalledTimes(1));
    expect(hardRedirectHome.mock.calls[0][0]).toContain("別の端末");
  });

  it("ログイン中の通常の 401 は、期限切れとしてホームへ戻す", async () => {
    useAuthStore.setState({ isLoggedIn: true });
    respondWith(() => ({ status: 401 }));

    void api.get("/hymns");
    await vi.waitFor(() =>
      expect(hardRedirectHome).toHaveBeenCalledWith("期限切れ"),
    );
  });

  it("未ログインの閲覧では、エラーをそのまま返す", async () => {
    respondWith(() => ({ status: 401 }));

    await expect(api.get("/hymns")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(hardRedirectHome).not.toHaveBeenCalled();
  });

  it("ログイン失敗(/login)とログイン確認(/common/me)では戻さない", async () => {
    useAuthStore.setState({ isLoggedIn: true });
    respondWith(() => ({ status: 401 }));

    await expect(api.post("/login", "")).rejects.toMatchObject({
      response: { status: 401 },
    });
    await expect(api.get("/common/me")).rejects.toMatchObject({
      response: { status: 401 },
    });
    expect(hardRedirectHome).not.toHaveBeenCalled();
  });
});
