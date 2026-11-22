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
  const first = page.getByRole("heading", { name: "賛美歌1", exact: true });
  const second = page.getByRole("heading", { name: "賛美歌11", exact: true });

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
  // 表(めくる前の右ページ)が起き上がり、裏(めくった先の新しい目次)が左へ倒れる
  await expect(forward.locator(".book-turn-front")).toHaveCSS(
    "animation-name",
    "book-turn-rise-next",
  );
  await expect(forward.locator(".book-turn-back")).toHaveCSS(
    "animation-name",
    "book-turn-land-next",
  );
  await expect(forward.locator(".book-turn-back")).toContainText("賛美歌11");
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
    page.getByRole("heading", { name: "賛美歌11", exact: true }),
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
    page.getByRole("heading", { name: "賛美歌1", exact: true }),
  ).toBeVisible();

  await page.unroute(isSecondPage);
  await next.click();
  await expect(pager).toContainText("2 / 2");
  await expect(
    page.getByRole("heading", { name: "賛美歌11", exact: true }),
  ).toBeVisible();
});

test("右ページ: 曲名に番号を付けず、YouTube ボタンは曲名の長さによらず右上に置き、調ボタンは同じ大きさ", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const hymns = makeHymns(3);
  hymns[1] = {
    ...hymns[1],
    nameJp: "山々が生まれる前から-詩編90編・とても長い曲名の折り返しを確かめる",
  };
  await mockApi(page, { hymns });
  await page.route("**/api/hymns/*/score?keysOnly=true", (route) =>
    route.fulfill({
      json: [
        { chord: "A", isOriginal: false },
        { chord: "Bb", isOriginal: false },
        { chord: "G", isOriginal: true },
      ],
    }),
  );
  await page.goto("/home");

  const article = page.locator(".book-page--right");
  const heading = article.getByRole("heading", { level: 1 });
  const youtube = article.getByRole("link", { name: "YouTubeで聴く" });
  await expect(heading).toHaveText("賛美歌1");
  const short = await youtube.boundingBox();
  const articleBox = await article.boundingBox();

  // 調ボタンはオリジナルキーも含めて同じ大きさ
  const keys = article.getByRole("group", { name: "調を選ぶ" }).getByRole("button");
  await expect(keys).toHaveCount(3);
  for (const key of await keys.all()) {
    await expect(key).toHaveCSS("width", "44px");
    await expect(key).toHaveCSS("height", "30px");
  }
  await expect(article.getByRole("button", { name: /^G\s*\(オリジナルキー\)$/ })).toBeVisible();

  // 長い曲名に切り替えても、YouTube ボタンは同じ右上の位置のまま
  await page.locator("button[data-hymn-row]").nth(1).click();
  await expect(heading).toHaveText(/^山々が生まれる前から/);
  const long = await youtube.boundingBox();
  expect(long).toEqual(short);
  expect(short!.y - articleBox!.y).toBeLessThan(40);
});

