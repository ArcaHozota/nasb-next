import { expect, test } from "@playwright/test";
import { mockApi } from "./mock-api";

test("ログアウト失敗後は再試行でき、成功後のCSRF取得が失敗してもホームへ戻る", async ({
  page,
}) => {
  await mockApi(page, { loggedIn: true });
  let attempts = 0;
  let csrfAfterLogout = 0;
  await page.route("**/api/logout", (route) => {
    attempts++;
    return route.fulfill({ status: attempts === 1 ? 500 : 204, body: "" });
  });
  await page.route("**/api/common/csrf", (route) => {
    if (attempts < 2) return route.fallback();
    csrfAfterLogout++;
    return route.fulfill({ status: 500 });
  });
  await page.goto("/mainmenu");
  const logout = page.getByRole("button", { name: "ログアウト", exact: true });
  const confirm = page
    .getByRole("alertdialog")
    .getByRole("button", { name: "はい" });
  await logout.click();
  await confirm.click();
  await expect(
    page.getByText("ログアウトに失敗しました。もう一度お試しください。"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/mainmenu$/);
  await logout.click();
  await confirm.click();
  await expect(page).toHaveURL(/\/home$/);
  await expect.poll(() => csrfAfterLogout).toBe(1);
  expect(attempts).toBe(2);
});
