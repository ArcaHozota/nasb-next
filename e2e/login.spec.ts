import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

test.describe("ログイン", () => {
  test("成功するとメインメニューへ移動する", async ({ page }) => {
    await mockApi(page, { login: { status: 200 } });
    await page.goto("/login");

    await page.getByLabel("ユーザ名").fill("tester");
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

    await page.getByLabel("ユーザ名").fill("tester");
    await page.getByLabel("パスワード").fill("wrong");
    await page.getByLabel("パスワード").press("Enter");

    await expect(
      page.getByText("ユーザ名またはパスワードが正しくありません。"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("サーバーエラーのときはパスワード誤りと区別して伝える", async ({
    page,
  }) => {
    await mockApi(page, { login: { status: 500 } });
    await page.goto("/login");

    await page.getByLabel("ユーザ名").fill("tester");
    await page.getByLabel("パスワード").fill("secret");
    await page.getByRole("button", { name: "ログイン" }).click();

    await expect(
      page.getByText(
        "ログインできませんでした。時間をおいて再度お試しください。",
      ),
    ).toBeVisible();
    await expect(
      page.getByText("ユーザ名またはパスワードが正しくありません。"),
    ).toHaveCount(0);
  });

  test("ユーザ名の欄でも Enter で送信でき、連打しても1回しか送らない", async ({
    page,
  }) => {
    const api = await mockApi(page, { login: { status: 401, delayMs: 500 } });
    await page.goto("/login");

    await page.getByLabel("パスワード").fill("secret");
    const username = page.getByLabel("ユーザ名");
    await username.fill("tester");
    await username.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");

    await expect(
      page.getByText("ユーザ名またはパスワードが正しくありません。"),
    ).toBeVisible();
    expect(
      api.calls.filter((c) => c.method === "POST" && c.path === "/login"),
    ).toHaveLength(1);
  });

  test("速い認証失敗も3300ms待ってから入力内容を保持して表示する", async ({
    page,
  }) => {
    const start = new Date("2026-11-21T00:00:00Z");
    await page.clock.install({ time: start });
    await mockApi(page, { login: { status: 401 } });
    await page.goto("/login");
    const username = page.getByLabel("ユーザ名");
    const password = page.getByLabel("パスワード");
    for (const input of [username, password]) {
      await expect(input).toHaveCSS("background-color", "rgb(255, 255, 255)");
      await expect(input).toHaveCSS("border-top-color", "rgb(209, 213, 219)");
    }
    await username.fill("tester");
    await password.fill("wrong");
    await page.clock.pauseAt(new Date("2026-11-21T00:01:00Z"));
    const card = page.locator("[data-login-card]");
    const submit = page.getByRole("button", { name: "ログイン", exact: true });
    const cardPosition = await card.boundingBox();
    const buttonPosition = await submit.boundingBox();
    if (!cardPosition || !buttonPosition) {
      throw new Error("ログインカードまたはボタンが表示されていません");
    }

    await expect(card).toHaveCSS("width", "360px");
    expect(buttonPosition.width).toBeCloseTo(cardPosition.width * 0.62, 1);
    expect(buttonPosition.x).toBeCloseTo(
      cardPosition.x + (cardPosition.width - buttonPosition.width) / 2,
      1,
    );
    for (const control of [username, password, submit]) {
      await expect(control).toHaveCSS("height", "46px");
      await expect(control).toHaveCSS("border-top-left-radius", "9.888px");
      expect(await control.boundingBox()).toMatchObject({
        x: buttonPosition.x,
        width: buttonPosition.width,
      });
    }
    for (const label of await card.locator("label").all()) {
      await expect(label).toHaveCSS("font-size", "12px");
    }

    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/login",
    );
    await page.mouse.move(
      buttonPosition.x + buttonPosition.width / 2,
      buttonPosition.y + buttonPosition.height / 2,
    );
    await page.mouse.down();
    await expect(submit).toHaveCSS("translate", "0px 1px");
    await page.mouse.up();
    await response;
    await expect(username).toBeDisabled();
    await expect(password).toBeDisabled();
    await expect(username).toBeHidden();
    const loadingButton = page.getByRole("button", {
      name: "ログイン中",
      exact: true,
    });
    await expect
      .poll(() => loadingButton.boundingBox())
      .toEqual(buttonPosition);
    await expect.poll(() => card.boundingBox()).toEqual(cardPosition);
    await expect(loadingButton).toHaveCSS("opacity", "1");
    await expect(loadingButton.locator('[data-slot="spinner"]')).toBeVisible();
    const glass = await card.evaluate((element) => {
      const style = getComputedStyle(element, "::before");
      return [style.backgroundColor, style.opacity, style.backdropFilter];
    });
    expect(glass).toEqual(["rgb(15, 23, 42)", "0.33", "none"]);
    const form = page.getByRole("form", { name: "ログイン" });
    const error = form.getByRole("alert");
    await page.clock.runFor(3299);
    await expect(form).toHaveAttribute("aria-busy", "true");
    await expect(error).toHaveCount(0);
    await page.clock.runFor(1);
    await expect(error).toContainText(
      "ユーザ名またはパスワードが正しくありません。",
    );
    await expect(username).toHaveValue("tester");
    await expect(password).toHaveValue("wrong");
    await expect(username).toBeEnabled();
  });
});

test("未ログインで管理画面を開くとホームへ戻る", async ({ page }) => {
  await mockApi(page, { loggedIn: false });
  await page.goto("/hymns");
  await expect(page).toHaveURL(/\/home$/);
});

for (const path of ["/login", "/hymns"]) {
  test(`767px で ${path} を開くと認証確認に進まずホームへ戻る`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 767, height: 900 });
    const api = await mockApi(page, { loggedIn: true });
    await page.goto(path);
    await expect(page).toHaveURL(/\/home$/);
    await expect(
      page.getByText("管理画面はPCからご利用ください。", { exact: true }),
    ).toBeVisible();
    expect(api.calls.some((call) => call.path === "/common/me")).toBe(false);
  });
}

test("768px で開いた管理画面は幅が縮んでも維持し、次の画面遷移で判定する", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await mockApi(page, { loggedIn: true });
  await page.goto("/mainmenu");
  const heading = page.getByRole("heading", { name: "メインメニュー" });
  await expect(heading).toBeVisible();
  await page.setViewportSize({ width: 767, height: 900 });
  await expect(heading).toBeVisible();
  await page.getByRole("button", { name: "賛美歌集め" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(
    page.getByText("管理画面はPCからご利用ください。", { exact: true }),
  ).toBeVisible();
});
