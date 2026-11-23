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
  // 紙は折り目で折れる(StPageFlip の soft ページ)。表はめくる前の右ページ、裏はめくった先の新しい目次
  await expect(forward.locator(".book-turn-front")).toContainText("賛美歌1");
  await expect(forward.locator(".book-turn-back").first()).toContainText(
    "賛美歌11",
  );
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


// ===== 角に乗る・角をつかむ(StPageFlip の soft ページと同じ操作) =====

/** 本の右下・左下の角の近く(表紙の枠の内側)の画面座標 */
async function corners(page: import("@playwright/test").Page) {
  const box = await page.locator(".book").boundingBox();
  if (!box) throw new Error("見開きが見つかりません");
  return {
    box,
    nextBottom: { x: box.x + box.width - 16, y: box.y + box.height - 18 },
    previousBottom: { x: box.x + 16, y: box.y + box.height - 18 },
  };
}

test("角に乗ると角が折れ、離れると元に戻る(最初のページでは左の角は折れない)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, { hymns: makeHymns(25) });
  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "賛美歌1", exact: true })).toBeVisible();
  const { nextBottom, previousBottom } = await corners(page);

  await page.mouse.move(previousBottom.x, previousBottom.y);
  await expect(page.locator(".book-turn")).toHaveCount(0);

  await page.mouse.move(nextBottom.x, nextBottom.y);
  const fold = page.locator('.book-turn[data-direction="next"]');
  await expect(fold).toBeAttached();
  await expect(fold).toHaveAttribute("inert", "");
  // まだ次のページを取得していないので、折れた所は白紙
  await expect(fold.locator(".book-turn-blank").first()).toBeAttached();
  await expect(page.locator(".book")).toHaveAttribute("data-corner", "grab");

  await page.mouse.move(nextBottom.x - 500, nextBottom.y - 300);
  await expect(page.locator(".book-turn")).toHaveCount(0);
  await expect(page.locator(".book")).not.toHaveAttribute("data-corner");
});

test("角を押すだけでも、綴じ目の向こうまでドラッグしてもめくれる", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page, { hymns: makeHymns(25) });
  await page.goto("/home");
  const pager = page.getByRole("navigation", { name: "ページ送り" });
  await expect(pager).toContainText("1 / 3");
  const { box, nextBottom, previousBottom } = await corners(page);

  // 押すだけ(クリック)
  await page.mouse.move(nextBottom.x, nextBottom.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(pager).toContainText("2 / 3");
  await expect(page.locator(".book-turn")).toHaveCount(0);

  // 右下の角を、綴じ目の向こう(左ページの上)までドラッグして離す
  await page.mouse.move(nextBottom.x, nextBottom.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, nextBottom.y - 40, { steps: 12 });
  await expect(page.locator(".book-turn-front")).toBeAttached();
  await page.mouse.up();
  await expect(pager).toContainText("3 / 3");
  await expect(page.locator(".book-turn")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "賛美歌21", exact: true }),
  ).toBeVisible();

  // 最後のページでは右の角はめくれない。左下の角を押すと前のページへ戻る
  await page.mouse.move(nextBottom.x, nextBottom.y);
  await expect(page.locator(".book-turn")).toHaveCount(0);
  await page.mouse.move(previousBottom.x, previousBottom.y);
  await page.mouse.down();
  await page.mouse.up();
  await expect(pager).toContainText("2 / 3");
});

test("角を綴じ目の手前までしか動かさずに離すと、元のページと選んでいた曲に戻る", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const api = await mockApi(page, { hymns: makeHymns(25) });
  await page.goto("/home");
  const pager = page.getByRole("navigation", { name: "ページ送り" });
  await page.getByRole("button", { name: /賛美歌3/ }).click();
  await expect(page.getByRole("heading", { name: "賛美歌3", exact: true })).toBeVisible();
  const { nextBottom } = await corners(page);

  await page.mouse.move(nextBottom.x, nextBottom.y);
  await page.mouse.down();
  await page.mouse.move(nextBottom.x - 250, nextBottom.y - 60, { steps: 8 });
  // 紙が折れて、裏(次のページの目次)が見えている
  await expect(page.locator(".book-turn-back").first()).toContainText("賛美歌11");
  await page.mouse.up();

  await expect(page.locator(".book-turn")).toHaveCount(0);
  await expect(pager).toContainText("1 / 3");
  await expect(page.getByRole("heading", { name: "賛美歌3", exact: true })).toBeVisible();
  // 次のページは取得したが、表示は元のページのまま
  expect(
    api.calls.filter((c) => c.path === "/hymns").map((c) => c.query.pageNum),
  ).toContain("2");
});

test("五線譜は、オリジナルキーを選んでも他の調と同じ大きさ", async ({ page }) => {
  await mockApi(page, { hymns: makeHymns(3) });
  await page.route("**/api/hymns/*/score?keysOnly=true", (route) =>
    route.fulfill({
      json: [
        { chord: "E", isOriginal: true },
        { chord: "F", isOriginal: false },
      ],
    }),
  );
  const staffSize = async () => {
    const box = await page.locator(".book-staff > svg").boundingBox();
    if (!box) throw new Error("五線譜が表示されていません");
    return { width: box.width, height: box.height };
  };
  const keys = page.getByRole("group", { name: "調を選ぶ" });
  const title = page.locator(".book-staff");

  for (const width of [1440, 800]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/home");
    // 最初はオリジナルキー(E)が選ばれ、調名に「・オリジナルキー」が付く
    await expect(title).toContainText("ホ長調（E）・オリジナルキー");
    const original = await staffSize();
    await keys.getByRole("button", { name: "F", exact: true }).click();
    await expect(title).toContainText("ヘ長調（F）");
    await expect(title).not.toContainText("オリジナルキー");
    expect(await staffSize()).toEqual(original);
    if (width === 1440) expect(original).toEqual({ width: 300, height: 72 });
  }
});
