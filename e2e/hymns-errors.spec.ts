import { expect, test } from "@playwright/test";
import { makeHymns, mockApi } from "./mock-api";

test("取得失敗と0件を区別し、確定済みの検索条件で再試行する", async ({
  page,
}) => {
  const api = await mockApi(page, { loggedIn: true, hymns: makeHymns(2) });
  let fail = true;
  const attempted: string[] = [];
  await page.route("**/api/hymns?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const keyword = params.get("keyword");
    if (!keyword) return route.fallback();
    attempted.push(keyword);
    return fail
      ? route.fulfill({ status: 500, json: { message: " \t " } })
      : route.fulfill({ json: { records: [], totalRecords: 0 } });
  });
  await page.goto("/hymns");
  await expect(page.getByText("全2件 / 1 / 1ページ")).toBeVisible();
  const search = page.getByRole("search").getByLabel("キーワード");
  const playlist = page.getByRole("button", { name: "プレイリスト作成" });
  await search.fill("恵み");
  await search.press("Enter");
  await expect(playlist).toBeDisabled();
  const alert = page.getByRole("alert").filter({
    has: page.getByRole("button", { name: "再試行" }),
  });
  await expect(alert).toContainText("賛美歌一覧の取得に失敗しました");
  await expect(page.getByText("データがありません")).toHaveCount(0);
  await expect(page.getByText(/全0件/)).toHaveCount(0);
  expect(
    api.calls.some((call) => call.path === "/youtube/create-playlist"),
  ).toBe(false);

  fail = false;
  await search.fill("未確定の入力");
  await alert.getByRole("button", { name: "再試行" }).click();
  await expect(page.getByText("全0件 / 1 / 1ページ")).toBeVisible();
  await expect(page.getByText("データがありません")).toBeVisible();
  await expect(alert).toHaveCount(0);
  await expect(playlist).toBeEnabled();
  expect([...new Set(attempted)]).toEqual(["恵み"]);
});

test("削除成功後に一覧の更新が失敗したら前回の結果と明示し、再試行で更新する", async ({
  page,
}) => {
  const hymns = makeHymns(2);
  const api = await mockApi(page, { loggedIn: true, hymns });
  let fail = false;
  await page.route("**/api/hymns?**", (route) =>
    fail
      ? route.fulfill({
          status: 500,
          json: { message: " 更新できませんでした " },
        })
      : route.fallback(),
  );
  await page.route(`**/api/hymns/${hymns[0].id}`, (route) => {
    if (route.request().method() !== "DELETE") return route.fallback();
    api.hymns.shift();
    fail = true;
    return route.fulfill({ status: 204, headers: { "X-Page-Num": "7" } });
  });
  await page.goto("/hymns");
  await expect(page.getByText("全2件 / 1 / 1ページ")).toBeVisible();
  await page.getByRole("button", { name: "削除", exact: true }).first().click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "はい", exact: true })
    .click();
  await expect(page.getByText("削除しました", { exact: true })).toBeVisible();

  const alert = page.getByRole("alert").filter({
    has: page.getByRole("button", { name: "再試行" }),
  });
  await expect(alert).toContainText("更新できませんでした");
  await expect(alert).toContainText("表示中の一覧は前回取得した内容です");
  await expect(page.getByText("（前回取得時）")).toBeVisible();
  await expect(page.getByText("賛美歌1", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "プレイリスト作成" }),
  ).toBeDisabled();

  fail = false;
  await alert.getByRole("button", { name: "再試行" }).click();
  await expect(page.getByText("全1件 / 1 / 1ページ")).toBeVisible();
  await expect(page.getByText("賛美歌1", { exact: true })).toHaveCount(0);
  await expect(page.getByText("賛美歌2", { exact: true })).toBeVisible();
  await expect(alert).toHaveCount(0);
});
