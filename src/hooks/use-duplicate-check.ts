"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import axios from "axios";
import api from "@/api/axios";
import { extractErrorMessage } from "@/lib/constants";

export function useDuplicateCheck(
  url: string,
  field: string,
  id: string | null,
  value: string,
  duplicateMessage: string,
  failureMessage: string,
) {
  const [failure, setFailure] = useState<{
    id: string | null;
    value: string;
    message: string;
  } | null>(null);
  const pending = useRef<{
    controller: AbortController;
    result: Promise<boolean>;
  } | null>(null);
  const cancel = useCallback(() => {
    pending.current?.controller.abort();
    pending.current = null;
  }, []);
  useLayoutEffect(() => cancel, [value, id, cancel]);
  function reset() {
    cancel();
    setFailure(null);
  }
  function check() {
    if (!value) return Promise.resolve(true);
    if (pending.current) return pending.current.result;
    const controller = new AbortController();
    setFailure(null);
    const result = api
      .get(url, {
        params: { id: id ?? "", [field]: value },
        signal: controller.signal,
      })
      .then(() => !controller.signal.aborted)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          const message =
            axios.isAxiosError(e) && e.response?.status === 409
              ? extractErrorMessage(e, duplicateMessage)
              : failureMessage;
          setFailure({ id, value, message });
        }
        return false;
      })
      .finally(() => {
        if (pending.current?.controller === controller) pending.current = null;
      });
    pending.current = { controller, result };
    return result;
  }
  const error =
    failure?.id === id && failure.value === value ? failure.message : "";
  return { check, reset, error };
}
