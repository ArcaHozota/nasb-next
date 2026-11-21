import { create } from "zustand";
import api from "@/api/axios";
import type { PlaylistStatus } from "@/lib/youtube";
import { useCsrfStore } from "./csrf";
import { useFeedbackStore } from "./feedback";
import { useUnsavedGuard } from "./unsavedGuard";

type Job = { controller: AbortController; id?: string };
export const usePlaylistJob = create<{ job: Job | null; progress: string }>(
  () => ({
    job: null,
    progress: "",
  }),
);

async function requestCancel(id: string) {
  const { toast } = useFeedbackStore.getState();
  try {
    const { data } = await api.post<PlaylistStatus>(
      "/youtube/cancel-playlist",
      null,
      {
        params: { playlistId: id },
      },
    );
    toast(
      data.state === "done"
        ? "プレイリストの作成はすでに完了していたため、中止しませんでした。"
        : "プレイリストの作成を中止しました。",
    );
  } catch {
    toast("プレイリストの作成を中止できませんでした。");
  }
}

export function startPlaylist() {
  if (usePlaylistJob.getState().job) return null;
  const job: Job = { controller: new AbortController() };
  const { signal } = job.controller;
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (signal.aborted || useUnsavedGuard.getState().bypass) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const pageHide = () => {
    if (!job.id || signal.aborted) return;
    const csrf = useCsrfStore.getState();
    void fetch(
      "/api/youtube/cancel-playlist?playlistId=" + encodeURIComponent(job.id),
      {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { [csrf.headerName()]: csrf.tokenValue() },
      },
    ).catch(() => {});
  };
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("pagehide", pageHide);
  usePlaylistJob.setState({ job, progress: "" });
  return {
    signal,
    onStarted(id: string) {
      job.id = id;
      if (signal.aborted) void requestCancel(id);
    },
    finish() {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", pageHide);
      if (usePlaylistJob.getState().job === job)
        usePlaylistJob.setState({ job: null, progress: "" });
    },
  };
}

export async function confirmCancelPlaylist() {
  const { job } = usePlaylistJob.getState();
  if (!job || job.controller.signal.aborted) return true;
  const ok = await useFeedbackStore
    .getState()
    .confirm(
      "プレイリストを作成中です。移動すると作成を中止し、作りかけのプレイリストを削除します。移動しますか。",
    );
  if (ok) {
    job.controller.abort();
    if (job.id) await requestCancel(job.id);
  }
  return ok;
}
