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
  it('prefixes a string cell that a spreadsheet would run as a formula, and leaves numbers alone', () => {
    const csv = toCsv(
      [{ key: 'name', label: 'Team' }, { key: 'n', label: 'Change' }],
      [
        { name: '=HYPERLINK("x")', n: -3 },
        { name: '+1', n: 0 },
        { name: '-1', n: 1 },
        { name: '@SUM(A1)', n: 2 },
        { name: '\tx', n: 3 },
        { name: '\rx', n: 4 },
      ],
    );
    expect(csv).toBe('Team,Change\r\n"\'=HYPERLINK(""x"")",-3\r\n\'+1,0\r\n\'-1,1\r\n\'@SUM(A1),2\r\n\'\tx,3\r\n"\'\rx",4\r\n');
  });
});
