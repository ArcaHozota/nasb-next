"use client";

// src/hooks/use-playlist-creation.ts
// YouTube プレイリスト作成の共通処理(賛美歌一覧・ランダム選択で共用)。
//  - 作成して完了まで待つ(進捗を progress に出す)
//  - 完了したら「YouTubeへ移動しますか」を確認する
//  - 409(未連携・再認証が必要)なら、個人設定へ移動するか確認する
//  - それ以外のエラーはトーストに出す
import { startPlaylist, usePlaylistJob } from "@/stores/playlistJob";
import { waitForLeaveDecision } from "@/lib/confirmLeave";
import { useGuardedNavigation } from "@/hooks/use-guarded-navigation";
import {
  createPlaylistAndWait,
  getYoutubeReauthConfirmText,
  PlaylistError,
  PlaylistCancelled,
  type PlaylistTarget,
} from "@/lib/youtube";
import { extractErrorMessage } from "@/lib/constants";
import { useFeedbackStore } from "@/stores/feedback";

const YOUTUBE_PLAYLISTS_URL = "https://www.youtube.com/feed/playlists";

export function usePlaylistCreation() {
  const { go } = useGuardedNavigation();
  const toast = useFeedbackStore((s) => s.toast);
  const confirm = useFeedbackStore((s) => s.confirm);
  const creating = usePlaylistJob((s) => !!s.job);
  const progress = usePlaylistJob((s) => s.progress);

  /**
   * resolveTarget: 対象の曲(ID の一覧か、検索条件)を決める。対象が無いときは、自分でトーストを出して null を返す。
   * (決める途中の通信エラーも、プレイリスト作成のエラーと同じ扱いで表示される)
   */
  const create = async (
    resolveTarget: () => Promise<PlaylistTarget | null>,
  ) => {
    const job = startPlaylist();
    if (!job) {
      toast("プレイリストを作成中です。完了までお待ちください。");
      return;
    }
    try {
      const target = await resolveTarget();
      if (!target || job.signal.aborted) return;
      if ("hymnIds" in target && target.hymnIds.length === 0) return;
      await createPlaylistAndWait(
        target,
        (st) =>
          usePlaylistJob.setState({ progress: `${st.added}/${st.total}` }),
        job,
      );
      await waitForLeaveDecision();
      if (job.signal.aborted) return;
      job.finish();
      const proceed = await confirm(
        "プレイリストを作成しました。今はYouTubeへ移動してよろしいでしょうか。",
        "お知らせ",
      );
      if (proceed) {
        window.open(YOUTUBE_PLAYLISTS_URL, "_blank", "noopener,noreferrer");
      }
    } catch (e: unknown) {
      await waitForLeaveDecision();
      if (job.signal.aborted || e instanceof PlaylistCancelled) return;
      job.finish();
      if (
        e &&
        typeof e === "object" &&
        "response" in e &&
        (e as { response?: { status?: number } }).response?.status === 409
      ) {
        // 連携トークン失効・取り消し(再認証が必要)の場合は、専用文言で「はい／いいえ」を確認する
        const reauthText = getYoutubeReauthConfirmText(e);
        const ok = reauthText
          ? await confirm(reauthText, "お知らせ")
          : await confirm(
              "YouTube連携がまだ完了していません。連携ページへ移動しますか？",
            );
        if (ok) await go("/personal");
        return;
      }
      toast(
        extractErrorMessage(
          e instanceof PlaylistError ? e.message : e,
          "プレイリスト作成に失敗しました",
        ),
      );
    } finally {
      job.finish();
    }
  };

  return { creating, progress, create };
}
