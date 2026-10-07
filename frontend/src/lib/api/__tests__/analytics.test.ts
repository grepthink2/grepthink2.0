import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { analyticsQueryString } from '@/lib/api/analytics';

describe('analytics api', () => {
  it('exposes both methods on the facade', () => {
    expect(typeof api.getAnalyticsScope).toBe('function');
    expect(typeof api.getAnalyticsDashboard).toBe('function');
  });

  it('builds the dashboard query string, sending from/to only for a custom range and fresh only when asked', () => {
    expect(analyticsQueryString({ institution_id: 'i1', window: '30d' })).toBe('institution_id=i1&window=30d');
    expect(analyticsQueryString({ institution_id: 'i1', class_id: 'c1', window: 'class' })).toBe(
      'institution_id=i1&window=class&class_id=c1',
    );
    expect(
      analyticsQueryString({ institution_id: 'i1', window: 'custom', from: '2026-09-01', to: '2026-09-30', fresh: true }),
    ).toBe('institution_id=i1&window=custom&from=2026-09-01&to=2026-09-30&fresh=1');
    expect(analyticsQueryString({ institution_id: 'i1', window: '7d', from: '2026-09-01', to: '2026-09-30' })).toBe(
      'institution_id=i1&window=7d',
    );
  });
});
