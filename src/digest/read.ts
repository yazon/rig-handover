import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunLine, RunStatus, StatusCounts } from './types.js';

// Same pattern as nightsOnDisk. Anything else never reaches the file system, so `night` can't
// point outside runsDir.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return { found: false };
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return { found: false };
    throw err;
  }
  return digest(text);
};

// Lines are in time order in the file, so "first" and "latest" follow file order.
function digest(text: string): NightDigest {
  const byJob = new Map<string, DigestRow>();
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines += 1;
      continue;
    }
    counts[line.status] += 1;

    let row = byJob.get(line.job);
    if (!row) {
      row = {
        job: line.job,
        owner: line.owner,
        runs: 0,
        retries: 0,
        lastStatus: line.status,
        lastError: null,
        firstAt: line.at,
        lastAt: line.at,
      };
      byJob.set(line.job, row);
    }
    row.owner = line.owner;
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { found: true, rows, badLines, counts };
}

// The edge: a line is a RunLine or it is a bad line. `at` must be a time and `job` non-empty;
// `error` may be absent, null or "" (no error) or a string; any other value makes the line bad.
function parseLine(raw: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;

  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (typeof owner !== 'string' && owner !== null) return null;
  if (error !== undefined && error !== null && typeof error !== 'string') return null;

  const line: RunLine = { at, job, status, owner };
  if (typeof error === 'string' && error !== '') line.error = error;
  return line;
}

function isStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}
