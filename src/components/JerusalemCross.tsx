// src/components/JerusalemCross.tsx
// エルサレム十字のロゴ。形は /assets/jerusalem-cross.svg と同じ(腕の先が T 字形の本来のエルサレム十字)。
// ファイルの方は色が #800020 に固定されているため、画面ではこの部品を使う。
// 色は文字色(currentColor)に従うので、背景に合わせて text-* で変えられる
// (例: 明るい背景では text-primary、濃い背景ではアイボリー)。
// 太さもファイルと同じにするため、塗りに加えて同じ色の線(stroke)を重ねている。
export default function JerusalemCross({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={className}
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={16.896}
      aria-hidden="true"
    >
      <path d="M352 23v18h-78v197h197v-78h18v192h-18v-78H274v197h78v18H160v-18h78V274H41v78H23V160h18v78h197V41h-78V23zm41 41v55h55v18h-55v55h-18v-55h-55v-18h55V64zm-256 0v55h55v18h-55v55h-18v-55H64v-18h55V64zm256 256v55h55v18h-55v55h-18v-55h-55v-18h55v-55zm-256 0v55h55v18h-55v55h-18v-55H64v-18h55v-55z" />
    </svg>
  );
}
