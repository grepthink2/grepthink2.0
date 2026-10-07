import { describe, expect, it } from 'vitest';
import { toCsv } from '../csv';

describe('toCsv', () => {
  it('quotes commas, quotes and newlines and writes a header row', () => {
    const csv = toCsv(
      [{ key: 'name', label: 'Class' }, { key: 'n', label: 'Teams' }],
      [{ name: 'CSE 115A · Fall 2026', n: 8 }, { name: 'Say "hi", twice\nplease', n: null }],
    );
    expect(csv).toBe('Class,Teams\r\nCSE 115A · Fall 2026,8\r\n"Say ""hi"", twice\nplease",\r\n');
  });
});
