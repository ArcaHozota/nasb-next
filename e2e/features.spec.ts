import { expect, test } from "@playwright/test";
import { makeHymns, mockApi } from "./mock-api";

test("賛美歌一覧のプレイリスト作成は、検索条件だけを送る(全件を取り直さない)", async ({
  page,
}) => {
  const api = await mockApi(page, { loggedIn: true, hymns: makeHymns(12) });
  await page.goto("/hymns");

  const search = page.getByRole("search").getByLabel("キーワード");
  await search.fill("賛美");
  await search.press("Enter");
  await expect(page.getByText("全12件 / 1 / 2ページ")).toBeVisible();
  const hymnRequests = () =>
    api.calls.filter((c) => c.method === "GET" && c.path === "/hymns");
  const before = hymnRequests().length;

  await page.getByRole("button", { name: "プレイリスト作成" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("プレイリストを作成しました");
  await dialog.getByRole("button", { name: "いいえ" }).click();

  const posts = api.calls.filter((c) => c.path === "/youtube/create-playlist");
  expect(posts.map((c) => c.body)).toEqual([{ keyword: "賛美" }]);
  // 以前は pageSize=全件数 で一覧を取り直していた
  expect(hymnRequests().length).toBe(before);
});

test.describe("ランダム選択", () => {
  test("検索欄で Enter を押すとランダム選択する", async ({ page }) => {
    const api = await mockApi(page, { loggedIn: true, hymns: makeHymns(8) });
    await page.goto("/hymns/random-five");
    await expect(page.getByText("ランダム選択してください")).toBeVisible();

    const input = page.getByRole("search").getByLabel("キーワード");
    await input.fill("愛");
    await input.press("Enter");

    await expect(page.getByText("賛美歌5", { exact: true })).toBeVisible();
    expect(
      api.calls.filter((c) => c.path === "/hymns/random").map((c) => c.query),
    ).toEqual([{ keyword: "愛" }]);
  });

  test("ヘッダーの検索欄から検索すると、ランダム選択の画面で検索する", async ({
    page,
  }) => {
    const api = await mockApi(page, { loggedIn: true, hymns: makeHymns(8) });
    await page.goto("/mainmenu");

    // 管理画面のヘッダーの検索欄(ラベルは「検索」。画面内の検索欄は「キーワード」)
    const header = page.getByRole("search").getByLabel("検索", { exact: true });
    await header.fill("恵み");
    await header.press("Enter");

    await expect(page).toHaveURL(/\/hymns\/random-five\?keyword=/);
    await expect(page.getByText("賛美歌1", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("search").getByLabel("キーワード"),
    ).toHaveValue("恵み");
    expect(
      api.calls.filter((c) => c.path === "/common/search").map((c) => c.query),
    ).toEqual([{ keyword: "恵み" }]);
  });
});

test("編集モーダル: 読み込んだ内容を表示し、廃棄で元に戻す", async ({ page }) => {
  await mockApi(page, { loggedIn: true, hymns: makeHymns(2) });
  await page.goto("/hymns");

  await page.getByRole("button", { name: "編集" }).first().click();
  const dialog = page.getByRole("dialog", { name: "賛美歌情報更新" });
  const nameJp = dialog.getByLabel("日本語名称");
  await expect(nameJp).toHaveValue("賛美歌1");
  await expect(dialog.getByLabel("韓国語名称")).toHaveValue("찬송가1");
  await expect(dialog.getByText("最終更新者：テストユーザー")).toBeVisible();

  await nameJp.fill("書き換えた名前");
  await dialog.getByRole("button", { name: "廃棄" }).click();
  await expect(nameJp).toHaveValue("賛美歌1");
});
