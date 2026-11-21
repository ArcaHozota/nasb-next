import { expect, test, type CDPSession, type Locator } from "@playwright/test";
import { makeHymns, mockApi } from "./mock-api";

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

async function swipe(
  session: CDPSession,
  target: Locator,
  dx: number,
  dy: number,
) {
  const box = await target.boundingBox();
  if (!box) throw new Error("スワイプ対象を表示できませんでした");
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + Math.min(30, box.height / 2));
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (const part of [0.3, 0.7, 1]) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + dx * part, y: y + dy * part }],
    });
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

test("詳細をスワイプして曲を移動し、調を指定した五線譜から楽譜を取得する", async ({
  page,
}) => {
  const hymns = makeHymns(3);
  await mockApi(page, { hymns });
  const downloads: string[] = [];
  await page.route("**/api/hymns/*/score?**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("keysOnly")) {
      const id = url.pathname.split("/").at(-2);
      return route.fulfill({
        json:
          id === hymns[0].id
            ? [
                { chord: "C", isOriginal: false },
                { chord: "A", isOriginal: false },
              ]
            : id === hymns[1].id
              ? [{ chord: "G", isOriginal: true }]
              : [],
      });
    }
    downloads.push(url.searchParams.get("chord") ?? "");
    return route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4" });
  });
  await page.goto("/home");
  await page.getByRole("button", { name: "詳細（歌詞・楽譜）" }).first().tap();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toHaveAccessibleName("賛美歌1");
  await expect(sheet.getByText("賛美歌1の歌詞", { exact: true })).toBeVisible();
  const keys = sheet
    .getByRole("group", { name: "調を選ぶ" })
    .getByRole("button");
  await expect(keys).toHaveText(["A", "C"]);
  await expect(keys.first()).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: "C", exact: true }).tap();
  const firstDownload = page.waitForEvent("download");
  await sheet.getByRole("button", { name: "ハ長調の楽譜をダウンロード" }).tap();
  expect((await firstDownload).suggestedFilename()).toBe(
    `${hymns[0].id}(C).pdf`,
  );

  const session = await page.context().newCDPSession(page);
  const body = sheet.locator("[data-hymn-sheet-body]");
  await swipe(session, body, -130, 0);
  await expect(sheet).toHaveAccessibleName("賛美歌2");
  const secondDownload = page.waitForEvent("download");
  await sheet.getByRole("button", { name: "ト長調の楽譜をダウンロード" }).tap();
  expect((await secondDownload).suggestedFilename()).toBe(
    `${hymns[1].id}(G).pdf`,
  );

  await swipe(session, body, -130, 0);
  await expect(sheet).toHaveAccessibleName("賛美歌3");
  await expect(
    sheet.getByRole("button", { name: "楽譜未登録" }),
  ).toBeDisabled();
  await expect(sheet.getByRole("button", { name: "次の曲" })).toBeDisabled();
  expect(downloads).toEqual(["C", "G"]);
  await swipe(session, body, 130, 0);
  await expect(sheet).toHaveAccessibleName("賛美歌2");
  await swipe(session, sheet.locator("[data-hymn-sheet-handle]"), 0, 100);
  await expect(sheet).toBeHidden();
});
