import { expect, test, type Page } from "@playwright/test";
import { makeHymns, mockApi } from "./mock-api";

async function openPlaylist(page: Page, acceptance?: Promise<void>) {
  await mockApi(page, { loggedIn: true, hymns: makeHymns(3) });
  const state = { requested: false, polls: 0, cancels: [] as string[] };
  const status = { playlistId: "PL1", total: 3, added: 1, state: "running" };

  await page.route("**/api/youtube/create-playlist", async (route) => {
    state.requested = true;
    await acceptance;
    await route.fulfill({ status: 202, json: status });
  });
  await page.route("**/api/youtube/playlist-status?**", async (route) => {
    state.polls++;
    await route.fulfill({ json: status });
  });
  await page.route("**/api/youtube/cancel-playlist?**", async (route) => {
    state.cancels.push(
      new URL(route.request().url()).searchParams.get("playlistId") ?? "",
    );
    await route.fulfill({ json: { ...status, state: "cancelled" } });
  });

  await page.goto("/hymns");
  await page.getByRole("button", { name: "プレイリスト作成" }).click();
  await expect.poll(() => state.requested).toBe(true);
  return state;
}

test("作成中の離脱を拒否すると続行し、承諾すると中止して移動する", async ({
  page,
}) => {
  const state = await openPlaylist(page);
  const random = page.getByRole("button", {
    name: "ランダム検索",
    exact: true,
  });
  const alert = page.getByRole("alertdialog");
  await expect.poll(() => state.polls).toBeGreaterThan(0);

  await random.click();
  await expect(alert).toContainText("プレイリストを作成中です。");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/hymns$/);
  const polls = state.polls;
  await expect.poll(() => state.polls).toBeGreaterThan(polls);
  expect(state.cancels).toEqual([]);

  await random.click();
  await alert.getByRole("button", { name: "はい", exact: true }).click();
  await expect(page).toHaveURL(/\/hymns\/random-five$/);
  expect(state.cancels).toEqual(["PL1"]);
  await expect(
    page.getByText("プレイリストの作成を中止しました。"),
  ).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test("サーバー受付前に離脱しても、ID取得後に中止する", async ({ page }) => {
  let release!: () => void;
  const acceptance = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const state = await openPlaylist(page, acceptance);
    await page
      .getByRole("button", { name: "ランダム検索", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "はい", exact: true })
      .click();
    await expect(page).toHaveURL(/\/hymns\/random-five$/);
    expect(state.cancels).toEqual([]);
    release();
    await expect.poll(() => state.cancels).toEqual(["PL1"]);
    expect(state.polls).toBe(0);
  } finally {
    release();
  }
});

test("作成中にログアウトをやめても作成は中止しない", async ({ page }) => {
  const state = await openPlaylist(page);
  await page.getByRole("button", { name: "ログアウト", exact: true }).click();
  const alert = page.getByRole("alertdialog");
  await expect(alert).toContainText("ログアウトしますか");
  await alert.getByRole("button", { name: "いいえ", exact: true }).click();
  await expect(page).toHaveURL(/\/hymns$/);
  await expect.poll(() => state.polls).toBeGreaterThan(0);
  expect(state.cancels).toEqual([]);
});

test("再読み込みを承諾すると、作成中のプレイリストの中止を依頼する", async ({
  page,
}) => {
  // 離脱時の keepalive 通信は page.route で捕捉できない場合がある。
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      if (
        typeof input === "string" &&
        input.startsWith("/api/youtube/cancel-playlist?")
      ) {
        sessionStorage.setItem(
          "cancel-request",
          JSON.stringify({
            path: input,
            method: init?.method,
            keepalive: init?.keepalive,
            credentials: init?.credentials,
            csrf: new Headers(init?.headers).get("X-CSRF-TOKEN"),
          }),
        );
      }
      return fetch(input, init);
    };
  });
  const state = await openPlaylist(page);
  await expect.poll(() => state.polls).toBeGreaterThan(0);
  const confirmation = page.waitForEvent("dialog").then(async (dialog) => {
    const kind = dialog.type();
    await dialog.accept();
    return kind;
  });
  await page.reload();
  expect(await confirmation).toBe("beforeunload");
  const request = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("cancel-request") ?? "null"),
  );
  expect(request).toEqual({
    path: "/api/youtube/cancel-playlist?playlistId=PL1",
    method: "POST",
    keepalive: true,
    credentials: "include",
    csrf: "test-token",
  });
});
