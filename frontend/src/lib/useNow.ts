import { useEffect, useMemo, useState } from 'react';

/**
 * Ticking clock (30 s by default), so what a render derives from the time (Live / Join, the Now line,
 * a deadline that passes) moves without a reload. A component reads the clock here, never with
 * `new Date()` in render: a render that reads the clock is not pure, and a memoized one would keep
 * showing the time it first saw. Pass `fixed` to pin it (the design's demo clock, a test); nothing
 * ticks then, and unpinning shows the last tick until the next one. The same Date comes back until
 * the clock moves, so it is safe in a dependency list.
 */
export function useNow(ms = 30000, fixed?: Date): Date {
  const fixedMs = fixed ? fixed.getTime() : null;
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (fixedMs != null) return undefined;
    const timer = setInterval(() => setTick(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms, fixedMs]);
  const nowMs = fixedMs ?? tick;
  return useMemo(() => new Date(nowMs), [nowMs]);
}
