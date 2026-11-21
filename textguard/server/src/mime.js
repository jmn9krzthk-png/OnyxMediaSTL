// Small RFC 5322 / MIME parser for journaled email. Handles folded headers,
// encoded words, nested multipart, base64 and quoted-printable. Production
// would use a hardened library (e.g. mailparser) and keep the original .eml.

import crypto from 'node:crypto';

function decodeCharset(buf, charset = 'utf-8') {
  try {
    return new TextDecoder(charset.toLowerCase().replace(/^"|"$/g, ''), { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder('utf-8').decode(buf);
  }
}

function decodeQP(text) {
  const bytes = [];
  const s = text.replace(/=\r?\n/g, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(...Buffer.from(s[i], 'utf8'));
    }
  }
  return Buffer.from(bytes);
}

/** Decodes =?charset?B|Q?...?= words in a header value. */
export function decodeWords(value) {
  return value
    .replace(/\?=\s+=\?/g, '?==?')
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, cs, enc, data) =>
      decodeCharset(enc.toUpperCase() === 'B' ? Buffer.from(data, 'base64') : decodeQP(data.replace(/_/g, ' ')), cs),
    );
}

function parseHeaders(block) {
  const headers = {};
  const unfolded = block.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    headers[name] = headers[name] ? `${headers[name]}, ${value}` : value;
  }
  return headers;
}

function param(header, name) {
  const m = new RegExp(`${name}\\*?=(?:"([^"]*)"|([^;\\s]+))`, 'i').exec(header ?? '');
  return m ? decodeWords(m[1] ?? m[2]) : '';
}

function splitHeaderBody(raw) {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? [raw.slice(0, m.index), raw.slice(m.index + m[0].length)] : [raw, ''];
}

function walk(raw, out) {
  const [head, body] = splitHeaderBody(raw);
  const headers = parseHeaders(head);
  const type = (headers['content-type'] ?? 'text/plain').split(';')[0].trim().toLowerCase();
  if (type.startsWith('multipart/')) {
    const boundary = param(headers['content-type'], 'boundary');
    if (!boundary) return;
    const parts = body.split(`--${boundary}`);
    for (const part of parts.slice(1)) {
      if (part.startsWith('--')) break;
      walk(part.replace(/^\r?\n/, ''), out);
    }
    return;
  }
  const encoding = (headers['content-transfer-encoding'] ?? '7bit').toLowerCase();
  const bytes = encoding === 'base64' ? Buffer.from(body.replace(/\s+/g, ''), 'base64')
    : encoding === 'quoted-printable' ? decodeQP(body)
    : Buffer.from(body, 'latin1');
  const disposition = headers['content-disposition'] ?? '';
  const filename = param(disposition, 'filename') || param(headers['content-type'], 'name');
  if (/^attachment/i.test(disposition) || (filename && !type.startsWith('text/'))) {
    out.attachments.push({ contentType: type, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), name: filename });
  } else if (type === 'text/plain' && !out.text) {
    out.text = decodeCharset(bytes, param(headers['content-type'], 'charset') || 'utf-8');
  } else if (type === 'text/html' && !out.html) {
    out.html = decodeCharset(bytes, param(headers['content-type'], 'charset') || 'utf-8');
  }
}

function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Bare, lower-cased addresses from an address-list header. */
export function addresses(value) {
  if (!value) return [];
  return [...decodeWords(value).matchAll(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0].toLowerCase());
}

export function parseEmail(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('latin1') : raw;
  const [head] = splitHeaderBody(text);
  const h = parseHeaders(head);
  const out = { text: '', html: '', attachments: [] };
  walk(text, out);
  const date = Date.parse(h.date ?? '');
  const refs = (h.references ?? '').match(/<[^>]+>/g) ?? [];
  return {
    messageId: (h['message-id'] ?? '').trim(),
    threadId: refs[0] || (h['in-reply-to'] ?? '').trim() || (h['message-id'] ?? '').trim(),
    subject: decodeWords(h.subject ?? ''),
    from: addresses(h.from),
    to: addresses(h.to),
    cc: addresses(h.cc),
    bcc: addresses(h.bcc),
    date: Number.isNaN(date) ? null : new Date(date).toISOString(),
    body: (out.text || htmlToText(out.html)).replace(/\r\n/g, '\n').trim(),
    attachments: out.attachments,
  };
}
