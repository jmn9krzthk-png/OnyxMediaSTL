// Append-only, hash-chained record store.
//
// Every record (captured message, supervisor review) is one JSON line in
// ledger.jsonl. Each line carries the SHA-256 of the previous line, so editing
// or deleting any record breaks the chain from that point on, and verify()
// reports exactly where. There is no update or delete API anywhere.
//
// This gives tamper *evidence*, not tamper *prevention*. In production the same
// lines are written to storage that physically refuses overwrites for the
// retention period (e.g. S3 Object Lock in compliance mode), which is what
// SEC Rule 17a-4(f) requires. See ../README.md.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

/** JSON with object keys sorted at every level, so hashes are reproducible. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashEntry(prevHash, { seq, ts, type, data }) {
  return crypto
    .createHash('sha256')
    .update(`${prevHash}\n${canonicalJson({ seq, ts, type, data })}`)
    .digest('hex');
}

export class Ledger {
  constructor(dir) {
    this.file = path.join(dir, 'ledger.jsonl');
    fs.mkdirSync(dir, { recursive: true });
    this.entries = [];
    if (fs.existsSync(this.file)) {
      const text = fs.readFileSync(this.file, 'utf8');
      for (const line of text.split('\n')) {
        if (line.trim()) this.entries.push(JSON.parse(line));
      }
    }
    // Opened in append mode only: this process never rewrites earlier bytes.
    this.fd = fs.openSync(this.file, 'a');
  }

  get head() {
    return this.entries.length ? this.entries[this.entries.length - 1].hash : GENESIS_HASH;
  }

  append(type, data) {
    const entry = {
      seq: this.entries.length + 1,
      ts: new Date().toISOString(),
      type,
      data,
    };
    entry.prevHash = this.head;
    entry.hash = hashEntry(entry.prevHash, entry);
    fs.writeSync(this.fd, `${JSON.stringify(entry)}\n`);
    fs.fsyncSync(this.fd);
    this.entries.push(entry);
    return entry;
  }

  /** Re-reads the file from disk and checks every link in the chain. */
  verify() {
    const text = fs.existsSync(this.file) ? fs.readFileSync(this.file, 'utf8') : '';
    const lines = text.split('\n').filter((l) => l.trim());
    let prev = GENESIS_HASH;
    for (let i = 0; i < lines.length; i++) {
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        return { ok: false, count: i, brokenAt: i + 1, reason: 'line is not valid JSON' };
      }
      if (entry.seq !== i + 1) {
        return { ok: false, count: i, brokenAt: i + 1, reason: `expected seq ${i + 1}, found ${entry.seq}` };
      }
      if (entry.prevHash !== prev) {
        return { ok: false, count: i, brokenAt: entry.seq, reason: 'prevHash does not match the previous record (record removed or reordered)' };
      }
      if (hashEntry(prev, entry) !== entry.hash) {
        return { ok: false, count: i, brokenAt: entry.seq, reason: 'record contents do not match its hash (record edited)' };
      }
      prev = entry.hash;
    }
    return { ok: true, count: lines.length, head: prev };
  }

  close() {
    fs.closeSync(this.fd);
  }
}
