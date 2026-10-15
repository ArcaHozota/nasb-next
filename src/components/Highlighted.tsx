"use client";

import { splitByTerms } from "@/lib/lyrics";
import { cn } from "@/lib/utils";

/** 検索した語に一致する部分を <mark> で強調して表示する */
export default function Highlighted({
  text,
  terms,
  markClassName,
}: {
  text: string;
  terms: string[];
  markClassName?: string;
}) {
  return (
    <>
      {splitByTerms(text, terms).map((part, i) =>
        part.hit ? (
          <mark key={i} className={cn("lyric-mark", markClassName)}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
