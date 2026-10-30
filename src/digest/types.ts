// Contract for the run log reader (plan.md § 1, issue #1). It lands before the implementation so
// the page, the JSON route, the board link and the route tests (plan.md § 2) can start against it.
//
// Implementation: `src/digest/read.ts` exports `readNight` (type `ReadNight` below).
//   import { readNight } from './digest/read.js';

/** A line's `status` in runs/<night>.jsonl. */
export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of runs/<night>.jsonl that parsed and has this shape. Anything else is a bad line. */
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One job in a night: all of its lines folded into one row. */
export type DigestRow = {
  job: string;
  /** Owner on the job's latest line. `null` is kept here; views show it as `—`. */
  owner: string | null;
  /** Lines for this job. */
  runs: number;
  /** Lines for this job with status `retry`. */
  retries: number;
  /** Status of the job's latest line. */
  lastStatus: RunStatus;
  /** `error` of the job's latest line that has one; `null` if none of its lines has one. */
  lastError: string | null;
  /** `at` of the job's first line, exactly as written in the log (offset kept, never UTC). */
  firstAt: string;
  /** `at` of the job's latest line, exactly as written in the log (offset kept, never UTC). */
  lastAt: string;
};

/**
 * Lines by status in one night, bad lines not included (ok + retry + fail = lines that parsed).
 * These are the board link's ok / retry / fail counts (plan.md § 2c).
 */
export type StatusCounts = { ok: number; retry: number; fail: number };

/**
 * What `readNight` returns. A caller tells the three cases apart like this:
 * - no file, or `night` is not `YYYY-MM-DD`: `{ found: false }` → the page returns 404.
 * - empty file: `{ found: true, rows: [], badLines: 0 }` → the page renders "nothing ran".
 *   (`rows: []` with `badLines > 0` is a file of only bad lines: nothing ran, say how many.)
 * - a night with rows: `{ found: true, rows: [...] }`.
 * Blank lines (a trailing newline, an empty line) are not lines: not rows, not bad lines.
 */
export type NightDigest =
  | { found: false }
  | {
      found: true;
      /** One row per job, sorted by job (plain string order). Page and JSON use it as is (ADR 0001). */
      rows: DigestRow[];
      /** Lines that are not JSON or not a `RunLine`. Counted, never thrown; the night still renders. */
      badLines: number;
      counts: StatusCounts;
    };

/**
 * Reads `<runsDir>/<night>.jsonl`. Synchronous, like rig's other file reads. Never throws for a
 * missing file, a bad `night` or bad lines; throws only if the file exists but cannot be read.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest;
