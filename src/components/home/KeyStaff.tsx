"use client";

// src/components/home/KeyStaff.tsx
// 選んだ長調の調号を描いたト音記号の五線譜。押すとその調の楽譜をダウンロードする(PC版ホーム)。
import { Download } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import {
  accidentalSteps,
  keySignature,
} from "@/lib/keySignature";
import { cn } from "@/lib/utils";
import { TREBLE_CLEF_G_LINE, TREBLE_CLEF_PATH } from "@/lib/trebleClef";

// 五線の位置(viewBox 上の y)。線の間隔 8、段(線と間)の間隔 4
const TOP_LINE_Y = 20;
const STEP = 4;
const LINES = [0, 1, 2, 3, 4].map((i) => TOP_LINE_Y + i * STEP * 2);
// ト音記号: 線の間隔 8 に対して約 7.4 段分の高さ(楽譜の標準的な大きさ)。
// 渦巻きの中心が第2線(G4)に来るように置く
const CLEF_SCALE = 0.034;
const G_LINE_Y = LINES[3];
const CLEF_TRANSFORM = `translate(4 ${G_LINE_Y + TREBLE_CLEF_G_LINE * CLEF_SCALE}) scale(${CLEF_SCALE} ${-CLEF_SCALE})`;

// ♯・♭はフォントの字形ではなく線で描く(OS・フォントによって位置がずれないように)
function Sharp({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g stroke="currentColor" strokeLinecap="butt">
      <line x1={cx - 2} y1={cy - 7} x2={cx - 2} y2={cy + 9} strokeWidth="1.2" />
      <line x1={cx + 2} y1={cy - 9} x2={cx + 2} y2={cy + 7} strokeWidth="1.2" />
      <line x1={cx - 4.5} y1={cy - 1.5} x2={cx + 4.5} y2={cy - 4} strokeWidth="2.2" />
      <line x1={cx - 4.5} y1={cy + 4} x2={cx + 4.5} y2={cy + 1.5} strokeWidth="2.2" />
    </g>
  );
}

function Flat({ cx, cy }: { cx: number; cy: number }) {
  // 縦棒の下端の丸み(ふくらみ)の中心が cy に来る
  const x = cx - 3;
  return (
    <g stroke="currentColor" fill="none">
      <line x1={x} y1={cy - 12} x2={x} y2={cy + 4} strokeWidth="1.3" />
      <path
        d={`M ${x} ${cy + 4} C ${x + 8} ${cy}, ${x + 7} ${cy - 5}, ${x} ${cy - 1}`}
        strokeWidth="1.8"
      />
    </g>
  );
}

export default function KeyStaff({
  chord,
  isOriginal,
  state,
  onDownload,
}: {
  /** 選択中の調(null: 楽譜なし・読み込み中) */
  chord: string | null;
  isOriginal: boolean;
  /** ready: 押せる / loading: 調の一覧を取得中 / empty: 楽譜未登録 / downloading: ダウンロード中 */
  state: "ready" | "loading" | "empty" | "downloading";
  onDownload: () => void;
}) {
  const sig = keySignature(chord);
  const steps = accidentalSteps(sig);
  const isSharp = sig?.accidental === "sharp";
  const disabled = state !== "ready";

  const title =
    state === "empty"
      ? "楽譜未登録"
      : state === "loading" || !sig
        ? "楽譜を確認しています…"
        : `${sig.nameJa}（${sig.label}）${isOriginal ? "・オリジナルキー" : ""}`;

  return (
    <button
      type="button"
      className={cn("key-staff", disabled && "is-disabled")}
      disabled={disabled}
      aria-label={sig && state === "ready" ? `${sig.nameJa}の楽譜をダウンロード` : title}
      onClick={onDownload}
    >
      <svg width="300" height="72" viewBox="0 0 300 72" aria-hidden="true">
        <g stroke="currentColor" strokeWidth="1">
          {LINES.map((y) => (
            <line key={y} x1="0" y1={y} x2="300" y2={y} />
          ))}
          <line x1="299" y1={LINES[0]} x2="299" y2={LINES[4]} />
        </g>
        <path d={TREBLE_CLEF_PATH} transform={CLEF_TRANSFORM} fill="currentColor" />
        {steps.map((s, i) => {
          // 記号の中心を、その音の線(または間)の高さにぴったり合わせる
          const cx = 48 + i * 11;
          const cy = TOP_LINE_Y + s * STEP;
          return isSharp ? <Sharp key={i} cx={cx} cy={cy} /> : <Flat key={i} cx={cx} cy={cy} />;
        })}
      </svg>
      <span className="flex flex-col gap-0.5 text-left">
        <span className="text-[17px] font-bold">{title}</span>
        {state === "ready" && (
          <span className="key-staff-hint">
            楽譜をダウンロード
            <Download className="size-3.5" aria-hidden="true" />
          </span>
        )}
        {state === "downloading" && (
          <span className="key-staff-hint">
            <Spinner className="size-3.5" /> ダウンロードしています…
          </span>
        )}
      </span>
    </button>
  );
}
