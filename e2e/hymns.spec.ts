import { expect, test } from "@playwright/test";
import { makeHymns, mockApi } from "./mock-api";

test.describe("賛美歌一覧", () => {
  test("件数とページ数を表示する", async ({ page }) => {
    await mockApi(page, { loggedIn: true, hymns: makeHymns(11) });
    await page.goto("/hymns");

    await expect(page.getByText("全11件 / 1 / 2ページ")).toBeVisible();
    await expect(page.getByRole("button", { name: "削除" })).toHaveCount(10);
  });

  test("最後のページの最後の1件を削除すると、前のページへ戻る", async ({
    page,
  }) => {
    const api = await mockApi(page, { loggedIn: true, hymns: makeHymns(11) });
    await page.goto("/hymns");

    await page.getByRole("button", { name: "2ページ目" }).click();
    await expect(page.getByText("全11件 / 2 / 2ページ")).toBeVisible();
    await expect(page.getByText("賛美歌11", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "削除" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("賛美歌11");
    await dialog.getByRole("button", { name: "OK" }).click();

    // 空の2ページ目に取り残されず、1ページ目(残り10件)を表示する
    await expect(page.getByText("全10件 / 1 / 1ページ")).toBeVisible();
    await expect(page.getByText("データがありません")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "削除" })).toHaveCount(10);
    expect(api.hymns).toHaveLength(10);
  });

  test("削除の確認でキャンセルすると削除しない", async ({ page }) => {
    const api = await mockApi(page, { loggedIn: true, hymns: makeHymns(3) });
    await page.goto("/hymns");

    await page.getByRole("button", { name: "削除" }).first().click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "キャンセル" })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
    await expect(page.getByText("全3件 / 1 / 1ページ")).toBeVisible();
  });
});
