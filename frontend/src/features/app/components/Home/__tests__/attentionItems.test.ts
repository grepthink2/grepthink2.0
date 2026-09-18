import { describe, expect, it } from 'vitest';
import { buildAttentionItems } from '../attentionItems';

describe('buildAttentionItems', () => {
  const classes = [
    { id: 'c1', name: 'CSE 115A' },
    { id: 'c2', name: 'CSE 115C' },
    { id: 'c3', name: 'CSE 130' },
  ];

  it('flags a missing roster and registered students not on it, in class order', () => {
    const items = buildAttentionItems(classes, [
      { class_id: 'c2', roster_uploaded_at: '2026-09-01T00:00:00Z', not_on_roster: 1 },
      { class_id: 'c1', roster_uploaded_at: null, not_on_roster: 3 },
    ]);
    expect(items).toEqual([
      {
        id: 'c1:roster_missing',
        classId: 'c1',
        className: 'CSE 115A',
        type: 'roster_missing',
        message: 'No official roster uploaded yet',
      },
      {
        id: 'c1:unmatched',
        classId: 'c1',
        className: 'CSE 115A',
        type: 'unmatched',
        message: '3 students registered but not on the roster',
      },
      {
        id: 'c2:unmatched',
        classId: 'c2',
        className: 'CSE 115C',
        type: 'unmatched',
        message: '1 student registered but not on the roster',
      },
    ]);
  });

  it('ignores classes without a summary and summaries for other classes', () => {
    expect(
      buildAttentionItems([classes[2]], [{ class_id: 'c9', roster_uploaded_at: null, not_on_roster: 5 }]),
    ).toEqual([]);
    expect(
      buildAttentionItems(classes, [
        { class_id: 'c3', roster_uploaded_at: '2026-09-01T00:00:00Z', not_on_roster: 0 },
      ]),
    ).toEqual([]);
  });
});
