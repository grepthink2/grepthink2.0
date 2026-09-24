import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { api } from '@/lib/api';
import type { ApiTurnInStats } from '@/lib/api';
import type { TurnInRateData } from '@features/app/components/Stats/AssignmentTurnInRate';

export const EMPTY_TURN_IN_RATE: TurnInRateData = {
  rate: 0,
  teamsSubmitted: { count: 0, total: 0 },
  partialSubmissions: { count: 0, total: 0 },
  currentAssignment: '—',
  dueDate: '—',
};

export function mapTurnInStats(stats: ApiTurnInStats): TurnInRateData {
  return {
    rate: stats.rate,
    teamsSubmitted: stats.teamsSubmitted,
    partialSubmissions: stats.partialSubmissions,
    currentAssignment: stats.currentAssignment ?? '—',
    dueDate: stats.closeDate
      ? format(parseISO(stats.closeDate), 'MMM d, yyyy')
      : '—',
  };
}

interface TurnInResult {
  classId: string;
  stats: ApiTurnInStats | null;
  turnInRate: TurnInRateData;
}

/** One read of a class's turn-in stats; a failed read counts as no stats. */
async function fetchTurnInStats(classId: string): Promise<TurnInResult> {
  const response = await api.getClassTurnInStats(classId).catch(() => null);
  const stats = response?.turn_in ?? null;
  return {
    classId,
    stats,
    turnInRate: stats ? mapTurnInStats(stats) : EMPTY_TURN_IN_RATE,
  };
}

export function useClassTurnInStats(classId: string | undefined) {
  // The latest read, tagged with its class. It stays on screen while another
  // class loads; with no class selected it is cleared.
  const [result, setResult] = useState<TurnInResult | null>(null);
  const [refetching, setRefetching] = useState(false);
  if (!classId && result !== null) {
    setResult(null);
  }

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    void fetchTurnInStats(classId).then((next) => {
      if (!cancelled) setResult(next);
    });
    return () => {
      cancelled = true;
    };
  }, [classId]);

  const refetch = useCallback(async () => {
    if (!classId) return;
    setRefetching(true);
    try {
      setResult(await fetchTurnInStats(classId));
    } finally {
      setRefetching(false);
    }
  }, [classId]);

  return {
    turnInRate: result?.turnInRate ?? EMPTY_TURN_IN_RATE,
    stats: result?.stats ?? null,
    loading: Boolean(classId) && (result?.classId !== classId || refetching),
    refetch,
  };
}
