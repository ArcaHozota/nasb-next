// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveBlob } from "./download";

describe("saveBlob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom には createObjectURL / revokeObjectURL が無いので用意する
    URL.createObjectURL = vi.fn(() => "blob:test-url");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ファイル名つきのリンクをクリックし、リンクは片付ける", () => {
    const clicked: { href: string; download: string; inDom: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        clicked.push({
          href: this.href,
          download: this.download,
          inDom: document.body.contains(this),
        });
      },
    );

    saveBlob(new Blob(["pdf"]), "123(Bb).pdf");

    expect(clicked).toEqual([
      { href: "blob:test-url", download: "123(Bb).pdf", inDom: true },
    ]);
    expect(document.querySelector("a")).toBeNull();
  });

  it("URL はクリック直後ではなく、少し待ってから解放する", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    saveBlob(new Blob(["pdf"]), "1.pdf");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });
});
