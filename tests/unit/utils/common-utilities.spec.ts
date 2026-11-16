import { expect, test } from '@playwright/test';
import {
  containsText,
  createIdSource,
  createRunToken,
  describeValue,
  formatDuration,
  formatPrice,
  htmlText,
  htmlTitle,
  isRecord,
  normalizeText,
  parsePrice,
  randomSecret,
  uniqueEmail,
  uniqueId,
} from '../../../src/utils';
import { normalizeText as stage1NormalizeText } from '../../../src/utils/anti-bot-detector';

/** Stage 5 — common utilities (pure functions, no browser, no SUT). */

test.describe('parsePrice / formatPrice', () => {
  const valid: ReadonlyArray<readonly [string, number]> = [
    ['Rs. 500', 500],
    ['Rs.500', 500],
    ['  Rs.   1500 ', 1500],
    ['Rs. 1,500', 1500],
    ['rs. 0', 0],
    ['400', 400],
  ];
  for (const [text, amount] of valid) {
    test(`parses "${text}"`, () => expect(parsePrice(text)).toBe(amount));
  }

  for (const text of ['', 'Rs.', 'Rs. 5.00', 'Rs. -5', 'USD 5', 'Rs. 1,50', 'Rs. 500 x']) {
    test(`rejects "${text}"`, () => expect(() => parsePrice(text)).toThrow(RangeError));
  }

  test('formats in the exact format the SUT prints, and round-trips', () => {
    expect(formatPrice(500)).toBe('Rs. 500');
    expect(formatPrice(1500)).toBe('Rs. 1500');
    expect(parsePrice(formatPrice(799))).toBe(799);
    expect(() => formatPrice(-1)).toThrow(RangeError);
    expect(() => formatPrice(1.5)).toThrow(RangeError);
  });
});

test.describe('uniqueId / uniqueEmail', () => {
  test('ids are deterministic for a given run token', () => {
    const a = createIdSource('k3x9-ab12cd34');
    const b = createIdSource('k3x9-ab12cd34');
    const first = [a.next('user'), a.next('user'), a.next('ghost')];
    expect(first).toEqual(['user-k3x9-ab12cd34-1', 'user-k3x9-ab12cd34-2', 'ghost-k3x9-ab12cd34-3']);
    expect([b.next('user'), b.next('user'), b.next('ghost')]).toEqual(first);
  });

  test('the run token is time + entropy, and deterministic when both are given', () => {
    const token = createRunToken(new Date(0), Buffer.from([0xde, 0xad, 0xbe, 0xef]));
    expect(token).toBe('0-deadbeef');
    expect(createRunToken()).toMatch(/^[a-z0-9]+-[0-9a-f]{8}$/);
  });

  test('10 000 ids of one worker are all different', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => uniqueId('user')));
    expect(ids.size).toBe(10_000);
  });

  test('two sources (two workers or two runs) never collide', () => {
    const a = createIdSource();
    const b = createIdSource();
    expect(a.runToken).not.toBe(b.runToken);
    expect(a.next()).not.toBe(b.next());
  });

  test('e-mails are synthetic, on a reserved domain', () => {
    expect(uniqueEmail('user-k3x9-ab12cd34-1')).toBe('sqaf.user-k3x9-ab12cd34-1@example.com');
    expect(uniqueEmail()).toMatch(/^sqaf\.user-[a-z0-9-]+@example\.com$/);
  });

  test('rejects ids and prefixes that would produce invalid addresses', () => {
    expect(() => createIdSource('Bad Token')).toThrow(RangeError);
    expect(() => uniqueId('Bad-Prefix')).toThrow(RangeError);
    expect(() => uniqueEmail('a@b')).toThrow(RangeError);
  });

  test('random secrets are not derived from ids', () => {
    expect(randomSecret()).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(randomSecret()).not.toBe(randomSecret());
  });
});

test.describe('formatDuration', () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [0, '0 ms'],
    [850, '850 ms'],
    [999.6, '1000 ms'],
    [1_000, '1.0 s'],
    [1_500, '1.5 s'],
    [59_999, '59.9 s'],
    [60_000, '1 min 00 s'],
    [125_000, '2 min 05 s'],
    [3_725_000, '1 h 02 min 05 s'],
  ];
  for (const [ms, text] of cases) {
    test(`${ms} ms → "${text}"`, () => expect(formatDuration(ms)).toBe(text));
  }
  test('rejects negative and non-finite values', () => {
    for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => formatDuration(value)).toThrow(RangeError);
  });
});

test.describe('text and guards', () => {
  test('normalizeText is the same function exported in Stage 1', () => {
    expect(normalizeText).toBe(stage1NormalizeText);
    expect(normalizeText('\u001b[31m  One  moment…\n\u001b[39m')).toBe('One moment...');
  });

  test('containsText is case- and whitespace-insensitive', () => {
    expect(containsText('Soft  Stretch JEANS', 'jeans')).toBe(true);
    expect(containsText('Blue Top', 'Jeans')).toBe(false);
  });

  test('reads the title and text of an HTML body', () => {
    const html = '<html><head><title>One moment, please&hellip;</title><style>p{}</style></head><body><p>Please wait&nbsp;while</p><script>x()</script></body></html>';
    expect(htmlTitle(html)).toBe('One moment, please...');
    expect(htmlText(html)).toBe('One moment, please... Please wait while');
    expect(htmlTitle('no title')).toBe('');
  });

  test('describes values without printing them', () => {
    expect(describeValue('secret')).toBe('a string');
    expect(describeValue(null)).toBe('null');
    expect(describeValue([1])).toBe('an array');
    expect(describeValue(3)).toBe('number 3');
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
  });
});
