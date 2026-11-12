import { describe, expect, it } from "vitest";
import {
  normalizeForSearch,
  searchLocal,
  shouldSearchOnServer,
  type SearchIndex,
} from "./localSearch";

// Snowflake ID(19桁)。Number にすると末尾が丸まるので、文字列のまま返ることも確かめる
const SNOWFLAKE_ID = "1234567890123456789";

const longLine = "あ".repeat(50) + "恵み" + "い".repeat(50);

const index: SearchIndex = {
  version: "test",
  hymns: [
    {
      id: SNOWFLAKE_ID,
      nameJp: "★アメイジング・グレイス",
      nameKr: "놀라운 은혜(Amazing Grace)",
      nameEn: "Amazing Grace",
      link: "https://example.com/1",
      lines: ["驚くばかりの恵みなりき"],
    },
    {
      id: "2",
      nameJp: "いつくしみ深き",
      nameKr: "죄짐 맡은 우리 구주(What a Friend)",
      nameEn: "What a Friend",
      link: "https://example.com/2",
      lines: ["いつくしみ深き友なるイエスは"],
    },
    {
      id: "3",
      nameJp: "聖なるかな",
      nameKr: "거룩 거룩 거룩(Holy Holy Holy)",
      nameEn: "Holy Holy Holy",
      link: "https://example.com/3",
      lines: [longLine],
    },
  ],
};

describe("shouldSearchOnServer", () => {
  it.each([
    ["", true],
    ["　", true], // 全角空白だけ
    ["사랑", true], // ハングル
    ["Love 사랑", true], // 混在
    ["*愛", true],
    ["★恵み", true],
    ["#主", true],
    ["愛&恵み", true],
    ["愛", false],
    ["grace", false],
  ])("%j → %s", (keyword, expected) => {
    expect(shouldSearchOnServer(keyword)).toBe(expected);
  });
});

describe("normalizeForSearch", () => {
  it("全角英数を半角・小文字に、カタカナをひらがなにし、記号と空白を除く", () => {
    expect(normalizeForSearch("ＡＢＣ　カタカナ！・")).toBe("abcかたかな");
  });
});

describe("searchLocal", () => {
  it("曲名の前方一致はよく一致(CADMIUM)。クラシックの★は無視する", () => {
    const { records, hitCount } = searchLocal(index, "アメイジング");
    expect(hitCount).toBe(1);
    expect(records[0]).toMatchObject({
      id: SNOWFLAKE_ID,
      lineNumber: "CADMIUM",
    });
  });

  it("英語名でも照合する", () => {
    const { records } = searchLocal(index, "amazing");
    expect(records[0].id).toBe(SNOWFLAKE_ID);
    expect(records[0].lineNumber).toBe("CADMIUM");
  });

  it("曲名の完全一致は先頭に来る", () => {
    const { records } = searchLocal(index, "いつくしみ深き");
    expect(records[0]).toMatchObject({ id: "2", lineNumber: "CADMIUM" });
  });

  it("歌詞の一致は一致(BURGUNDY)で、その行を抜粋に入れる", () => {
    const { records, hitCount } = searchLocal(index, "驚くばかり");
    expect(hitCount).toBe(1);
    expect(records[0]).toMatchObject({
      id: SNOWFLAKE_ID,
      lineNumber: "BURGUNDY",
      snippet: "驚くばかりの恵みなりき",
    });
  });

  it("長い行は検索語のまわりを切り出して … を付ける", () => {
    const { records } = searchLocal(index, "恵み");
    const hit = records.find((r) => r.id === "3");
    expect(hit?.snippet).toBeDefined();
    expect(hit?.snippet).toContain("恵み");
    expect(hit?.snippet?.startsWith("…")).toBe(true);
    expect(hit?.snippet?.endsWith("…")).toBe(true);
    expect(hit?.snippet?.length).toBe(62); // 60文字 + 前後の …
  });

  it("一致した曲を先頭に、残りを元の順序で後ろに並べる(全曲を返す)", () => {
    const { records } = searchLocal(index, "聖なるかな");
    expect(records.map((r) => r.id)).toEqual(["3", SNOWFLAKE_ID, "2"]);
    expect(records.slice(1).every((r) => r.lineNumber === "SNOWY")).toBe(true);
  });

  it("一致が無ければ hitCount=0 で全曲を元の順序のまま返す", () => {
    const { records, hitCount } = searchLocal(index, "xyzxyz");
    expect(hitCount).toBe(0);
    expect(records.map((r) => r.id)).toEqual([SNOWFLAKE_ID, "2", "3"]);
    expect(records.every((r) => r.lineNumber === "SNOWY")).toBe(true);
  });

  it("記号だけの入力は照合しない", () => {
    const { hitCount, records } = searchLocal(index, "！？");
    expect(hitCount).toBe(0);
    expect(records).toHaveLength(3);
  });
});
