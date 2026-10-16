// src/lib/keySignature.ts
// 長調12種(楽譜の調。HymnScoreModal の MAJOR_KEYS と同じ値)の調号と日本語名。
// ト音記号の五線譜に調号(♯・♭)を描くための位置もここで決める。

export type KeySignature = {
  /** 調号の種類(ハ長調は null) */
  accidental: "sharp" | "flat" | null;
  /** 調号の数 */
  count: number;
  /** 日本語名(例: ト長調) */
  nameJa: string;
  /** 表示用の調名(例: B♭) */
  label: string;
};

const SIGNATURES: Record<string, Omit<KeySignature, "label">> = {
  C: { accidental: null, count: 0, nameJa: "ハ長調" },
  G: { accidental: "sharp", count: 1, nameJa: "ト長調" },
  D: { accidental: "sharp", count: 2, nameJa: "ニ長調" },
  A: { accidental: "sharp", count: 3, nameJa: "イ長調" },
  E: { accidental: "sharp", count: 4, nameJa: "ホ長調" },
  B: { accidental: "sharp", count: 5, nameJa: "ロ長調" },
  F: { accidental: "flat", count: 1, nameJa: "ヘ長調" },
  Bb: { accidental: "flat", count: 2, nameJa: "変ロ長調" },
  Eb: { accidental: "flat", count: 3, nameJa: "変ホ長調" },
  Ab: { accidental: "flat", count: 4, nameJa: "変イ長調" },
  Db: { accidental: "flat", count: 5, nameJa: "変ニ長調" },
  Gb: { accidental: "flat", count: 6, nameJa: "変ト長調" },
};

/** "Bb" → "B♭" */
export const keyLabel = (chord: string) =>
  chord.length > 1 && chord.endsWith("b") ? `${chord.slice(0, -1)}♭` : chord;

/** 調の情報。未知の調は null */
export function keySignature(chord: string | null | undefined): KeySignature | null {
  if (!chord) return null;
  const sig = SIGNATURES[chord];
  return sig ? { ...sig, label: keyLabel(chord) } : null;
}

/**
 * ト音記号での調号の位置(第5線 F5 を 0 として、下へ線・間を1段ずつ数えた段数)。
 * ♯: F C G D A E B / ♭: B E A D G C F の順に置く、楽譜の標準の配置。
 */
const SHARP_STEPS = [0, 3, -1, 2, 5, 1, 4];
const FLAT_STEPS = [4, 1, 5, 2, 6, 3, 7];

export function accidentalSteps(sig: KeySignature | null): number[] {
  if (!sig || !sig.accidental) return [];
  const steps = sig.accidental === "sharp" ? SHARP_STEPS : FLAT_STEPS;
  return steps.slice(0, sig.count);
}
