/**
 * The analytics page's state: filters in the URL, one payload per filter change, the previous frame
 * held while refetching, a stale response ignored, a 60 s auto-refresh while the tab is visible.
 * Spec §6.4; the brief's §3.2 "Refetch holds the frame".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type { AnalyticsRangePreset, ApiAnalyticsDashboard, ApiAnalyticsScope } from '@/lib/api/types';

export interface AnalyticsFilters {
  institutionId: string | null;
  classId: string | null;
  window: AnalyticsRangePreset;
  from: string | null;
  to: string | null;
}

const PRESETS: readonly AnalyticsRangePreset[] = ['7d', '30d', '90d', 'class', 'all', 'custom'];
const REFRESH_MS = 60_000;

function isPreset(value: string | null): value is AnalyticsRangePreset {
  return value !== null && (PRESETS as readonly string[]).includes(value);
}

function readFilters(params: URLSearchParams): AnalyticsFilters {
  const preset = params.get('window');
  const classId = params.get('class');
  const range: AnalyticsRangePreset = isPreset(preset) ? preset : '30d';
  return {
    institutionId: params.get('institution'),
    classId,
    window: range === 'class' && !classId ? '30d' : range, // a class window needs a class (hand-edited URLs)
    from: params.get('from'),
    to: params.get('to'),
  };
}

function writeFilters(f: AnalyticsFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.institutionId) params.set('institution', f.institutionId);
  if (f.classId) params.set('class', f.classId);
  if (f.window !== '30d') params.set('window', f.window);
  if (f.window === 'custom') {
    if (f.from) params.set('from', f.from);
    if (f.to) params.set('to', f.to);
  }
  return params;
}

/** A fetch is possible only with an institution and, for a custom range, both dates. */
function isComplete(f: AnalyticsFilters): boolean {
  if (!f.institutionId) return false;
  if (f.window === 'custom') return Boolean(f.from && f.to);
  return true;
}

export function useAnalyticsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const [scope, setScope] = useState<ApiAnalyticsScope | null>(null);
  const [scopeLoading, setScopeLoading] = useState(true);
  const [scopeError, setScopeError] = useState<number | null>(null);
  const [data, setData] = useState<ApiAnalyticsDashboard | null>(null);
  const [error, setError] = useState<number | null>(null);
  const seq = useRef(0);

  // `refetching` is true while the newest request is in flight; its settle lowers it. It is raised where
  // a load starts, never inside `load`, so the load effect sets no state synchronously
  // (react-hooks/set-state-in-effect): the initial state covers the mount's load, a filter change raises
  // it during render (react.dev, "adjusting state when a prop changes"), and `refresh` (the button's and
  // the interval's load) raises it itself.
  const [refetching, setRefetching] = useState(() => isComplete(filters));
  const [requestedFor, setRequestedFor] = useState(filters);
  if (requestedFor !== filters) {
    setRequestedFor(filters);
    if (isComplete(filters)) setRefetching(true);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .getAnalyticsScope()
      .then((s) => {
        if (cancelled) return;
        setScope(s);
        setScopeLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setScopeError(e instanceof ApiError ? e.status : 0);
        setScopeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // No institution in the URL yet: take the first one in scope (and record it in the URL).
  useEffect(() => {
    if (filters.institutionId || !scope || scope.institutions.length === 0) return;
    // a class in the URL picks its own institution; a class of no institution in scope is dropped
    const owner = filters.classId ? scope.institutions.find((i) => i.classes.some((c) => c.id === filters.classId)) : undefined;
    const next: AnalyticsFilters = { ...filters, institutionId: (owner ?? scope.institutions[0]).id, classId: owner ? filters.classId : null };
    if (!next.classId && next.window === 'class') next.window = '30d';
    setSearchParams(writeFilters(next), { replace: true });
  }, [filters, scope, setSearchParams]);

  const setFilters = useCallback(
    (patch: Partial<AnalyticsFilters>) => {
      const next: AnalyticsFilters = { ...filters, ...patch };
      if (!next.classId && next.window === 'class') next.window = '30d';
      if (next.window !== 'custom') {
        next.from = null;
        next.to = null;
      }
      setSearchParams(writeFilters(next), { replace: true });
    },
    [filters, setSearchParams],
  );

  /** Starts a request for `f`, unless `f` is incomplete; answers whether it did. */
  const load = useCallback(
    (f: AnalyticsFilters, fresh: boolean): boolean => {
      if (!isComplete(f) || !f.institutionId) return false;
      const mine = ++seq.current;
      api
        .getAnalyticsDashboard({ institution_id: f.institutionId, class_id: f.classId, window: f.window, from: f.from, to: f.to, fresh })
        .then((d) => {
          if (mine !== seq.current) return; // a newer request owns the frame
          setData(d);
          setError(null);
          setRefetching(false);
        })
        .catch((e: unknown) => {
          if (mine !== seq.current) return;
          setError(e instanceof ApiError ? e.status : 0);
          setRefetching(false);
        });
      return true;
    },
    [],
  );

  useEffect(() => {
    load(filters, false);
  }, [filters, load]);

  const refresh = useCallback(() => {
    if (load(filters, true)) setRefetching(true);
  }, [filters, load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      // fresh: a poll the server's or the browser's 60 s cache could answer would refresh nothing
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return {
    scope,
    scopeLoading,
    scopeError,
    filters,
    setFilters,
    data,
    loading: data === null && error === null && (scopeLoading || isComplete(filters)),
    refetching,
    error,
    refresh,
  };
}
