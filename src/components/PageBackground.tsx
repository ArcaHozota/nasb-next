// src/components/PageBackground.tsx
// 画面全体の背景画像(画面に固定、コンテンツの背面)。各画面で共通に使う。
export default function PageBackground({ src }: { src: string }) {
  return (
    <div className="fixed inset-0 -z-10" aria-hidden="true">
      {/* 画像の最適化は無効(next.config.ts の images.unoptimized)なので素の <img> を使う */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </div>
  );
}
