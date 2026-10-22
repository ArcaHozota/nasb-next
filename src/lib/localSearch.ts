// src/lib/localSearch.ts
// ホーム画面の「画面側検索」: 日本語・英語の入力を、ブラウザの中で曲名と歌詞に照らして並べ替える。
//
// 振り分け(shouldSearchOnServer):
//   ハングルを含む / 先頭が * ★ # / & を含む / 空 → 従来どおりサーバー検索(GET /hymns)
//   それ以外(日本語・英語など)                       → このファイルの画面検索
//
// 画面検索の対象は「曲名(日本語名・英語名)」と「日本語・英語の歌詞」。
// 韓国語の歌詞は索引に含まれない(サーバー側のTF-IDF検索が受け持つ)。
// TF-IDFは使わない: 歌詞のほぼ全曲が韓国語で、日本語・英語は一部の曲にしか無く、語の重みが偏るため。
// 代わりに「文字列としてどれだけ似ているか」(部分一致 + 文字2-gramの被覆率)で順位をつける。
import api from "@/api/axios";

// ===== 索引(GET /hymns/search-index) =====

export type SearchIndexEntry = {
  /** Snowflake ID(19桁)。JSON上は文字列。絶対に Number に変換しないこと(桁が丸まる) */
  id: string;
  /** 日本語名(表示用。クラシックは先頭に★) */
  nameJp: string;
  /** 韓国語名(表示用。「韓国語名(英語名)」のまま) */
  nameKr: string;
  /** nameKr の括弧書き(無ければ空文字) */
  nameEn: string;
  link: string;
  /** 日本語・英語の歌詞の行(韓国語の行は含まれない) */
  lines: string[];
};

export type SearchIndex = {
  version: string;
  hymns: SearchIndexEntry[];
};

/** 画面側検索の結果1曲分。ホーム画面の HymnRecord と同じ形 */
export type LocalHymnRecord = {
  id: number;
  nameJp: string;
  nameKr: string;
  link: string;
  /** CADMIUM(曲名に一致) / BURGUNDY(歌詞に一致) / NAPLES(あいまい一致) / SNOWY(一致なし) */
  lineNumber: "CADMIUM" | "BURGUNDY" | "NAPLES" | "SNOWY";
  /** 一致した歌詞の一行(一致した曲だけ) */
  snippet: string | null;
};

export type LocalSearchResult = {
  /** 全曲。一致した曲を先頭に(関連の強い順)、残りを元の順序で後ろに並べる */
  records: LocalHymnRecord[];
  /** 一致した曲数(0なら「通常の順序で表示」) */
  hitCount: number;
};

/** 索引の取得(未ログインでも可)。歌詞はめったに変わらないので5分キャッシュする */
export const searchIndexQueryOptions = {
  queryKey: ["hymns-search-index"] as const,
  queryFn: async (): Promise<SearchIndex> => {
    const { data } = await api.get<SearchIndex>("/hymns/search-index");
    return data;
  },
  staleTime: 5 * 60 * 1000,
};

// ===== 振り分け =====

const HANGUL = /[ᄀ-ᇿ㄰-㆏ꥠ-꥿가-힯ힰ-퟿]/;

export const hasHangul = (s: string) => HANGUL.test(s);

/**
 * サーバー検索に回すか(true)、画面検索を使うか(false)。
 * 混在入力(例: 「Love 사랑」)はハングルを含むのでサーバー側。
 */
export function shouldSearchOnServer(keyword: string): boolean {
  const k = keyword.normalize("NFC").replace(/　/g, " ").trim();
  if (k === "") return true;
  if (hasHangul(k)) return true;
  if (/^[*★#]/.test(k)) return true;
  if (k.includes("&")) return true;
  return false;
}

// ===== 正規化 =====

/**
 * 照合用の正規化: NFKC(全角英数→半角など)・小文字・カタカナ→ひらがな、
 * 文字・数字・結合記号以外(空白・句読点・記号)を除く。
 */
export function normalizeForSearch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[^\p{L}\p{N}\p{M}]/gu, "");
}

// ===== 文字列の近さ =====

/** あいまい一致とみなす、検索語の2-gramの被覆率の下限 */
const COVERAGE_THRESHOLD = 0.7;

type QueryGrams = {
  /** 重複を除いた2-gram → 通し番号 */
  ids: Map<string, number>;
  /** 通し番号ごとの出現回数 */
  need: Int16Array;
  /** 2-gramの総数 */
  total: number;
};

function buildQueryGrams(q: string): QueryGrams {
  const ids = new Map<string, number>();
  const counts: number[] = [];
  let total = 0;
  for (let i = 0; i + 2 <= q.length; i++) {
    const g = q.slice(i, i + 2);
    let id = ids.get(g);
    if (id === undefined) {
      id = ids.size;
      ids.set(g, id);
      counts.push(0);
    }
    counts[id]++;
    total++;
  }
  return { ids, need: Int16Array.from(counts), total };
}

/**
 * 検索語の2-gramが、テキストの「検索語と同じくらいの長さの窓」の中にどれだけ入っているか(0〜1)。
 * 窓に限ることで、長い歌詞の離れた場所に偶然散らばった文字では一致しない。
 */
function windowCoverage(q: string, qg: QueryGrams, t: string): number {
  if (qg.total === 0 || t.length < 2) return 0;
  // テキストの各位置の2-gramを、検索語の2-gramの通し番号に置き換える(無ければ -1)。1回走査するだけ
  const gramCount = t.length - 1;
  const gid = new Int32Array(gramCount);
  let any = false;
  for (let j = 0; j < gramCount; j++) {
    const id = qg.ids.get(t.slice(j, j + 2));
    gid[j] = id === undefined ? -1 : id;
    if (id !== undefined) any = true;
  }
  if (!any) return 0;

  // 窓の幅(2-gramの数)は検索語の文字数まで。窓をずらしながら、窓内の被覆数を増減だけで更新する
  const win = Math.min(gramCount, q.length);
  const cnt = new Int16Array(qg.need.length);
  let matched = 0;
  const add = (id: number) => {
    if (id < 0) return;
    cnt[id]++;
    if (cnt[id] <= qg.need[id]) matched++;
  };
  const remove = (id: number) => {
    if (id < 0) return;
    if (cnt[id] <= qg.need[id]) matched--;
    cnt[id]--;
  };
  let best = 0;
  for (let j = 0; j < gramCount; j++) {
    add(gid[j]);
    if (j >= win) remove(gid[j - win]);
    if (matched > best) {
      best = matched;
      if (best === qg.total) break;
    }
  }
  return best / qg.total;
}

/** q の文字が、t の中に順番どおりに(離れていてもよい)現れるか。サーバーの LIKE '%あ%い%う%' と同じ */
function isSubsequence(q: string, t: string): boolean {
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}

// ===== 採点 =====

const SCORE = {
  nameExact: 1.0,
  namePrefix: 0.97,
  nameContains: 0.93,
  lineContains: 0.8,
  // あいまい一致は 下限 + 傾き × 被覆率
  nameFuzzyBase: 0.5,
  nameFuzzySlope: 0.4,
  lineFuzzyBase: 0.4,
  lineFuzzySlope: 0.3,
  nameSubsequence: 0.45,
} as const;

function nameScore(
  q: string,
  qg: QueryGrams,
  names: readonly string[],
): number {
  let best = 0;
  for (const t of names) {
    if (t === "") continue;
    let s = 0;
    if (t === q) s = SCORE.nameExact;
    else if (t.startsWith(q)) s = SCORE.namePrefix;
    else if (t.includes(q)) s = SCORE.nameContains;
    else {
      const c = windowCoverage(q, qg, t);
      if (c >= COVERAGE_THRESHOLD) {
        s = SCORE.nameFuzzyBase + SCORE.nameFuzzySlope * c;
      } else if (q.length >= 3 && isSubsequence(q, t)) {
        s = SCORE.nameSubsequence;
      }
    }
    if (s > best) best = s;
  }
  return best;
}

function lineScore(q: string, qg: QueryGrams, t: string): number {
  if (t === "") return 0;
  if (t.includes(q)) return SCORE.lineContains;
  const c = windowCoverage(q, qg, t);
  return c >= COVERAGE_THRESHOLD
    ? SCORE.lineFuzzyBase + SCORE.lineFuzzySlope * c
    : 0;
}

// ===== 索引の下ごしらえ(正規化は索引ごとに1回だけ) =====

type PreparedEntry = {
  entry: SearchIndexEntry;
  names: string[];
  lines: { raw: string; norm: string }[];
};

const preparedCache = new WeakMap<SearchIndex, PreparedEntry[]>();

function prepare(index: SearchIndex): PreparedEntry[] {
  const cached = preparedCache.get(index);
  if (cached) return cached;
  const prepared = index.hymns.map((entry) => ({
    entry,
    // クラシックの先頭の★は曲名の一部ではない
    names: [
      normalizeForSearch(entry.nameJp.replace(/^★/, "")),
      normalizeForSearch(entry.nameEn ?? ""),
    ],
    lines: (entry.lines ?? []).map((raw) => ({
      raw,
      norm: normalizeForSearch(raw),
    })),
  }));
  preparedCache.set(index, prepared);
  return prepared;
}

// ===== 抜粋 =====

const SNIPPET_MAX = 60;

/** 長い行は、検索語が中央付近に来るように切り出して「…」を付ける(サーバーの LyricSnippets と同じ考え方) */
function makeSnippet(line: string, rawTerm: string): string {
  if (line.length <= SNIPPET_MAX) return line;
  const at = line.toLowerCase().indexOf(rawTerm.toLowerCase());
  const center = at >= 0 ? at + Math.floor(rawTerm.length / 2) : 0;
  let start = Math.max(0, center - Math.floor(SNIPPET_MAX / 2));
  const end = Math.min(line.length, start + SNIPPET_MAX);
  start = Math.max(0, end - SNIPPET_MAX);
  return (
    (start > 0 ? "…" : "") +
    line.slice(start, end) +
    (end < line.length ? "…" : "")
  );
}

// ===== 画面検索の本体 =====

function toLineNumber(score: number): LocalHymnRecord["lineNumber"] {
  if (score > 0.9) return "CADMIUM";
  if (score >= 0.7) return "BURGUNDY";
  return "NAPLES";
}

/**
 * 索引を検索語に照らして並べる。
 * 一致した曲を関連の強い順に先頭へ、残りの曲を元の順序で後ろに続ける(全曲を返す)。
 * 一致が0件なら hitCount = 0 で、全曲が元の順序のまま返る。
 */
export function searchLocal(
  index: SearchIndex,
  keyword: string,
): LocalSearchResult {
  const prepared = prepare(index);
  const rawTerm = keyword.normalize("NFC").replace(/　/g, " ").trim();
  const q = normalizeForSearch(rawTerm);

  const toRecord = (
    p: PreparedEntry,
    lineNumber: LocalHymnRecord["lineNumber"],
    snippet: string | null,
  ): LocalHymnRecord => ({
    // IDはサーバーが返した値のまま(実体は文字列)。Snowflake ID は19桁で、
    // Number にすると 2^53 を超えて末尾が丸まり、/hymns/{id}/lyric などが「見つかりません」になる。
    // 他の画面コードが id を number として扱っているため、型だけ合わせている
    id: p.entry.id as unknown as number,
    nameJp: p.entry.nameJp,
    nameKr: p.entry.nameKr,
    link: p.entry.link,
    lineNumber,
    snippet,
  });

  // 記号だけ・1文字未満の入力は照合しない
  if (q.length === 0) {
    return {
      records: prepared.map((p) => toRecord(p, "SNOWY", null)),
      hitCount: 0,
    };
  }

  const qg = buildQueryGrams(q);
  const hits: { rec: LocalHymnRecord; score: number; order: number }[] = [];
  const misses: LocalHymnRecord[] = [];

  prepared.forEach((p, order) => {
    const byName = nameScore(q, qg, p.names);

    let bestLine = 0;
    let bestLineRaw: string | null = null;
    let lineHits = 0;
    for (const l of p.lines) {
      const s = lineScore(q, qg, l.norm);
      if (s > 0) {
        lineHits++;
        if (s > bestLine) {
          bestLine = s;
          bestLineRaw = l.raw;
        }
      }
    }

    // 曲名の一致を歌詞の一致より優先する。歌詞が複数行に一致する曲は僅かに上げる
    const score = Math.max(
      byName,
      bestLine > 0 ? bestLine + Math.min(0.05, 0.01 * (lineHits - 1)) : 0,
    );
    if (score <= 0) {
      misses.push(toRecord(p, "SNOWY", null));
      return;
    }
    hits.push({
      rec: toRecord(
        p,
        toLineNumber(score),
        bestLineRaw ? makeSnippet(bestLineRaw, rawTerm) : null,
      ),
      score,
      order,
    });
  });

  hits.sort((a, b) => b.score - a.score || a.order - b.order);
  return {
    records: [...hits.map((h) => h.rec), ...misses],
    hitCount: hits.length,
  };
}
