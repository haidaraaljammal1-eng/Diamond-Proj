"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

interface UseRecordFocusOptions {
  ready: boolean;
  version: number | string;
  highlightClassName?: string;
}

/** Focuses a record identified by ?focus= once the page's current records are rendered. */
export function useRecordFocus({ ready, version, highlightClassName }: UseRecordFocusOptions) {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus");

  useEffect(() => {
    if (!ready || !focus) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let timeout: number | undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(
        document.querySelectorAll<HTMLElement>("[data-record-id]"),
      ).find((element) => {
        if (element.getClientRects().length === 0) return false;
        return (
          element.dataset.recordId === focus ||
          element.dataset.recordNumber === focus ||
          element.dataset.recordExternalId === focus
        );
      });

      if (!target) return;

      target.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
        inline: "nearest",
      });
      if (!highlightClassName) return;

      target.classList.add(highlightClassName);
      timeout = window.setTimeout(
        () => target.classList.remove(highlightClassName),
        reducedMotion ? 1800 : 2600,
      );
    });

    return () => {
      window.cancelAnimationFrame(frame);
      if (timeout != null) window.clearTimeout(timeout);
    };
  }, [focus, highlightClassName, ready, version]);
}
