import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { scoreKeysQueryOptions } from "@/lib/scoreKeys";

export type ScoreStaffState = "ready" | "loading" | "empty" | "downloading";

/** 曲ごとにマウントされるホームの詳細で、調の選択とダウンロードを共通化する。 */
export function useHymnScore(
  hymnId: string,
  onDownload: (id: string, chord: string) => Promise<void>,
) {
  const keysQuery = useQuery(scoreKeysQueryOptions(hymnId));
  const keys = keysQuery.data ?? [];
  const [picked, setPicked] = useState<string>();
  const [downloading, setDownloading] = useState(false);
  const selected =
    keys.find((key) => key.chord === picked) ??
    keys.find((key) => key.isOriginal) ??
    keys[0];
  const chord = selected?.chord ?? null;
  const staffState: ScoreStaffState = keysQuery.isPending
    ? "loading"
    : !chord
      ? "empty"
      : downloading
        ? "downloading"
        : "ready";

  async function download() {
    if (staffState !== "ready" || !chord) return;
    setDownloading(true);
    try {
      await onDownload(hymnId, chord);
    } finally {
      setDownloading(false);
    }
  }

  return {
    keys,
    keysQuery,
    chord,
    isOriginal: selected?.isOriginal ?? false,
    staffState,
    setPicked,
    download,
  };
}
