import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

test.describe("ログイン", () => {
  test("成功するとメインメニューへ移動する", async ({ page }) => {
    await mockApi(page, { login: { status: 200 } });
    await page.goto("/login");

    await page.getByLabel("ユーザー名").fill("tester");
    await page.getByLabel("パスワード").fill("secret");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(page).toHaveURL(/\/mainmenu$/);
    await expect(
      page.getByRole("heading", { name: "メインメニュー" }),
    ).toBeVisible();
  });

  test("401 のときはパスワード誤りの文言を出す", async ({ page }) => {
    await mockApi(page, { login: { status: 401 } });
    await page.goto("/login");

    await page.getByLabel("ユーザー名").fill("tester");
    await page.getByLabel("パスワード").fill("wrong");
    await page.getByLabel("パスワード").press("Enter");

    await expect(
      page.getByText("ユーザー名またはパスワードが正しくありません。"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("サーバーエラーのときはパスワード誤りと区別して伝える", async ({
    page,
  }) => {
    await mockApi(page, { login: { status: 500 } });
    await page.goto("/login");

    await page.getByLabel("ユーザー名").fill("tester");
    await page.getByLabel("パスワード").fill("secret");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(
      page.getByText("ログインできませんでした。時間をおいて再度お試しください。"),
    ).toBeVisible();
    await expect(
      page.getByText("ユーザー名またはパスワードが正しくありません。"),
    ).toHaveCount(0);
  });

  test("ユーザー名の欄でも Enter で送信でき、連打しても1回しか送らない", async ({
    page,
  }) => {
    const api = await mockApi(page, { login: { status: 401, delayMs: 500 } });
    await page.goto("/login");

    await page.getByLabel("パスワード").fill("secret");
    const username = page.getByLabel("ユーザー名");
    await username.fill("tester");
    await username.press("Enter");
    await username.press("Enter");
    await username.press("Enter");

    await expect(
      page.getByText("ユーザー名またはパスワードが正しくありません。"),
    ).toBeVisible();
    expect(
      api.calls.filter((c) => c.method === "POST" && c.path === "/login"),
    ).toHaveLength(1);
  });
});

test("未ログインで管理画面を開くとホームへ戻る", async ({ page }) => {
  await mockApi(page, { loggedIn: false });
  await page.goto("/hymns");
  await expect(page).toHaveURL(/\/home$/);
});
