/** @jest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { saveBlob } from "./download";

describe("saveBlob", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // jsdom には createObjectURL / revokeObjectURL が無いので用意する
    URL.createObjectURL = jest.fn(() => "blob:test-url");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("ファイル名つきのリンクをクリックし、リンクは片付ける", () => {
    const clicked: { href: string; download: string; inDom: boolean }[] = [];
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
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
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    saveBlob(new Blob(["pdf"]), "1.pdf");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-url");
  });
});
