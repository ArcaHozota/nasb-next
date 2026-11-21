import { expect, test } from "@playwright/test";
import { makeHymns, mockApi } from "./mock-api";

test.describe("賛美歌一覧", () => {
  test("件数を表示し、ページの表示件数を変更できる", async ({ page }) => {
    await mockApi(page, { loggedIn: true, hymns: makeHymns(11) });
    await page.goto("/hymns");

    await expect(page.getByText("全11件 / 1 / 2ページ")).toBeVisible();
    await expect(page.getByRole("button", { name: "削除" })).toHaveCount(10);

    const pageSize = page.getByRole("combobox", { name: "1ページの件数" });
    await expect(pageSize.getByText("10件/ページ", { exact: true })).toBeVisible();
    await pageSize.click();
    await page.getByRole("option", { name: "5件/ページ", exact: true }).click();
    await expect(pageSize.getByText("5件/ページ", { exact: true })).toBeVisible();
    await expect(page.getByText("全11件 / 1 / 3ページ")).toBeVisible();
  });

  test("複数の楽譜から選んだ調でダウンロードする", async ({ page }) => {
    const hymns = makeHymns(1);
    const scorePath = `/api/hymns/${hymns[0].id}/score`;
    await mockApi(page, { loggedIn: true, hymns });
    await page.route((url) => url.pathname === scorePath, async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.has("keysOnly")) {
        await route.fulfill({
          json: [
            { chord: "Ab", isOriginal: false },
            { chord: "G", isOriginal: true },
          ],
        });
      } else {
        await route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4" });
      }
    });
    await page.goto("/hymns");

    const trigger = page.getByRole("button", { name: "楽譜をダウンロード" });
    await trigger.click();
    const popup = page.getByRole("dialog", { name: "楽譜の調を選ぶ" });
    await expect(popup.getByRole("menuitem")).toHaveText(["G*", "A♭"]);

    const downloading = page.waitForEvent("download");
    await popup.getByRole("menuitem", { name: "A♭" }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(`${hymns[0].id}(Ab).pdf`);
    await expect(popup).toBeHidden();
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
    const dialog = page.getByRole("alertdialog", { name: "警告" });
    await expect(dialog).toContainText("賛美歌11");
    await dialog.getByRole("button", { name: "はい" }).click();

    // 空の2ページ目に取り残されず、1ページ目(残り10件)を表示する
    await expect(page.getByText("全10件 / 1 / 1ページ")).toBeVisible();
    await expect(page.getByText("データがありません")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "削除" })).toHaveCount(10);
    expect(api.hymns).toHaveLength(10);
  });

  test("削除の確認で「いいえ」を押すと削除しない", async ({ page }) => {
    const api = await mockApi(page, { loggedIn: true, hymns: makeHymns(3) });
    await page.goto("/hymns");

    await page.getByRole("button", { name: "削除" }).first().click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "いいえ" })
      .click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
    await expect(page.getByText("全3件 / 1 / 1ページ")).toBeVisible();
  });
});
