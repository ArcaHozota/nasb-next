import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, get } = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }));
vi.mock("@/api/axios", () => ({ default: { post, get } }));

import {
  createPlaylistAndWait,
  getYoutubeReauthConfirmText,
  PlaylistError,
  type PlaylistStatus,
} from "./youtube";

const status = (s: Partial<PlaylistStatus>): PlaylistStatus => ({
  playlistId: "PL1",
  playlistUrl: "https://youtube.com/playlist?list=PL1",
  state: "running",
  total: 3,
  added: 0,
  ...s,
});

describe("getYoutubeReauthConfirmText", () => {
  it("409 + 再認証メッセージなら確認文言を返す", () => {
    const text = getYoutubeReauthConfirmText({
      response: { status: 409, data: '"YouTube連携の再認証が必要です。"' },
    });
    expect(text).toContain("YouTube連携の再認証が必要です。");
    expect(text).toContain("個人情報画面へ移動");
  });

  it("未連携(本文なしの409)やほかの状態は null", () => {
    expect(getYoutubeReauthConfirmText({ response: { status: 409 } })).toBeNull();
    expect(
      getYoutubeReauthConfirmText({
        response: { status: 500, data: "YouTube連携の再認証が必要です。" },
      }),
    ).toBeNull();
    expect(getYoutubeReauthConfirmText(null)).toBeNull();
    expect(getYoutubeReauthConfirmText(new Error("x"))).toBeNull();
  });
});

describe("createPlaylistAndWait", () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    vi.useFakeTimers();
  });

  it("完了(done)になるまで状態を問い合わせ、進捗を知らせる", async () => {
    post.mockResolvedValue({ data: status({ added: 0 }) });
    get
      .mockResolvedValueOnce({ data: status({ added: 2 }) })
      .mockResolvedValueOnce({ data: status({ state: "done", added: 3 }) });
    const progress: number[] = [];

    const promise = createPlaylistAndWait({ hymnIds: ["1", "2", "3"] }, (s) =>
      progress.push(s.added),
    );
    await vi.advanceTimersByTimeAsync(3000);

    await expect(promise).resolves.toMatchObject({ state: "done", added: 3 });
    expect(post).toHaveBeenCalledWith("/youtube/create-playlist", {
      hymnIds: ["1", "2", "3"],
    });
    expect(get).toHaveBeenCalledWith("/youtube/playlist-status", {
      params: { playlistId: "PL1" },
    });
    expect(progress).toEqual([0, 2, 3]);
  });

  it("検索条件で頼むときは keyword だけを送る(NFC にそろえる)", async () => {
    post.mockResolvedValue({ data: status({ state: "done", added: 3 }) });

    await createPlaylistAndWait({ keyword: "사랑".normalize("NFD") });

    expect(post).toHaveBeenCalledWith("/youtube/create-playlist", {
      keyword: "사랑",
    });
    expect(get).not.toHaveBeenCalled();
  });

  it("失敗(failed)ならサーバーの文言で PlaylistError を投げる", async () => {
    post.mockResolvedValue({ data: status({}) });
    get.mockResolvedValue({
      data: status({ state: "failed", message: "上限に達しました" }),
    });

    const promise = createPlaylistAndWait({ hymnIds: ["1"] });
    const assertion = expect(promise).rejects.toThrow(
      new PlaylistError("上限に達しました"),
    );
    await vi.advanceTimersByTimeAsync(1500);
    await assertion;
  });

  it("開始時のエラーはそのまま投げる(409 の判定は呼び出し側)", async () => {
    const err = { response: { status: 409 } };
    post.mockRejectedValue(err);
    await expect(createPlaylistAndWait({ hymnIds: ["1"] })).rejects.toBe(err);
  });

  it("10分たっても終わらなければあきらめる", async () => {
    post.mockResolvedValue({ data: status({}) });
    get.mockResolvedValue({ data: status({}) });

    const promise = createPlaylistAndWait({ hymnIds: ["1"] });
    const assertion = expect(promise).rejects.toBeInstanceOf(PlaylistError);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 3000);
    await assertion;
  });
});
