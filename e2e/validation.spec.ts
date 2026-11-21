import { expect, test, type Page } from "@playwright/test";
import { makeHymns, mockApi } from "./mock-api";

async function openBooks(
  page: Page,
  options: {
    chapterGate?: Promise<void>;
    lookupGate?: Promise<void>;
    chapters?: { id: string; name: string }[];
    verse?: { name: string; textEn: string; textJp: string }[];
  } = {},
) {
  await mockApi(page, { loggedIn: true });
  const state = { posts: [] as unknown[], lookups: [] as string[] };
  await page.route("**/api/books**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (request.method() === "POST") {
      state.posts.push(request.postDataJSON());
      return route.fulfill({ json: "保存しました" });
    }
    if (url.pathname.endsWith("/chapters")) {
      await options.chapterGate;
      return route.fulfill({
        json: options.chapters ?? [{ id: "101", name: "第1章" }],
      });
    }
    if (url.pathname.endsWith("/verse")) {
      state.lookups.push(url.searchParams.get("verseNo") ?? "");
      await options.lookupGate;
      return route.fulfill({ json: options.verse ?? [] });
    }
    return route.fulfill({ json: [{ id: "1", name: "Genesis" }] });
  });
  await page.goto("/books/add");
  await expect(
    page.getByRole("textbox", { name: "英語", exact: true }),
  ).toBeVisible();
  return state;
}

async function fillVerse(page: Page, verse = "1") {
  await page
    .getByRole("textbox", { name: "英語", exact: true })
    .fill("English");
  await page
    .getByRole("textbox", { name: "日本語", exact: true })
    .fill("日本語本文");
  await page.getByLabel("節", { exact: true }).fill(verse);
}

test("節番号の不正値は照会も保存もせず、上限999は受け付ける", async ({
  page,
}) => {
  const state = await openBooks(page);
  await expect(page.locator("#chapter-select")).toContainText("第1章");
  await fillVerse(page, "abc");
  for (const value of [
    "abc",
    "1.5",
    "-1",
    "0",
    "1000",
    "999999999999999999999",
  ]) {
    await page.getByLabel("節", { exact: true }).fill(value);
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await expect(
      page.getByText("節は1〜999の整数で入力してください。", { exact: true }),
    ).toBeVisible();
  }
  expect(state.lookups).toEqual([]);
  expect(state.posts).toEqual([]);
  await page.getByLabel("節", { exact: true }).fill("999");
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toMatchObject({ chapterId: "101", id: "999" });
});

test("章の取得中・章がない状態では保存せず、章の入力欄に理由を表示する", async ({
  page,
}) => {
  let release!: () => void;
  const chapterGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await openBooks(page, { chapterGate, chapters: [] });
  try {
    await fillVerse(page);
    await expect(page.locator("#chapter-select")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "追加", exact: true }),
    ).toBeDisabled();
    expect(state.posts).toEqual([]);
  } finally {
    release();
  }
  await expect(
    page.getByText("章を選択してください。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "追加", exact: true }),
  ).toBeDisabled();
  expect(state.lookups).toEqual([]);
  expect(state.posts).toEqual([]);
});

test("既存節の照会完了を待ってから保存する", async ({ page }) => {
  let release!: () => void;
  const lookupGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = await openBooks(page, { lookupGate });
  try {
    await expect(page.locator("#chapter-select")).toContainText("第1章");
    await fillVerse(page);
    await expect.poll(() => state.lookups.length).toBe(1);
    await expect(
      page.getByRole("button", { name: "追加", exact: true }),
    ).toBeDisabled();
    expect(state.posts).toEqual([]);
  } finally {
    release();
  }
  await page.getByRole("button", { name: "追加", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
});

test("登録済みの節は引き続き上書き確認を経て保存する", async ({ page }) => {
  const state = await openBooks(page, {
    verse: [{ name: "Genesis 1:1", textEn: "Original", textJp: "元の本文" }],
  });
  await page.getByLabel("節", { exact: true }).fill("1");
  const english = page.getByRole("textbox", { name: "英語", exact: true });
  await expect(english).toHaveJSProperty("textContent", "Original");
  await english.fill("Updated");
  await page.getByRole("button", { name: "更新", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Genesis 1:1 は既に登録されています");
  await dialog.getByRole("button", { name: "いいえ", exact: true }).click();
  expect(state.posts).toEqual([]);
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await dialog.getByRole("button", { name: "はい", exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0]).toMatchObject({
    textEn: "Updated",
    textJp: "元の本文",
  });
});

test("賛美歌の重複確認中は保存せず、空本文の409でも重複理由を示す", async ({
  page,
}) => {
  await mockApi(page, { loggedIn: true, hymns: makeHymns(1) });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let checking = false;
  await page.route("**/api/hymns/duplicate-check-jp**", async (route) => {
    if (
      new URL(route.request().url()).searchParams.get("nameJp") === "重複名"
    ) {
      checking = true;
      await gate;
      return route.fulfill({ status: 409, body: "" });
    }
    return route.fulfill({ status: 200, body: "" });
  });
  await page.route("**/api/hymns/duplicate-check-kr**", (route) =>
    route.fulfill({ status: 200, body: "" }),
  );
  const posts: unknown[] = [];
  await page.route("**/api/hymns?**", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts.push(route.request().postDataJSON());
    await route.fulfill({
      status: 201,
      headers: { "X-Page-Num": "1" },
      body: "",
    });
  });
  await page.goto("/hymns");
  await page
    .getByRole("button", { name: "賛美歌情報追加", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "賛美歌情報追加" });
  await modal.getByLabel("日本語名称").fill("重複名");
  await modal.getByLabel("韓国語名称").fill("찬송가");
  await modal.getByLabel("リンク").fill("https://www.youtube.com/watch?v=test");
  await modal.getByLabel("歌詞", { exact: true }).fill("歌詞");
  try {
    await expect.poll(() => checking).toBe(true);
    await modal.getByRole("button", { name: "追加", exact: true }).click();
    await expect(modal.getByLabel("日本語名称")).toBeDisabled();
    expect(posts).toEqual([]);
  } finally {
    release();
  }
  await expect(
    modal.getByText("この名称は既に使われています。", { exact: true }),
  ).toBeVisible();
  expect(posts).toEqual([]);
  await modal.getByLabel("日本語名称").fill("新しい名称");
  await modal.getByRole("button", { name: "追加", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ nameJp: "新しい名称" });
});
