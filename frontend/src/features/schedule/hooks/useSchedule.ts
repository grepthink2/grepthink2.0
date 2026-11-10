import { useCallback, useEffect, useState } from 'react';
import { api, type ApiScheduleLens } from '@/lib/api';
import type { ScheduleItemData } from '../scheduleModel';
import { toScheduleItems } from '../scheduleApi';

export interface ScheduleAnswer {
  lens: ApiScheduleLens;
  items: ScheduleItemData[];
}

export interface ScheduleState {
  /** idle: nothing asked (no class, or not enabled). loading: no answer to show yet. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** The answer on screen: the last one for this class while the next loads. */
  answer: ScheduleAnswer | null;
  /** A newer answer is on its way while `answer` stays on screen. */
  reloading: boolean;
  /** Ask again (after an error). */
  retry: () => void;
}

interface Settled {
  key: string;
  failed: boolean;
}

/**
 * The caller's schedule items in one class for [from, to), mapped for the schedule components. No
 * request without a class or while `enabled` is false. A new range for the same class keeps the last
 * answer on screen until the new one lands; another class starts from loading.
 */
export function useSchedule(
  classId: string | null | undefined,
  from: Date,
  to: Date,
  { enabled = true }: { enabled?: boolean } = {},
): ScheduleState {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const [last, setLast] = useState<{ classId: string; answer: ScheduleAnswer } | null>(null);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const key = classId && enabled ? `${classId} ${fromIso} ${toIso} ${attempt}` : null;

  useEffect(() => {
    if (!key || !classId) return undefined;
    const controller = new AbortController();
    api.getSchedule(classId, new Date(fromIso), new Date(toIso), controller.signal).then(
      (res) => {
        if (controller.signal.aborted) return;
        setLast({ classId, answer: { lens: res.lens, items: toScheduleItems(res) } });
        setSettled({ key, failed: false });
      },
      () => {
        if (controller.signal.aborted) return;
        setSettled({ key, failed: true });
      },
    );
    return () => controller.abort();
  }, [key, classId, fromIso, toIso]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!key) return { status: 'idle', answer: null, reloading: false, retry };
  const answer = last && last.classId === classId ? last.answer : null;
  if (settled?.key === key) {
    return settled.failed
      ? { status: 'error', answer: null, reloading: false, retry }
      : { status: 'ready', answer, reloading: false, retry };
  }
  return answer
    ? { status: 'ready', answer, reloading: true, retry }
    : { status: 'loading', answer: null, reloading: false, retry };
}
