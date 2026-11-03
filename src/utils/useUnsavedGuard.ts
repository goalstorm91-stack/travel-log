import { useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";

const MESSAGE = "저장하지 않은 변경 사항이 있어요. 저장하지 않고 나갈까요?";

/**
 * Asks before leaving a form that has unsaved changes — through the in-app back/home
 * buttons, the browser or swipe-back gesture, or closing the tab. Call `leave()` just
 * before navigating after a successful save (or delete) to skip the question.
 */
export function useUnsavedGuard(dirty: boolean): { leave: () => void } {
  const dirtyRef = useRef(dirty);
  const leavingRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const blocker = useBlocker(() => dirtyRef.current && !leavingRef.current);

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm(MESSAGE)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current || leavingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return {
    leave: () => {
      leavingRef.current = true;
    },
  };
}
