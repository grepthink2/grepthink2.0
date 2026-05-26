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

export function useClassTurnInStats(classId: string | undefined) {
  const [turnInRate, setTurnInRate] = useState<TurnInRateData>(EMPTY_TURN_IN_RATE);
  const [stats, setStats] = useState<ApiTurnInStats | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!classId) {
      setTurnInRate(EMPTY_TURN_IN_RATE);
      setStats(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await api.getClassTurnInStats(classId).catch(() => null);
      const turnIn = response?.turn_in;
      if (turnIn) {
        setTurnInRate(mapTurnInStats(turnIn));
        setStats(turnIn);
      } else {
        setTurnInRate(EMPTY_TURN_IN_RATE);
        setStats(null);
      }
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { turnInRate, stats, loading, refetch };
}
