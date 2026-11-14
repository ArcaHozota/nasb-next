// src/components/JerusalemCross.tsx
// エルサレム十字のロゴ。色は文字色(currentColor)に従うので、背景に合わせて text-* で色を変えられる。
// (画像ファイル /assets/jerusalem-cross2.svg は burgundy 固定なので、暗い背景の上ではこちらを使う)
export default function JerusalemCross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 66 66" className={className} aria-hidden="true">
      <g fill="currentColor">
        <rect x="27" y="4" width="12" height="58" />
        <rect x="4" y="27" width="58" height="12" />
        <rect x="15" y="9" width="3" height="13" />
        <rect x="10" y="14" width="13" height="3" />
        <rect x="48" y="9" width="3" height="13" />
        <rect x="43" y="14" width="13" height="3" />
        <rect x="15" y="44" width="3" height="13" />
        <rect x="10" y="49" width="13" height="3" />
        <rect x="48" y="44" width="3" height="13" />
        <rect x="43" y="49" width="13" height="3" />
      </g>
    </svg>
  );
}
