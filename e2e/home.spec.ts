import { expect, test } from "@playwright/test";
import { makeHymns, mockApi } from "./mock-api";

const isSecondPage = (url: URL) =>
  url.pathname === "/api/hymns" && url.searchParams.get("pageNum") === "2";

test("画面幅768pxでカルーセルとPCの目次を切り替える", async ({ page }) => {
  await page.setViewportSize({ width: 767, height: 900 });
  await mockApi(page, { hymns: makeHymns(12) });
  await page.goto("/home");

  const slides = page.getByRole("region", { name: "賛美歌カード" });
  const pager = page.getByRole("navigation", { name: "ページ送り" });
  await expect(slides).toBeVisible();
  await expect(pager).toHaveCount(0);
  const firstHymn = slides.getByRole("link", { name: "賛美歌1 / 찬송가1" });
  await firstHymn.press("ArrowRight");
  await expect(page.getByText("2 / 12件", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 768, height: 900 });
  await expect(pager).toBeVisible();
  await expect(slides).toHaveCount(0);
  const book = page.locator(".book");
  const left = book.locator(".book-page--left");
  const right = book.locator(".book-page--right");
  const leftWidth = await left.evaluate((el) => el.getBoundingClientRect().width);
  const rightWidth = await right.evaluate((el) => el.getBoundingClientRect().width);
  expect(leftWidth / rightWidth).toBeCloseTo(454 / 736, 3);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(left).toHaveCSS("width", "454px");
  await expect(right).toHaveCSS("width", "736px");

  await page.setViewportSize({ width: 767, height: 900 });
  await expect(slides).toBeVisible();
  await expect(pager).toHaveCount(0);
});

test("ホーム一覧の空白のエラー文言には既定の通知を表示する", async ({
  page,
}) => {
  await mockApi(page);
  await page.route("**/api/hymns?**", (route) =>
    route.fulfill({ status: 500, json: { message: " \t " } }),
  );
  await page.goto("/home");
  const toast = page.locator("[data-sonner-toast]");
  const message = toast.getByText("データの取得に失敗しました", { exact: true });
  await expect(message).toBeVisible();
  await expect(toast).toHaveCSS("background-color", "rgb(229, 231, 235)");
  await expect(message).toHaveCSS("color", "rgb(128, 0, 32)");
  await expect(message).toHaveCSS("font-family", /^"Noto Serif JP"/);
  await expect(message).toHaveCSS("font-weight", "700");
  await expect(message).toHaveCSS("text-align", "center");
});

test("取得済みの見開きを保ったまま待ち、前後に紙をめくる", async ({ page }) => {
  await page.setViewportSize({ width: 780, height: 900 });
  const api = await mockApi(page, { hymns: makeHymns(25) });
  let releasePage: () => void = () => {};
  const paused = new Promise<void>((resolve) => {
    releasePage = () => resolve();
  });
  await page.route(isSecondPage, async (route) => {
    await paused;
    await route.fallback();
  });
  await page.goto("/home");

  const pager = page.getByRole("navigation", { name: "ページ送り" });
  const next = pager.getByRole("button", { name: "次 →" });
  const previous = pager.getByRole("button", { name: "← 前" });
  const first = page.getByRole("heading", { name: /^01.*賛美歌1$/ });
  const second = page.getByRole("heading", { name: /^11.*賛美歌11$/ });

  try {
    await expect(first).toBeVisible();
    await next.focus();
    await page.keyboard.press("Enter");
    await expect(
      pager.getByRole("status", { name: "ページを読み込み中" }),
    ).toBeVisible();
    await expect(pager).toContainText("1 / 3");
    await expect(first).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(next).toBeDisabled();
  } finally {
    releasePage();
  }

  const forward = page.locator('.book-turn[data-direction="next"]');
  await expect(forward).toBeAttached();
  await expect(forward).toHaveAttribute("inert", "");
  // 紙は短冊をつないで曲げる。裏面には、めくった先の新しい目次が見えている
  await expect(forward.locator(".book-turn-strip")).toHaveCount(16);
  await expect(
    forward.locator(".book-turn-face--back").first(),
  ).toContainText("賛美歌11");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    780,
  );
  await expect(page.locator(".book-turn")).toHaveCount(0);
  await expect(next).toBeFocused();
  await expect(second).toBeVisible();
  await expect(pager).toContainText("2 / 3");
  expect(
    api.calls
      .filter((call) => call.path === "/hymns")
      .map((call) => call.query.pageNum),
  ).toEqual(["1", "2"]);

  await previous.click();
  await expect(
    page.locator('.book-turn[data-direction="previous"]'),
  ).toBeAttached();
  await expect(page.locator(".book-turn")).toHaveCount(0);
  await expect(first).toBeVisible();
  await expect(pager).toContainText("1 / 3");
  await expect(previous).toBeDisabled();
});

test("動きを減らす設定では紙をめくらずページを切り替える", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page, { hymns: makeHymns(12) });
  await page.goto("/home");
  const pager = page.getByRole("navigation", { name: "ページ送り" });
  await expect(pager).toBeVisible();

  // 短時間でも演出が追加された場合を検出する。
  await page.evaluate(() => {
    const book = document.querySelector(".book");
    if (!book) throw new Error("見開きが見つかりません");
    const watch = new MutationObserver((changes) => {
      for (const change of changes) {
        if (
          [...change.addedNodes].some(
            (node) => node instanceof Element && node.matches(".book-turn"),
          )
        ) {
          book.setAttribute("data-motion-observed", "true");
        }
      }
    });
    watch.observe(book, { childList: true });
  });
  await pager.getByRole("button", { name: "次 →" }).click();
  await expect(pager).toContainText("2 / 2");
  await expect(
    page.getByRole("heading", { name: /^11.*賛美歌11$/ }),
  ).toBeVisible();
  await expect(page.locator("[data-motion-observed]")).toHaveCount(0);
});

test("ページの取得に失敗しても現在の目次を保ち、再試行できる", async ({
  page,
}) => {
  await mockApi(page, { hymns: makeHymns(12) });
  await page.route(isSecondPage, (route) =>
    route.fulfill({ status: 500, body: "ページを読み込めませんでした" }),
  );
  await page.goto("/home");

  const pager = page.getByRole("navigation", { name: "ページ送り" });
  const next = pager.getByRole("button", { name: "次 →" });
  await next.click();
  await expect(
    page.getByText("ページを読み込めませんでした", { exact: true }),
  ).toBeVisible();
  await expect(pager).toContainText("1 / 2");
  await expect(
    page.getByRole("heading", { name: /^01.*賛美歌1$/ }),
  ).toBeVisible();

  await page.unroute(isSecondPage);
  await next.click();
  await expect(pager).toContainText("2 / 2");
  await expect(
    page.getByRole("heading", { name: /^11.*賛美歌11$/ }),
  ).toBeVisible();
});

test.describe("手でめくる(ページの下の角)", () => {
  const setup = async (page: import("@playwright/test").Page) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, { hymns: makeHymns(25) });
    await page.goto("/home");
    const pager = page.getByRole("navigation", { name: "ページ送り" });
    await expect(pager).toContainText("1 / 3");
    const box = await page.locator(".book").boundingBox();
    if (!box) throw new Error("本が表示されていません");
    // 次へめくる角(右下)と、前へめくる角(左下)の中心
    return {
      pager,
      next: { x: box.x + box.width - 24, y: box.y + box.height - 24 },
      previous: { x: box.x + 24, y: box.y + box.height - 24 },
      width: box.width,
    };
  };

  test("角に乗ると持ち上がり、最初のページでは前へめくる角を出さない", async ({
    page,
  }) => {
    const { next } = await setup(page);
    const corner = page.locator('.book-corner[data-side="next"]');
    const lift = () =>
      corner.evaluate((el) => getComputedStyle(el, "::before").width);
    expect(await lift()).toBe("0px");
    await page.mouse.move(next.x, next.y);
    await expect.poll(lift).toBe("36px");
    await expect(
      page.locator('.book-corner[data-side="previous"]'),
    ).toBeHidden();
  });

  test("角を押すだけで次のページへめくる", async ({ page }) => {
    const { pager, next } = await setup(page);
    await page.mouse.click(next.x, next.y);
    await expect(page.locator(".book-turn")).toBeAttached();
    await expect(page.locator(".book-turn")).toHaveCount(0);
    await expect(pager).toContainText("2 / 3");
    await expect(
      page.getByRole("heading", { name: /^11.*賛美歌11$/ }),
    ).toBeVisible();
  });

  test("角をつかんで大きく動かすとめくり、少しだけなら元に戻して選んでいた曲も保つ", async ({
    page,
  }) => {
    const { pager, next, width } = await setup(page);
    await page.getByRole("button", { name: /^03/ }).click();
    const third = page.getByRole("heading", { name: /^03.*賛美歌3$/ });
    await expect(third).toBeVisible();

    // 少しだけ(本の幅の1割)動かして離す → 元に戻る
    await page.mouse.move(next.x, next.y);
    await page.mouse.down();
    await page.mouse.move(next.x - width * 0.1, next.y, { steps: 5 });
    await expect(page.locator('.book-turn[data-mode="drag"]')).toBeAttached();
    await page.mouse.up();
    await expect(page.locator(".book-turn")).toHaveCount(0);
    await expect(pager).toContainText("1 / 3");
    await expect(third).toBeVisible();

    // 大きく(本の幅の半分)動かして離す → めくる
    await page.mouse.move(next.x, next.y);
    await page.mouse.down();
    await page.mouse.move(next.x - width * 0.5, next.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".book-turn")).toHaveCount(0);
    await expect(pager).toContainText("2 / 3");
  });

  test("左下の角をつかんで右へ動かすと前のページへめくる", async ({ page }) => {
    const { pager, next, previous, width } = await setup(page);
    await page.mouse.click(next.x, next.y);
    await expect(pager).toContainText("2 / 3");
    await expect(page.locator(".book-turn")).toHaveCount(0);

    await page.mouse.move(previous.x, previous.y);
    await page.mouse.down();
    await page.mouse.move(previous.x + width * 0.5, previous.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".book-turn")).toHaveCount(0);
    await expect(pager).toContainText("1 / 3");
  });
});
