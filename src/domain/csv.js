// Cutting a CSV file into parts without breaking a row (CR-0013). A row can hold a quoted comma or a quoted new line,
// so the file is read character by character instead of being split on lines.

/** The file's records as raw text, each without its line end. Empty lines are dropped. */
export function recordsOf(text) {
  const out = [];
  let cur = '';
  let quoted = false;
  const body = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '"') { quoted = !quoted; cur += ch; continue; }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && body[i + 1] === '\n') i += 1;
      if (cur.trim()) out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** The file as parts of at most `max` rows each, every part with the column names on top. `rows` is how many rows it holds. */
export function splitCsv(text, max = 500) {
  const recs = recordsOf(text);
  if (recs.length - 1 <= max) return [{ text, rows: Math.max(recs.length - 1, 0) }];
  const head = recs[0];
  const parts = [];
  for (let i = 1; i < recs.length; i += max) {
    const rows = recs.slice(i, i + max);
    parts.push({ text: [head, ...rows].join('\n'), rows: rows.length });
  }
  return parts;
}
