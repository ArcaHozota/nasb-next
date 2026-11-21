import { expect, test, type Page } from "@playwright/test";
import { mockApi } from "./mock-api";

async function openBookEditor(page: Page) {
  await mockApi(page, { loggedIn: true });
  await page.route("**/api/books**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/chapters")
        ? [{ id: 101, name: "第1章" }]
        : path.endsWith("/verse")
          ? []
          : [{ id: 1, name: "Genesis" }],
    });
  });
  await page.goto("/books/add");
  await expect(page.locator("#chapter-select")).toContainText("第1章", {
    timeout: 10_000,
  });
}

test("本文エディタの名称・複数行・入力エラーを読み上げ用に関連付ける", async ({
  page,
}) => {
  await openBookEditor(page);
  const english = page.getByRole("textbox", { name: "英語", exact: true });
  const japanese = page.getByRole("textbox", { name: "日本語", exact: true });
  for (const editor of [english, japanese]) {
    await expect(editor).toHaveAttribute("aria-multiline", "true");
    await expect(editor).toHaveAttribute("aria-invalid", "false");
    await expect(editor).toHaveAccessibleDescription("");
  }
  await english.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "選択範囲を赤文字にする", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(japanese).toBeFocused();

  await page.getByRole("button", { name: "追加", exact: true }).click();
  for (const editor of [english, japanese]) {
    await expect(editor).toHaveAttribute("aria-invalid", "true");
    await expect(editor).toHaveAccessibleDescription("入力してください。");
  }
  expect(await english.getAttribute("aria-describedby")).not.toBe(
    await japanese.getAttribute("aria-describedby"),
  );
  await english.fill("English text");
  await expect(english).toHaveAttribute("aria-invalid", "false");
  await expect(english).toHaveAccessibleDescription("");
  await expect(japanese).toHaveAccessibleDescription("入力してください。");
});

for (const key of ["Enter", "Shift+Enter"]) {
  test(`本文の${key}の改行と、その後の入力・送信内容を保持する`, async ({
    page,
  }) => {
    await openBookEditor(page);
    const editor = page.locator("[contenteditable]").first();
    await editor.fill("First");
    await editor.press("End");
    await editor.press(key);
    await expect(editor).toHaveJSProperty("textContent", "First\n");
    await editor.pressSequentially("Second");
    await expect(editor).toHaveJSProperty("textContent", "First\nSecond");

    let saved: unknown;
    await page.route("**/api/books", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      saved = route.request().postDataJSON();
      await route.fulfill({ json: "保存しました" });
    });
    await page.locator("[contenteditable]").nth(1).fill("日本語本文");
    await page.locator("#verse-input").fill("1");
    await page.getByRole("button", { name: "追加", exact: true }).click();
    await expect.poll(() => saved).toMatchObject({ textEn: "First\nSecond" });
    await expect(editor).toHaveJSProperty("textContent", "");
  });
}

test("連続Enterによる空行と、入れ子の赤字を含む複数行の貼り付けを保持する", async ({
  page,
  context,
}) => {
  await openBookEditor(page);
  const editor = page.locator("[contenteditable]").first();
  await editor.fill("First");
  await editor.press("End");
  await editor.press("Enter");
  await expect(editor).toHaveJSProperty("textContent", "First\n");
  await editor.press("Enter");
  await expect(editor).toHaveJSProperty("textContent", "First\n\n");
  await editor.pressSequentially("Second");
  await expect(editor).toHaveJSProperty("textContent", "First\n\nSecond");

  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(async () => {
    const html =
      '<div>First <b><span class="red-letter">red <i>nested</i></span></b></div><div>Second</div>';
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob(["First red nested\nSecond"], {
          type: "text/plain",
        }),
      }),
    ]);
  });
  await editor.selectText();
  await editor.press("ControlOrMeta+V");
  await expect(editor).toHaveJSProperty(
    "textContent",
    "First red nested\nSecond",
  );
  await expect(editor.locator(".red-letter")).toHaveText("red nested");
});

for (const status of [200, 500]) {
  test(`保存中は本文・書・章・節・編集操作を無効化し、${status}応答後に再び入力できる`, async ({
    page,
  }) => {
    await openBookEditor(page);
    const editors = page.locator("[contenteditable]");
    await editors.nth(0).fill("English");
    await editors.nth(1).fill("日本語本文");
    await page.locator("#verse-input").fill("1");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requests = 0;
    let saved: unknown;
    await page.route("**/api/books", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      requests++;
      saved = route.request().postDataJSON();
      await gate;
      await route.fulfill({
        status,
        json: status === 200 ? "保存しました" : "保存失敗",
      });
    });
    try {
      await page.getByRole("button", { name: "追加", exact: true }).click();
      await expect.poll(() => requests).toBe(1);
      await expect(editors.nth(0)).toHaveAttribute("contenteditable", "false");
      await expect(editors.nth(1)).toHaveAttribute("contenteditable", "false");
      for (const selector of [
        "#book-select",
        "#chapter-select",
        "#verse-input",
      ])
        await expect(page.locator(selector)).toBeDisabled();
      await expect(
        page.getByRole("button", {
          name: "選択範囲を赤文字にする",
          exact: true,
        }),
      ).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "追加", exact: true }),
      ).toBeDisabled();
      // 無効な textbox へのクリック待機を避け、実際のマウス操作だけを送る。
      await editors.nth(0).click({ force: true });
      await page.keyboard.type("Unwanted input");
      await expect(editors.nth(0)).toHaveJSProperty("textContent", "English");
    } finally {
      release();
    }
    await expect(editors.nth(0)).toHaveAttribute("contenteditable", "true");
    await expect(editors.nth(1)).toHaveAttribute("contenteditable", "true");
    for (const selector of ["#book-select", "#chapter-select", "#verse-input"])
      await expect(page.locator(selector)).toBeEnabled();
    expect(requests).toBe(1);
    expect(saved).toMatchObject({
      chapterId: 101,
      id: "1",
      textEn: "English",
      textJp: "日本語本文",
    });
    await expect(editors.nth(0)).toHaveJSProperty(
      "textContent",
      status === 200 ? "" : "English",
    );
    await editors.nth(0).fill("Next entry");
    await expect(editors.nth(0)).toHaveJSProperty("textContent", "Next entry");
  });
}
