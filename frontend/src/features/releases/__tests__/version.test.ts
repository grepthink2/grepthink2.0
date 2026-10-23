import pkgText from '../../../../package.json?raw';
import { APP_VERSION, compareVersions, parseVersion } from '../version';

const pkg = JSON.parse(pkgText) as { version: string };

describe('parseVersion', () => {
  it('reads MAJOR.MINOR.PATCH', () => expect(parseVersion('0.91.0')).toEqual([0, 91, 0]));
  it.each(['', '0.91', '0.91.0.1', 'v0.91.0', '01.2.3', '1.02.3', '1.2.3-beta', ' 1.2.3', '1.2.3 '])(
    'refuses %j',
    (value) => expect(parseVersion(value)).toBeNull(),
  );
});

describe('compareVersions', () => {
  it('orders by number, not by text', () =>
    expect(['1.0.0', '0.10.0', '0.91.0', '0.9.0'].sort(compareVersions)).toEqual(['0.9.0', '0.10.0', '0.91.0', '1.0.0']));
  it('is zero for equal versions', () => expect(compareVersions('0.91.0', '0.91.0')).toBe(0));
  it('throws on a non-version', () => expect(() => compareVersions('0.91', '0.91.0')).toThrow('Not a version: 0.91'));
});

describe('APP_VERSION', () => {
  it("is frontend/package.json's version", () => expect(APP_VERSION).toBe(pkg.version));
});
