import { raw } from 'hono/html';
import type { DigestRow } from '../digest/types.js';

const NONE = '—';

// Marked rows get class="warn" and a text mark, so the HTML and a screenshot say the same
// without relying on colour.
function marks(row: DigestRow): string[] {
  const out: string[] = [];
  if (row.retries >= 3) out.push('many retries');
  if (row.lastStatus === 'fail') out.push('fail');
  return out;
}

// raw(): constant text, so the apostrophe stays literal in the HTML (jsx text would escape it).
function BadLines({ count }: { count: number }) {
  if (count === 0) return null;
  return <p class="warn">{raw(count === 1 ? "1 line didn't parse" : `${count} lines didn't parse`)}</p>;
}

export function DigestPage({ night, rows, badLines }: { night: string; rows: DigestRow[]; badLines: number }) {
  return (
    <>
      <h1>digest · {night}</h1>
      <BadLines count={badLines} />
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const m = marks(row);
              return (
                <tr class={m.length > 0 ? 'warn' : undefined}>
                  <td>
                    {row.job}
                    {m.length > 0 ? <> [{m.join(', ')}]</> : null}
                  </td>
                  <td>{row.owner ?? NONE}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? NONE}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

export function DigestNotFound({ night }: { night: string }) {
  return (
    <>
      <h1>digest</h1>
      <p class="warn">no run log for {night}</p>
    </>
  );
}
