import { confirmLeave, needsLeaveConfirm } from "./confirmLeave";

// popstate は取り消せないため、確認中は元の履歴項目へ戻し、承諾時だけ移動を再実行する。
// 履歴の位置を Next の state と一緒に保持し、複数項目をまたぐ「戻る」「進む」にも対応する。
export function installHistoryGuard() {
  const key = "nasbHistoryPosition";
  let position = Number(history.state?.[key] ?? 0);
  let path = location.pathname;
  const push = history.pushState;
  const replace = history.replaceState;
  replace.call(history, { ...history.state, [key]: position }, "");
  history.pushState = function (state, title, url) {
    push.call(history, { ...state, [key]: position + 1 }, title, url);
    position++;
    path = location.pathname;
  };
  history.replaceState = function (state, title, url) {
    replace.call(history, { ...state, [key]: position }, title, url);
    path = location.pathname;
  };

  let restoreTo: number | undefined;
  let replayTo: number | undefined;
  const onPop = (event: PopStateEvent) => {
    const target: unknown = event.state?.[key];
    if (typeof target !== "number") return;
    if (restoreTo !== undefined) {
      event.stopImmediatePropagation();
      if (target !== position) {
        history.go(position - target);
        return;
      }
      const destination = restoreTo;
      restoreTo = undefined;
      void confirmLeave().then((ok) => {
        if (ok && position === target) {
          replayTo = destination;
          history.go(destination - position);
        }
      });
      return;
    }
    if (
      target !== replayTo &&
      path !== location.pathname &&
      needsLeaveConfirm() &&
      target !== position
    ) {
      event.stopImmediatePropagation();
      restoreTo = target;
      history.go(position - target);
      return;
    }
    replayTo = undefined;
    position = target;
    path = location.pathname;
  };
  window.addEventListener("popstate", onPop, true);
  return () => {
    window.removeEventListener("popstate", onPop, true);
    history.pushState = push;
    history.replaceState = replace;
  };
}
