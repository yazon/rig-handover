import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { DigestRow } from '../src/digest/types.js';

// Fixtures live in a temp runs dir: `runs/` is read-only.
let runsDir: string;
let app: ReturnType<typeof createApp>;

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify(error === undefined ? { at, job, status, owner } : { at, job, status, owner, error });

// Written out of job order on purpose: the routes must sort by job.
const FULL = [
  line('2026-10-28T01:00:00+01:00', 'job-charlie', 'ok', null),
  line('2026-10-28T01:05:00+01:00', 'job-alpha', 'retry', 'ola', 'timeout'),
  line('2026-10-28T01:10:00+01:00', 'job-bravo', 'ok', 'ola'),
  line('2026-10-28T01:15:00+01:00', 'job-alpha', 'retry', 'ola', 'timeout'),
  line('2026-10-28T01:20:00+01:00', 'job-alpha', 'retry', 'ola', 'timeout'),
  line('2026-10-28T01:25:00+01:00', 'job-alpha', 'fail', 'ola', 'gave up'),
  '',
].join('\n');
const FULL_JOBS = ['job-alpha', 'job-bravo', 'job-charlie'];

const ONE_BAD = [
  line('2026-10-27T02:00:00+01:00', 'job-two', 'ok', 'kasia'),
  'this is not json',
  line('2026-10-27T02:05:00+01:00', 'job-one', 'ok', 'kasia'),
  '',
].join('\n');

const TWO_BAD = [
  '{"at": ',
  line('2026-10-26T02:00:00+01:00', 'job-one', 'ok', 'kasia'),
  '{"job":"job-two"}',
  '',
].join('\n');

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(runsDir, '2026-10-28.jsonl'), FULL);
  writeFileSync(join(runsDir, '2026-10-27.jsonl'), ONE_BAD);
  writeFileSync(join(runsDir, '2026-10-26.jsonl'), TWO_BAD);
  writeFileSync(join(runsDir, '2026-10-25.jsonl'), '');
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

// JSX escapes quotes; compare on the text a reader sees.
const pageText = async (path: string) => {
  const res = await app.request(path);
  const html = (await res.text()).replaceAll('&#39;', "'").replaceAll('&apos;', "'");
  return { res, html };
};

const order = (html: string, jobs: string[]) =>
  jobs
    .map((job) => ({ job, at: html.indexOf(job) }))
    .sort((a, b) => a.at - b.at)
    .map((x) => x.job);

describe('GET /digest/:night', () => {
  it('renders a night with rows: 200, the lane banner and every job in job order', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const { res, html } = await pageText('/digest/2026-10-28');
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    for (const job of FULL_JOBS) expect(html).toContain(job);
    expect(order(html, FULL_JOBS)).toEqual(FULL_JOBS);
  });

  it('shows a null owner as an em dash', async () => {
    const { html } = await pageText('/digest/2026-10-28');
    expect(html).toContain('—');
  });

  it('says how many lines did not parse (singular)', async () => {
    const { res, html } = await pageText('/digest/2026-10-27');
    expect(res.status).toBe(200);
    expect(html).toContain("1 line didn't parse");
    expect(order(html, ['job-one', 'job-two'])).toEqual(['job-one', 'job-two']);
  });

  it('says how many lines did not parse (plural)', async () => {
    const { res, html } = await pageText('/digest/2026-10-26');
    expect(res.status).toBe(200);
    expect(html).toContain("2 lines didn't parse");
  });

  it('does not mention bad lines when there are none', async () => {
    const { html } = await pageText('/digest/2026-10-28');
    expect(html).not.toContain("didn't parse");
  });

  it('renders "nothing ran" for an empty file', async () => {
    const { res, html } = await pageText('/digest/2026-10-25');
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('returns 404 for a night with no file', async () => {
    const { res, html } = await pageText('/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for 2020-01-01');
  });

  it('returns 404 for something that is not a night', async () => {
    const { res, html } = await pageText('/digest/nope');
    expect(res.status).toBe(404);
    expect(html).toContain('no run log for nope');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns 200 with night, rows sorted by job, badLines and counts', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      night: string;
      rows: DigestRow[];
      badLines: number;
      counts: { ok: number; retry: number; fail: number };
    };
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(FULL_JOBS);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 2, retry: 3, fail: 1 });
  });

  it('returns the rows exactly as the reader does, null owner kept', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    const body = (await res.json()) as { rows: DigestRow[] };
    const read = readNight(runsDir, '2026-10-28');
    expect(read.found).toBe(true);
    if (!read.found) return;
    expect(body.rows).toEqual(read.rows);
    expect(body.rows.find((r) => r.job === 'job-charlie')?.owner).toBeNull();
  });

  it('counts a bad line and still returns the rows', async () => {
    const res = await app.request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: DigestRow[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['job-one', 'job-two']);
  });

  it('returns 200 with no rows for an empty file', async () => {
    const res = await app.request('/api/digest/2026-10-25');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: DigestRow[]; badLines: number; counts: unknown };
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
    expect(body.counts).toEqual({ ok: 0, retry: 0, fail: 0 });
  });

  it('returns 404 with an error for a night with no file', async () => {
    const res = await app.request('/api/digest/2020-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ night: '2020-01-01', error: 'no run log for this night' });
  });

  it('returns 404 for something that is not a night', async () => {
    const res = await app.request('/api/digest/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ night: 'nope', error: 'no run log for this night' });
  });
});

describe('page and JSON agree (ADR 0001)', () => {
  it.each(['2026-10-28', '2026-10-27', '2026-10-26'])('%s: same jobs, same order', async (night) => {
    const api = (await (await app.request(`/api/digest/${night}`)).json()) as { rows: DigestRow[] };
    const jobs = api.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    const { html } = await pageText(`/digest/${night}`);
    for (const job of jobs) expect(html).toContain(job);
    expect(order(html, jobs)).toEqual(jobs);
  });
});
