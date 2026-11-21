import { useFeedbackStore } from "@/stores/feedback";
import { confirmCancelPlaylist, usePlaylistJob } from "@/stores/playlistJob";
import { useUnsavedGuard } from "@/stores/unsavedGuard";

let decision: Promise<boolean> | undefined;

export function needsLeaveConfirm() {
  const { dirty, bypass } = useUnsavedGuard.getState();
  const { job } = usePlaylistJob.getState();
  return (
    !bypass &&
    (decision !== undefined ||
      dirty ||
      (job !== null && !job.controller.signal.aborted))
  );
}

export async function waitForLeaveDecision() {
  while (decision) await decision;
}

export async function confirmLeave(logout = false) {
  if (decision) return false;
  const confirm = useFeedbackStore.getState().confirm;
  decision = (async () => {
    if (logout && !(await confirm("ログアウトしますか？", "警告")))
      return false;
    const { dirty, bypass } = useUnsavedGuard.getState();
    if (
      dirty &&
      !bypass &&
      !(await confirm("編集中の内容があります。破棄して移動しますか？"))
    )
      return false;
    return confirmCancelPlaylist();
  })();
  try {
    return await decision;
  } finally {
    decision = undefined;
  }
}
