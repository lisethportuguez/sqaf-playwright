import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  decodeEmbedded,
  describeLeaks,
  KNOWN_STATIC_EMAIL_HASHES,
  KNOWN_STATIC_RESOURCES,
  scanPaths,
  scanText,
} from '../../../src/reporting/allure/scan-report';

/**
 * Stage 6, Phase 2 (ADR-0011) — fail-closed leak scanner of the Allure
 * results, report and history. Every value is fictitious and built at
 * runtime; data ids have the real SHAPE (`user-<8 alnum>-<8 hex>-<n>`).
 */
const DATA_ID = ['user', 'zz00zz00', 'abcdef01', '3'].join('-');
const EMAIL = `sqaf.${DATA_ID}@example.com`;
const PASSWORD = ['Sqaf#', 'w'.repeat(16)].join('');
const CARD = ['4111', '1111', '1111', '1111'].join('');
const HOST = 'sqaf-build-host';
const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');
const entry = (path: string, text: string): string => `d("${path}","${b64(text)}")`;

test.describe('detectors', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ['email', 'contact: someone@example.org'],
    ['email', `email=${EMAIL.replace('@', '%40')}`],
    ['generated-password', `password ${PASSWORD}`],
    ['secret-pair', 'password=hunter22'],
    ['secret-pair', '{"password": "hunter22"}'],
    ['card-number', `card ${CARD}`],
    ['data-id', `the id ${DATA_ID}`],
    ['account-address', 'sqaf.user-zz'],
    ['typed-value', 'Fill "someone"'],
    ['typed-value', '- fill("someone")'],
    ['test-data-annotation', 'sqaf-test-data: newUserData'],
    ['host-name', `built on ${HOST.toUpperCase()}`],
    ['user-path', String.raw`C:\Users\someone\repo\file.ts`],
    ['user-path', '/home/runner/work/repo/file.ts'],
  ];
  // Titles never include the sample: they are printed in the CI log, which must hold no value shaped like sensitive data.
  for (const [index, [detector, text]] of cases.entries()) {
    test(`${detector} is found (sample ${index + 1})`, () => {
      expect(scanText(text, { host: HOST })).toContain(detector);
    });
  }

  test('redacted values and ordinary text are clean', () => {
    const clean = [
      '[e-mail redacted] [REDACTED] [card redacted] [data id redacted] [host redacted]',
      'Fill "[REDACTED]" and fill("[REDACTED]")',
      'password=[REDACTED] and "password": "[REDACTED]"',
      String.raw`C:\Users\[user]\repo and /home/[user]/work`,
      'TC9: Search Product [jeans] took 1794891292308 ms; package@1.2.3; uuid 9376db4a-7488-46c0-84cf-9d9f276844ab',
      '$.password: missing required field',
    ].join('\n');
    expect(scanText(clean, { host: HOST })).toEqual([]);
  });

  test('a 13-digit timestamp or a non-Luhn number is not a card', () => {
    expect(scanText('1794891292308 4111111111111112', { host: HOST })).toEqual([]);
  });

  test('a Luhn-valid digit run inside a hash identifier is not a card; a card next to letters still is', () => {
    // Allure test result id of CI run 44029915954: it contains a 16-digit Luhn-valid run by chance.
    const id = '7f7d6a53a3885938165491544d5d5330';
    expect(scanText(`"id":"${id}"`, { host: HOST })).toEqual([]);
    expect(scanText(`data/test-results/${id}.json`, { host: HOST })).toEqual([]);
    expect(scanText(`card${CARD}`, { host: HOST })).toEqual(['card-number']);
    expect(scanText(`${CARD}abc`, { host: HOST })).toEqual(['card-number']); // short hex-looking tail: not an identifier
    expect(scanText(`x${id.slice(0, 31)}${CARD}`, { host: HOST })).toEqual(['card-number']); // not all hex
  });
});

test.describe('base64 embedded data (single-file report)', () => {
  test('a leak inside an embedded d("…","base64") entry is decoded and found', () => {
    const html = `<script>${entry('data/test-results/1.json', `{"name":"${EMAIL}"}`)}</script>`;
    expect(scanText(html, { host: HOST })).toEqual([]); // invisible to a plain text search
    const { entries } = decodeEmbedded(html);
    expect(entries).toEqual([{ entry: 'data/test-results/1.json', text: `{"name":"${EMAIL}"}`, staticResource: false }]);
  });

  test('a leak inside a data: URI is decoded and found', () => {
    const { entries } = decodeEmbedded(`<img src="data:application/json;base64,${b64(`{"card":"${CARD}"}`)}">`);
    expect(entries).toHaveLength(1);
    expect(scanText(entries[0]!.text, { host: HOST })).toContain('card-number');
  });

  test('scanPaths reports the embedded entry, never the value', ({}, testInfo) => {
    const dir = testInfo.outputPath('report');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), `<script>${entry('data/test-results/1.json', `{"msg":"${PASSWORD} ${DATA_ID}"}`)}</script>`);
    const leaks = scanPaths([dir], { rootDir: dir, host: HOST });
    expect(leaks).toEqual([
      { detector: 'generated-password', file: 'index.html', entry: 'data/test-results/1.json' },
      { detector: 'data-id', file: 'index.html', entry: 'data/test-results/1.json' },
    ]);
    const text = describeLeaks(leaks);
    expect(text).toContain('generated-password in index.html (data/test-results/1.json)');
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(DATA_ID);
  });

  test('a large base64 report is scanned quickly (bounded patterns)', () => {
    const big = `<script>${entry('data/big.json', 'x'.repeat(4_000_000))}</script><p>${'A'.repeat(3_000_000)}</p>`;
    const start = Date.now();
    const { shell, entries } = decodeEmbedded(big);
    for (const text of [shell, ...entries.map((e) => e.text)]) scanText(text, { host: HOST });
    expect(Date.now() - start).toBeLessThan(10_000);
  });
});

test.describe('controlled exclusion of Allure static resources', () => {
  // A fictitious licence address and its hash stand in for the real ones (kept only as hashes).
  const LICENCE = 'author@library.example';
  const LICENCE_HASHES: ReadonlySet<string> = new Set([createHash('sha256').update(LICENCE).digest('hex')]);

  test('licence addresses of the bundled libraries are ignored ONLY in static resources', () => {
    const licence = `/* @author Someone \\u003C${LICENCE}\\u003E */`;
    expect(scanText(licence, { staticResource: true, host: HOST, staticEmailHashes: LICENCE_HASHES })).toEqual([]);
    expect(scanText(licence, { host: HOST, staticEmailHashes: LICENCE_HASHES })).toEqual(['email']); // in result data it is a leak
    expect(scanText(`/* \\u003Cother@example.org\\u003E */`, { staticResource: true, host: HOST, staticEmailHashes: LICENCE_HASHES })).toEqual(['email']);
  });

  test('the pinned licence addresses are kept only as SHA-256 (no real address in the repository)', () => {
    expect(KNOWN_STATIC_EMAIL_HASHES.size).toBe(3);
    for (const hash of KNOWN_STATIC_EMAIL_HASHES) expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('the licence addresses are not ignored inside embedded data entries', ({}, testInfo) => {
    const dir = testInfo.outputPath('report');
    mkdirSync(dir, { recursive: true });
    // Hash-allowlisted only through the default set, so a real data entry with ANY address is a leak.
    writeFileSync(join(dir, 'index.html'), `<script>${entry('data/test-results/1.json', LICENCE)}</script>`);
    expect(scanPaths([dir], { rootDir: dir, host: HOST })).toEqual([{ detector: 'email', file: 'index.html', entry: 'data/test-results/1.json' }]);
  });

  test('a static bundle is skipped ONLY when its SHA-256 is pinned; any other bundle is scanned', () => {
    const bundle = `var a="z@aPeb95Si.ebcpputyvjB",c="${CARD}";`;
    const hash = createHash('sha256').update(bundle).digest('hex');
    expect(KNOWN_STATIC_RESOURCES.has(hash)).toBe(false);
    const { entries } = decodeEmbedded(`<script src="data:text/javascript;base64,${b64(bundle)}"></script>`);
    expect(entries).toEqual([{ entry: 'data:text/javascript', text: bundle, staticResource: true }]);
    expect(scanText(entries[0]!.text, { staticResource: true, host: HOST })).toEqual(['email', 'card-number']);
    expect(KNOWN_STATIC_RESOURCES.size).toBe(1);
    for (const pinned of KNOWN_STATIC_RESOURCES) expect(pinned).toMatch(/^[0-9a-f]{64}$/);
  });

  test('binary payloads (images, fonts) are not decoded as text', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    const { entries } = decodeEmbedded(`${entry('data/attachments/1.png', 'x')}<img src="data:image/png;base64,${png}${'A'.repeat(20)}">`);
    expect(entries).toEqual([]);
  });
});

test.describe('fail-closed files', () => {
  test('a file type that cannot be scanned as text is a finding; images are not', ({}, testInfo) => {
    const dir = testInfo.outputPath('results');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'trace.zip'), 'PK');
    writeFileSync(join(dir, 'video.webm'), 'x');
    writeFileSync(join(dir, 'shot.png'), 'x');
    writeFileSync(join(dir, 'ok-result.json'), '{"name":"TC8: Verify All Products"}');
    expect(scanPaths([dir], { rootDir: dir, host: HOST }).map((l) => `${l.detector}:${l.file}`).sort()).toEqual([
      'unscannable-file:trace.zip',
      'unscannable-file:video.webm',
    ]);
  });

  test('missing paths are skipped (no report yet)', ({}, testInfo) => {
    expect(scanPaths([testInfo.outputPath('missing')], { host: HOST })).toEqual([]);
  });
});
