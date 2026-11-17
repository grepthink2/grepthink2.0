import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile } from '../utils/saveFile';

describe('saveFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('hands the text to the browser as a download under its name, then lets the URL go', async () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => 'blob:doc');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicked: { href: string; download: string; inPage: boolean }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download, inPage: document.body.contains(this) });
    });

    saveFile('# Sprint 2 Report', 'trailhead-sprint-2-report.md');

    const [[blob]] = createObjectURL.mock.calls as unknown as [[Blob]];
    expect(blob.type).toBe('text/markdown;charset=utf-8');
    expect(await blob.text()).toBe('# Sprint 2 Report');
    expect(clicked).toEqual([{ href: 'blob:doc', download: 'trailhead-sprint-2-report.md', inPage: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:doc');
  });
});
