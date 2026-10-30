import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// runs/ is read-only: anything that needs a file of its own goes to a temp dir.
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
const runsDir = join(tmp, 'runs');
mkdirSync(runsDir);
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function night(name: string, text: string): string {
  writeFileSync(join(runsDir, `${name}.jsonl`), text);
  return name;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const result = readNight('runs', '2026-10-28');

  it('folds the night into 5 jobs, sorted by job, with 1 bad line (the cut-off last line)', () => {
    expect(result).toEqual({
      found: true,
      badLines: 1,
      counts: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });
});

describe('readNight on runs/2026-10-27.jsonl', () => {
  it('reads a clean night: 4 jobs, no bad lines, all ok', () => {
    const result = readNight('runs', '2026-10-27');
    if (!result.found) throw new Error('expected 2026-10-27 to be found');
    expect(result.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(result.badLines).toBe(0);
    expect(result.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });
});

describe('readNight edge cases', () => {
  it('a night with no file is not found', () => {
    expect(readNight(runsDir, '2026-01-01')).toEqual({ found: false });
  });

  it('a runs dir that does not exist is not found', () => {
    expect(readNight(join(tmp, 'nope'), '2026-01-01')).toEqual({ found: false });
  });

  it('an empty file is found with no rows and no bad lines', () => {
    const empty = { found: true, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
    expect(readNight(runsDir, night('2026-02-01', ''))).toEqual(empty);
    expect(readNight(runsDir, night('2026-02-02', '\n\n  \n'))).toEqual(empty);
  });

  it('a night that is not YYYY-MM-DD is not found, even if the path would exist', () => {
    writeFileSync(join(tmp, 'outside.jsonl'), '{"at":"2026-10-28T23:00:00+01:00","job":"x","status":"ok","owner":null}\n');
    night('2026-03-01', '{"at":"2026-10-28T23:00:00+01:00","job":"x","status":"ok","owner":null}\n');
    for (const bad of ['../outside', '2026-03-01.jsonl', '2026-03-01/', ' 2026-03-01', '2026-3-1', '', '20260301']) {
      expect(readNight(runsDir, bad)).toEqual({ found: false });
    }
    expect(readNight(runsDir, '2026-03-01').found).toBe(true);
  });

  it('counts lines that are not JSON or not the right shape, and skips blank lines', () => {
    const ok = '{"at":"2026-04-01T01:00:00+02:00","job":"a","status":"ok","owner":"rook"}';
    const lines = [
      ok,
      '',
      'not json',
      '[1,2]',
      '42',
      'null',
      '{"job":"a","status":"ok","owner":"rook"}', // no at
      '{"at":"yesterday","job":"a","status":"ok","owner":"rook"}', // at is not a time
      '{"at":"2026-04-01T01:00:00+02:00","status":"ok","owner":"rook"}', // no job
      '{"at":"2026-04-01T01:00:00+02:00","job":"","status":"ok","owner":"rook"}', // empty job
      '{"at":"2026-04-01T01:00:00+02:00","job":"a","status":"done","owner":"rook"}', // bad status
      '{"at":"2026-04-01T01:00:00+02:00","job":"a","status":"ok","owner":7}', // owner not string/null
      '{"at":"2026-04-01T01:00:00+02:00","job":"a","status":"ok"}', // owner missing
      '{"at":"2026-04-01T01:00:00+02:00","job":"a","status":"fail","owner":"rook","error":42}', // error not a string
      '   ',
      '{"at":"2026-04-01T01:',
    ];
    const result = readNight(runsDir, night('2026-04-01', lines.join('\n') + '\n'));
    if (!result.found) throw new Error('expected the night to be found');
    expect(result.badLines).toBe(13);
    expect(result.rows).toHaveLength(1);
    expect(result.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('keeps a null owner, takes the latest error, and keeps times as written', () => {
    const text = [
      '{"at":"2026-05-01T23:00:00+01:00","job":"b","status":"retry","owner":null,"error":"first"}',
      '{"at":"2026-05-02T00:10:00+01:00","job":"b","status":"retry","owner":null,"error":"second"}',
      '{"at":"2026-05-02T00:20:00+01:00","job":"b","status":"ok","owner":null,"error":null}',
      '{"at":"2026-05-02T00:30:00+01:00","job":"b","status":"ok","owner":null}',
    ].join('\r\n');
    const result = readNight(runsDir, night('2026-05-01', text));
    if (!result.found) throw new Error('expected the night to be found');
    expect(result.badLines).toBe(0);
    expect(result.rows).toEqual([
      {
        job: 'b',
        owner: null,
        runs: 4,
        retries: 2,
        lastStatus: 'ok',
        lastError: 'second',
        firstAt: '2026-05-01T23:00:00+01:00',
        lastAt: '2026-05-02T00:30:00+01:00',
      },
    ]);
  });
});
