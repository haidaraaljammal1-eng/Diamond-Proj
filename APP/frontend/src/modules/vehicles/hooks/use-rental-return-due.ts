"use client";

import { useEffect, useState } from "react";

function isEndAtDue(endAtIso: string, nowMs: number): boolean {
  const end = Date.parse(endAtIso);
  if (!Number.isFinite(end)) return false;
  return nowMs >= end;
}

/** Updates when contractual endAt is reached (minute granularity). */
export function useRentalReturnDue(endAt: string | null | undefined): boolean {
  const [due, setDue] = useState(() =>
    endAt ? isEndAtDue(endAt, Date.now()) : false,
  );

  useEffect(() => {
    if (!endAt) {
      setDue(false);
      return;
    }
    const tick = () => setDue(isEndAtDue(endAt, Date.now()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [endAt]);

  return due;
}
