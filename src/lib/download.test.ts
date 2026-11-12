import { describe, expect, it } from "vitest";
import { extractBlobErrorMessage } from "./download";

const FALLBACK = "楽譜の取得に失敗しました";

/** responseType: "blob" の失敗時と同じ形(本文が Blob)の axios エラー */
const blobError = (body: string) => ({
  isAxiosError: true,
  response: { status: 404, data: new Blob([body]) },
});

describe("extractBlobErrorMessage", () => {
  it("JSON 文字列の本文を読む", async () => {
    expect(
      await extractBlobErrorMessage(blobError('"楽譜がありません"'), FALLBACK),
    ).toBe("楽譜がありません");
  });

  it("JSON の message を読む", async () => {
    expect(
      await extractBlobErrorMessage(
        blobError('{"message":"調が違います"}'),
        FALLBACK,
      ),
    ).toBe("調が違います");
  });

  it("短いプレーンテキストはそのまま出す", async () => {
    expect(
      await extractBlobErrorMessage(blobError("見つかりません"), FALLBACK),
    ).toBe("見つかりません");
  });

  it("HTML のエラーページ・長文・空・その他の JSON は fallback", async () => {
    for (const body of [
      "<html><body>502 Bad Gateway</body></html>",
      "x".repeat(201),
      "   ",
      "123",
      '""',
    ]) {
      expect(await extractBlobErrorMessage(blobError(body), FALLBACK), body).toBe(
        FALLBACK,
      );
    }
  });

  it("本文が Blob でなければ通常のエラーとして読む", async () => {
    expect(
      await extractBlobErrorMessage(
        { isAxiosError: true, response: { data: "権限がありません" } },
        FALLBACK,
      ),
    ).toBe("権限がありません");
    expect(await extractBlobErrorMessage(new Error("x"), FALLBACK)).toBe(
      FALLBACK,
    );
  });
});
