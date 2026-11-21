// HTTP API for devices (enroll, upload captured messages, heartbeat) and for
// supervisors (search, review, devices, ledger verification, export).
// No third-party dependencies: Node's http and crypto modules only.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Ledger } from './ledger.js';
import { scan, LEXICON_VERSION, rules as lexiconRules } from './lexicon.js';
import { CHANNELS, DIRECTIONS, OFF_CHANNEL_APPS } from './channels.js';
import { parseEmail } from './mime.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_BATCH = 500;
const ENROLL_CODE_TTL_MS = 72 * 60 * 60 * 1000;
const STALE_DEVICE_MS = 60 * 60 * 1000;
const DEVICE_CHANNELS = new Set(['sms', 'mms', 'call']);
const CONNECTOR_TYPES = { email: ['email'], meta: ['facebook', 'instagram'], whatsapp: ['whatsapp'], connector: ['linkedin', 'teams', 'zoom', 'slack', 'x', 'web_chat'] };
const DECISIONS = new Set(['no_action', 'approved', 'escalated', 'follow_up']);
// Google Messages carries RCS "chat" messages outside the SMS database, so
// other apps cannot see them. Devices using it must have RCS turned off by MDM.
const RCS_CAPABLE_SMS_APPS = new Set(['com.google.android.apps.messaging', 'com.samsung.android.messaging']);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Mutable operational state (devices, enrollment codes). Not books-and-records. */
class StateStore {
  constructor(dir) {
    this.file = path.join(dir, 'state.json');
    this.state = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, 'utf8'))
      : { devices: {}, enrollmentCodes: {} };
    this.state.connectors ??= {};
  }
  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

export function createApp({ dataDir, adminToken }) {
  if (!adminToken || adminToken.length < 16) throw new Error('adminToken must be at least 16 characters');
  const ledger = new Ledger(dataDir);
  const store = new StateStore(dataDir);

  // In-memory indexes rebuilt from the ledger on start.
  const messages = new Map(); // messageId -> ledger entry
  const dedupe = new Map(); // `${sourceId}:${clientMsgId}` -> messageId (sourceId = device or connector)
  const reviews = new Map(); // messageId -> [review entries], oldest first
  function index(entry) {
    if (entry.type === 'message') {
      messages.set(entry.data.messageId, entry);
      dedupe.set(`${entry.data.deviceId ?? entry.data.connectorId}:${entry.data.clientMsgId}`, entry.data.messageId);
    } else if (entry.type === 'review') {
      const list = reviews.get(entry.data.messageId) ?? [];
      list.push(entry);
      reviews.set(entry.data.messageId, list);
    }
  }
  ledger.entries.forEach(index);

  // ---------- helpers ----------

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES * 10) throw new HttpError(413, 'request body too large');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async function readJson(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, 'request body too large');
      chunks.push(chunk);
    }
    if (!size) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'body is not valid JSON');
    }
  }

  function bearer(req) {
    const h = req.headers.authorization ?? '';
    return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  }

  function requireAdmin(req) {
    if (!safeEqual(bearer(req), adminToken)) throw new HttpError(401, 'supervisor token required');
  }

  function requireDevice(req) {
    const token = bearer(req);
    const hash = token ? sha256(token) : '';
    const device = Object.values(store.state.devices).find((d) => d.tokenHash && safeEqual(d.tokenHash, hash));
    if (!device) throw new HttpError(401, 'device token invalid or device revoked');
    if (device.revokedAt) throw new HttpError(403, 'device revoked');
    return device;
  }

  function str(v, max, field, { required = false } = {}) {
    if (v === undefined || v === null || v === '') {
      if (required) throw new HttpError(400, `${field} is required`);
      return '';
    }
    if (typeof v !== 'string' && typeof v !== 'number') throw new HttpError(400, `${field} must be a string`);
    const s = String(v);
    if (s.length > max) throw new HttpError(400, `${field} is longer than ${max} characters`);
    return s;
  }

  function reviewStatus(messageId) {
    const list = reviews.get(messageId);
    return list ? list[list.length - 1].data : null;
  }

  function messageView(entry) {
    return {
      ...entry.data,
      seq: entry.seq,
      receivedAt: entry.ts,
      hash: entry.hash,
      review: reviewStatus(entry.data.messageId),
    };
  }

  function deviceView(d) {
    const now = Date.now();
    const lastSeen = d.lastHeartbeatAt ?? d.enrolledAt;
    const issues = [];
    if (d.revokedAt) issues.push('Revoked');
    else {
      if (now - Date.parse(lastSeen) > STALE_DEVICE_MS) issues.push('No check-in for over an hour');
      const p = d.status?.permissions ?? {};
      for (const [perm, granted] of Object.entries(p)) if (!granted) issues.push(`Permission off: ${perm}`);
      if (d.status?.defaultSmsPackage && RCS_CAPABLE_SMS_APPS.has(d.status.defaultSmsPackage) && !d.status?.rcsDisabledByPolicy) {
        issues.push('Texting app supports RCS chat, which capture cannot see. Disable RCS by MDM policy.');
      }
      if (d.status?.offChannelApps?.length) issues.push(`Off-channel apps installed: ${d.status.offChannelApps.join(', ')}`);
      if ((d.status?.pendingUploads ?? 0) > 200) issues.push(`${d.status.pendingUploads} messages waiting to upload`);
    }
    const { tokenHash, ...rest } = d;
    return { ...rest, lastSeen, issues, healthy: issues.length === 0 };
  }

  function sendJson(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(text);
  }

  /**
   * Validates one captured message and appends it to the ledger. Shared by
   * phones and server-side connectors so every channel lands in one archive.
   */
  function archive(source, m) {
    const clientMsgId = str(m.clientMsgId, 256, 'clientMsgId', { required: true });
    const channel = str(m.channel, 16, 'channel', { required: true });
    const direction = str(m.direction, 12, 'direction', { required: true });
    if (!CHANNELS[channel] || !source.channels.has(channel)) throw new HttpError(400, `channel ${channel} is not accepted from this source`);
    if (!DIRECTIONS.has(direction)) throw new HttpError(400, `unknown direction ${direction}`);
    const sentAt = str(m.sentAt, 40, 'sentAt', { required: true });
    if (Number.isNaN(Date.parse(sentAt))) throw new HttpError(400, 'sentAt must be an ISO 8601 time');
    const text = str(m.body, 100000, 'body');
    const subject = str(m.subject, 500, 'subject');
    const attachments = Array.isArray(m.attachments)
      ? m.attachments.slice(0, 50).map((a, i) => ({
          contentType: str(a?.contentType, 100, `attachments[${i}].contentType`),
          size: Number.isFinite(a?.size) ? a.size : null,
          sha256: str(a?.sha256, 64, `attachments[${i}].sha256`),
          name: str(a?.name, 200, `attachments[${i}].name`),
        }))
      : [];
    const counterparties = (Array.isArray(m.counterparties) ? m.counterparties : [m.counterparty])
      .filter(Boolean)
      .slice(0, 100)
      .map((c, i) => str(c, 200, `counterparties[${i}]`));
    const data = {
      messageId: crypto.randomUUID(),
      deviceId: source.deviceId,
      connectorId: source.connectorId,
      advisorId: source.advisorId,
      advisorName: source.advisorName,
      account: str(m.account, 200, 'account') || undefined,
      clientMsgId,
      channel,
      direction,
      counterparties,
      counterpartyName: str(m.counterpartyName, 200, 'counterpartyName') || undefined,
      subject: subject || undefined,
      threadId: str(m.threadId, 300, 'threadId') || undefined,
      body: text,
      sentAt: new Date(sentAt).toISOString(),
      durationSec: channel === 'call' && Number.isFinite(m.durationSec) ? m.durationSec : undefined,
      attachments,
      flags: scan(subject ? `${subject}\n${text}` : text),
      lexiconVersion: LEXICON_VERSION,
    };
    const entry = ledger.append('message', data);
    index(entry);
    return entry;
  }

  // ---------- device API ----------

  async function enroll(req, res) {
    const body = await readJson(req);
    const code = str(body.enrollmentCode, 64, 'enrollmentCode', { required: true }).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const record = store.state.enrollmentCodes[code];
    if (!record || record.usedAt || Date.now() > Date.parse(record.expiresAt)) {
      throw new HttpError(400, 'enrollment code is invalid, expired or already used');
    }
    if (body.disclosureAccepted !== true) {
      throw new HttpError(400, 'the advisor must accept the recording disclosure on the device');
    }
    const deviceId = crypto.randomUUID();
    const token = randomToken();
    const now = new Date().toISOString();
    record.usedAt = now;
    record.deviceId = deviceId;
    store.state.devices[deviceId] = {
      deviceId,
      advisorId: record.advisorId,
      advisorName: record.advisorName,
      model: str(body.deviceModel, 120, 'deviceModel'),
      osVersion: str(body.osVersion, 40, 'osVersion'),
      appVersion: str(body.appVersion, 40, 'appVersion'),
      phoneNumber: str(body.phoneNumber, 40, 'phoneNumber'),
      enrolledAt: now,
      disclosureAcceptedAt: now,
      tokenHash: sha256(token),
      status: null,
      lastHeartbeatAt: null,
      lastCaptureAt: null,
      revokedAt: null,
    };
    store.save();
    sendJson(res, 201, { deviceId, deviceToken: token, advisorId: record.advisorId, advisorName: record.advisorName });
  }

  async function uploadMessages(req, res) {
    const device = requireDevice(req);
    const body = await readJson(req);
    const batch = body.messages;
    if (!Array.isArray(batch)) throw new HttpError(400, 'messages must be an array');
    if (batch.length > MAX_BATCH) throw new HttpError(400, `send at most ${MAX_BATCH} messages per request`);

    const accepted = [];
    const duplicates = [];
    const rejected = [];
    for (const m of batch) {
      let clientMsgId = '';
      try {
        clientMsgId = str(m?.clientMsgId, 128, 'clientMsgId', { required: true });
        const key = `${device.deviceId}:${clientMsgId}`;
        if (dedupe.has(key)) {
          duplicates.push(clientMsgId);
          continue;
        }
        archive({ deviceId: device.deviceId, advisorId: device.advisorId, advisorName: device.advisorName, channels: DEVICE_CHANNELS }, { ...m, clientMsgId });
        accepted.push(clientMsgId);
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        rejected.push({ clientMsgId, error: err.message });
      }
    }
    if (accepted.length) {
      device.lastCaptureAt = new Date().toISOString();
      store.save();
    }
    // The device deletes its local copy only for ids in accepted or duplicates.
    sendJson(res, 200, { accepted, duplicates, rejected });
  }

  async function heartbeat(req, res) {
    const device = requireDevice(req);
    const body = await readJson(req);
    const permissions = {};
    if (body.permissions && typeof body.permissions === 'object') {
      for (const [k, v] of Object.entries(body.permissions).slice(0, 20)) permissions[str(k, 60, 'permission')] = v === true;
    }
    device.status = {
      permissions,
      defaultSmsPackage: str(body.defaultSmsPackage, 120, 'defaultSmsPackage'),
      rcsDisabledByPolicy: body.rcsDisabledByPolicy === true,
      pendingUploads: Number.isFinite(body.pendingUploads) ? body.pendingUploads : 0,
      appVersion: str(body.appVersion, 40, 'appVersion'),
      batteryOptimizationExempt: body.batteryOptimizationExempt === true,
      offChannelApps: Array.isArray(body.installedPackages)
        ? body.installedPackages.filter((p) => typeof p === 'string' && OFF_CHANNEL_APPS[p]).map((p) => OFF_CHANNEL_APPS[p])
        : [],
    };
    device.lastHeartbeatAt = new Date().toISOString();
    store.save();
    sendJson(res, 200, { ok: true, serverTime: device.lastHeartbeatAt });
  }

  // ---------- supervisor API ----------

  async function createEnrollmentCode(req, res) {
    requireAdmin(req);
    const body = await readJson(req);
    const advisorId = str(body.advisorId, 64, 'advisorId', { required: true });
    const advisorName = str(body.advisorName, 120, 'advisorName', { required: true });
    // No 0/O/1/I so codes are easy to read aloud and type.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (const b of crypto.randomBytes(8)) code += alphabet[b % alphabet.length];
    const expiresAt = new Date(Date.now() + ENROLL_CODE_TTL_MS).toISOString();
    store.state.enrollmentCodes[code] = { advisorId, advisorName, createdAt: new Date().toISOString(), expiresAt, usedAt: null };
    store.save();
    sendJson(res, 201, { enrollmentCode: code, advisorId, advisorName, expiresAt });
  }

  function listMessages(req, res, url) {
    requireAdmin(req);
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const advisor = url.searchParams.get('advisor') ?? '';
    const counterparty = url.searchParams.get('counterparty') ?? '';
    const channel = url.searchParams.get('channel') ?? '';
    const thread = url.searchParams.get('thread') ?? '';
    const flagged = url.searchParams.get('flagged');
    const status = url.searchParams.get('status') ?? ''; // pending | reviewed
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 1000);
    const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    let rows = [...messages.values()].map(messageView);
    if (advisor) rows = rows.filter((m) => m.advisorId === advisor);
    if (counterparty) rows = rows.filter((m) => m.counterparties.includes(counterparty));
    if (channel) rows = rows.filter((m) => m.channel === channel);
    if (thread) rows = rows.filter((m) => m.threadId === thread);
    if (flagged === 'true') rows = rows.filter((m) => m.flags.length);
    if (status === 'pending') rows = rows.filter((m) => m.flags.length && !m.review);
    if (status === 'reviewed') rows = rows.filter((m) => m.review);
    if (from) rows = rows.filter((m) => m.sentAt >= new Date(from).toISOString());
    if (to) rows = rows.filter((m) => m.sentAt <= new Date(to).toISOString());
    if (q) {
      rows = rows.filter(
        (m) =>
          m.body.toLowerCase().includes(q) ||
          (m.subject ?? '').toLowerCase().includes(q) ||
          (m.counterpartyName ?? '').toLowerCase().includes(q) ||
          m.counterparties.some((c) => c.toLowerCase().includes(q)) ||
          (m.advisorName ?? '').toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => (order === 'asc' ? a.sentAt.localeCompare(b.sentAt) : b.sentAt.localeCompare(a.sentAt)));
    sendJson(res, 200, { total: rows.length, messages: rows.slice(0, limit) });
  }

  function getMessage(req, res, id) {
    requireAdmin(req);
    const entry = messages.get(id);
    if (!entry) throw new HttpError(404, 'message not found');
    sendJson(res, 200, {
      message: messageView(entry),
      reviews: (reviews.get(id) ?? []).map((r) => ({ ...r.data, seq: r.seq, recordedAt: r.ts, hash: r.hash })),
    });
  }

  async function reviewMessage(req, res, id) {
    requireAdmin(req);
    if (!messages.has(id)) throw new HttpError(404, 'message not found');
    const body = await readJson(req);
    const decision = str(body.decision, 20, 'decision', { required: true });
    if (!DECISIONS.has(decision)) throw new HttpError(400, `decision must be one of ${[...DECISIONS].join(', ')}`);
    const entry = ledger.append('review', {
      messageId: id,
      decision,
      note: str(body.note, 4000, 'note'),
      reviewer: str(body.reviewer, 120, 'reviewer', { required: true }),
    });
    index(entry);
    sendJson(res, 201, { review: { ...entry.data, seq: entry.seq, recordedAt: entry.ts, hash: entry.hash } });
  }

  function listDevices(req, res) {
    requireAdmin(req);
    const devices = Object.values(store.state.devices).map(deviceView);
    const codes = Object.entries(store.state.enrollmentCodes)
      .filter(([, c]) => !c.usedAt && Date.now() < Date.parse(c.expiresAt))
      .map(([code, c]) => ({ code, ...c }));
    sendJson(res, 200, { devices, pendingEnrollmentCodes: codes });
  }

  function revokeDevice(req, res, id) {
    requireAdmin(req);
    const d = store.state.devices[id];
    if (!d) throw new HttpError(404, 'device not found');
    d.revokedAt = d.revokedAt ?? new Date().toISOString();
    store.save();
    sendJson(res, 200, { device: deviceView(d) });
  }

  function summary(req, res) {
    requireAdmin(req);
    const all = [...messages.values()];
    const flagged = all.filter((e) => e.data.flags.length);
    const pending = flagged.filter((e) => !reviews.has(e.data.messageId));
    const byCategory = {};
    for (const e of pending) for (const f of e.data.flags) byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    const devices = Object.values(store.state.devices).map(deviceView);
    const advisors = new Map();
    for (const d of devices) advisors.set(d.advisorId, d.advisorName);
    sendJson(res, 200, {
      messages: all.length,
      flagged: flagged.length,
      pendingReview: pending.length,
      pendingByCategory: byCategory,
      devices: devices.length,
      devicesWithIssues: devices.filter((d) => !d.healthy && !d.revokedAt).length,
      advisors: [...advisors].map(([id, name]) => ({ id, name })),
      ledger: { records: ledger.entries.length, head: ledger.head },
      lexicon: { version: LEXICON_VERSION, rules: lexiconRules },
    });
  }

  function verify(req, res) {
    requireAdmin(req);
    sendJson(res, 200, { ...ledger.verify(), checkedAt: new Date().toISOString() });
  }

  function csvCell(v) {
    const s = v === undefined || v === null ? '' : String(v);
    // Leading = + - @ would run as a formula when opened in a spreadsheet.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function exportRecords(req, res, url) {
    requireAdmin(req);
    const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'jsonl';
    const advisor = url.searchParams.get('advisor') ?? '';
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const inRange = (m) =>
      (!advisor || m.advisorId === advisor) &&
      (!from || m.sentAt >= new Date(from).toISOString()) &&
      (!to || m.sentAt <= new Date(to).toISOString());
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'jsonl') {
      // Whole ledger entries with prevHash and hash, so each one can be re-hashed
      // independently, and an unfiltered export re-verifies as a full chain.
      const lines = ledger.entries
        .filter((e) => {
          if (e.type === 'message') return inRange(e.data);
          if (e.type === 'review') return messages.has(e.data.messageId) && inRange(messages.get(e.data.messageId).data);
          return true;
        })
        .map((e) => JSON.stringify(e));
      res.writeHead(200, {
        'content-type': 'application/x-ndjson',
        'content-disposition': `attachment; filename="textguard-export-${stamp}.jsonl"`,
      });
      res.end(lines.join('\n') + '\n');
      return;
    }
    const header = ['sent_at', 'advisor_id', 'advisor_name', 'channel', 'direction', 'counterparties', 'subject', 'body', 'attachments', 'flags', 'review_decision', 'reviewer', 'review_note', 'ledger_seq', 'record_sha256'];
    const rows = [...messages.values()]
      .map(messageView)
      .filter(inRange)
      .sort((a, b) => a.sentAt.localeCompare(b.sentAt))
      .map((m) =>
        [
          m.sentAt, m.advisorId, m.advisorName, m.channel, m.direction, m.counterparties.join('; '), m.subject, m.body,
          m.attachments.map((a) => `${a.contentType} ${a.sha256}`).join('; '),
          m.flags.map((f) => `${f.category}: ${f.match}`).join('; '),
          m.review?.decision, m.review?.reviewer, m.review?.note, m.seq, m.hash,
        ].map(csvCell).join(','),
      );
    res.writeHead(200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="textguard-export-${stamp}.csv"`,
    });
    res.end([header.join(','), ...rows].join('\r\n') + '\r\n');
  }

  // ---------- connectors: email, Meta, WhatsApp and partner feeds ----------
  //
  // A connector is a server-side source of messages. Each one maps platform
  // accounts (an advisor's email address, Facebook Page id, WhatsApp number id,
  // LinkedIn member id...) to advisors. Messages for accounts that aren't
  // mapped are counted but not archived under anyone.

  function connectorView(c) {
    const { keyHash, appSecret, verifyToken, ...rest } = c;
    return { ...rest, channels: CONNECTOR_TYPES[c.type], hasAppSecret: Boolean(appSecret) };
  }

  async function createConnector(req, res) {
    requireAdmin(req);
    const body = await readJson(req);
    const type = str(body.type, 20, 'type', { required: true });
    if (!CONNECTOR_TYPES[type]) throw new HttpError(400, `type must be one of ${Object.keys(CONNECTOR_TYPES).join(', ')}`);
    const name = str(body.name, 120, 'name', { required: true });
    const connectorId = crypto.randomUUID();
    const key = randomToken();
    const c = {
      connectorId, type, name, keyHash: sha256(key), accounts: {}, createdAt: new Date().toISOString(),
      lastReceivedAt: null, received: 0, unmatched: 0, lastError: '',
    };
    if (type === 'meta' || type === 'whatsapp') {
      c.appSecret = str(body.appSecret, 200, 'appSecret', { required: true });
      c.verifyToken = str(body.verifyToken, 200, 'verifyToken') || randomToken(12);
    }
    store.state.connectors[connectorId] = c;
    store.save();
    const out = { connector: connectorView(c) };
    if (type === 'email') Object.assign(out, { connectorKey: key, ingestPath: '/api/v1/ingest/email' });
    if (type === 'connector') Object.assign(out, { connectorKey: key, ingestPath: '/api/v1/ingest/messages' });
    if (type === 'meta' || type === 'whatsapp') Object.assign(out, { webhookPath: `/api/v1/webhooks/${type}/${connectorId}`, verifyToken: c.verifyToken });
    sendJson(res, 201, out);
  }

  async function mapAccount(req, res, id) {
    requireAdmin(req);
    const c = store.state.connectors[id];
    if (!c) throw new HttpError(404, 'connector not found');
    const body = await readJson(req);
    let account = str(body.account, 200, 'account', { required: true }).trim();
    if (c.type === 'email') account = account.toLowerCase();
    c.accounts[account] = {
      advisorId: str(body.advisorId, 64, 'advisorId', { required: true }),
      advisorName: str(body.advisorName, 120, 'advisorName', { required: true }),
    };
    store.save();
    sendJson(res, 201, { connector: connectorView(c) });
  }

  function requireConnector(req, type) {
    const hash = bearer(req) ? sha256(bearer(req)) : '';
    const c = Object.values(store.state.connectors).find((x) => safeEqual(x.keyHash, hash));
    if (!c || c.type !== type) throw new HttpError(401, `${type} connector key required`);
    return c;
  }

  function sourceFor(c, account) {
    const a = c.accounts[account];
    return a ? { connectorId: c.connectorId, advisorId: a.advisorId, advisorName: a.advisorName, channels: new Set(CONNECTOR_TYPES[c.type]) } : null;
  }

  /** Archives unless already stored. Returns 'accepted' | 'duplicate'. */
  function archiveOnce(source, m) {
    if (dedupe.has(`${source.connectorId}:${m.clientMsgId}`)) return 'duplicate';
    archive(source, m);
    return 'accepted';
  }

  function touch(c, { received = 0, unmatched = 0, error = '' } = {}) {
    c.received += received;
    c.unmatched += unmatched;
    if (received || unmatched) c.lastReceivedAt = new Date().toISOString();
    c.lastError = error;
    store.save();
  }

  // Journaled email: the mail system sends a copy of every message to this
  // endpoint as raw RFC 822 (.eml). One record is kept per advisor on the mail.
  async function ingestEmail(req, res) {
    const c = requireConnector(req, 'email');
    const mail = parseEmail(await readBody(req));
    if (!mail.messageId) throw new HttpError(400, 'email has no Message-ID header');
    const participants = [...new Set([...mail.from, ...mail.to, ...mail.cc, ...mail.bcc])];
    const advisors = participants.filter((addr) => c.accounts[addr]);
    let accepted = 0;
    let duplicates = 0;
    for (const addr of advisors) {
      const source = sourceFor(c, addr);
      const fromAdvisor = mail.from.includes(addr);
      const others = participants.filter((p) => p !== addr);
      const internal = others.length > 0 && others.every((p) => c.accounts[p]);
      const r = archiveOnce(source, {
        clientMsgId: `${mail.messageId}|${addr}`,
        channel: 'email',
        direction: internal ? 'internal' : fromAdvisor ? 'outbound' : 'inbound',
        account: addr,
        counterparties: fromAdvisor ? others : mail.from,
        subject: mail.subject,
        threadId: mail.threadId,
        body: mail.body,
        attachments: mail.attachments,
        sentAt: mail.date ?? new Date().toISOString(),
      });
      r === 'accepted' ? accepted++ : duplicates++;
    }
    touch(c, { received: accepted, unmatched: advisors.length ? 0 : 1 });
    sendJson(res, 200, { accepted, duplicates, matchedAdvisors: advisors.length });
  }

  // Partner feeds (LinkedIn, Teams, Zoom, Slack, X, website chat): a connector
  // job pulls from the platform's compliance API and posts normalized JSON.
  async function ingestMessages(req, res) {
    const c = requireConnector(req, 'connector');
    const body = await readJson(req);
    if (!Array.isArray(body.messages)) throw new HttpError(400, 'messages must be an array');
    if (body.messages.length > MAX_BATCH) throw new HttpError(400, `send at most ${MAX_BATCH} messages per request`);
    const accepted = [], duplicates = [], rejected = [];
    let unmatched = 0;
    for (const m of body.messages) {
      const id = typeof m?.clientMsgId === 'string' ? m.clientMsgId : '';
      try {
        const source = sourceFor(c, String(m?.account ?? ''));
        if (!source) { unmatched++; throw new HttpError(400, `account ${m?.account} is not mapped to an advisor`); }
        (archiveOnce(source, m) === 'accepted' ? accepted : duplicates).push(id);
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        rejected.push({ clientMsgId: id, error: err.message });
      }
    }
    touch(c, { received: accepted.length, unmatched });
    sendJson(res, 200, { accepted, duplicates, rejected });
  }

  // Meta (Facebook Messenger, Instagram) and WhatsApp Business webhooks.
  function webhookConnector(type, id) {
    const c = store.state.connectors[id];
    if (!c || c.type !== type) throw new HttpError(404, 'unknown webhook');
    return c;
  }

  function verifyWebhook(req, res, url, type, id) {
    const c = webhookConnector(type, id);
    const p = url.searchParams;
    if (p.get('hub.mode') !== 'subscribe' || !safeEqual(p.get('hub.verify_token') ?? '', c.verifyToken)) {
      throw new HttpError(403, 'verify token does not match');
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(p.get('hub.challenge') ?? '');
  }

  async function signedWebhookBody(req, c) {
    const raw = await readBody(req);
    const expected = `sha256=${crypto.createHmac('sha256', c.appSecret).update(raw).digest('hex')}`;
    if (!safeEqual(req.headers['x-hub-signature-256'] ?? '', expected)) {
      touch(c, { error: 'rejected a webhook with a bad signature' });
      throw new HttpError(401, 'signature does not match');
    }
    try { return JSON.parse(raw.toString('utf8')); } catch { throw new HttpError(400, 'body is not valid JSON'); }
  }

  const metaAttachments = (list) => (Array.isArray(list) ? list : []).map((a) => ({ contentType: String(a?.type ?? 'file'), size: null, sha256: '', name: '' }));

  async function metaWebhook(req, res, id) {
    const c = webhookConnector('meta', id);
    const body = await signedWebhookBody(req, c);
    const channel = body.object === 'instagram' ? 'instagram' : body.object === 'page' ? 'facebook' : null;
    let accepted = 0, unmatched = 0;
    if (channel) {
      for (const entry of body.entry ?? []) {
        const source = sourceFor(c, String(entry.id));
        for (const ev of entry.messaging ?? []) {
          const msg = ev.message;
          if (!msg?.mid) continue; // deliveries, reads, reactions
          if (!source) { unmatched++; continue; }
          const outbound = msg.is_echo === true;
          const r = archiveOnce(source, {
            clientMsgId: msg.mid,
            channel,
            direction: outbound ? 'outbound' : 'inbound',
            account: String(entry.id),
            counterparty: String(outbound ? ev.recipient?.id : ev.sender?.id),
            threadId: `${channel}:${entry.id}:${outbound ? ev.recipient?.id : ev.sender?.id}`,
            body: typeof msg.text === 'string' ? msg.text : '',
            attachments: metaAttachments(msg.attachments),
            sentAt: new Date(Number(ev.timestamp) || Date.now()).toISOString(),
          });
          if (r === 'accepted') accepted++;
        }
      }
    }
    touch(c, { received: accepted, unmatched });
    sendJson(res, 200, { ok: true }); // Meta retries anything that isn't a 200
  }

  function waText(m) {
    if (m.type === 'text') return m.text?.body ?? '';
    const media = m[m.type];
    return media?.caption ?? (m.type === 'location' ? `[location ${m.location?.latitude},${m.location?.longitude}]` : `[${m.type}]`);
  }

  async function whatsappWebhook(req, res, id) {
    const c = webhookConnector('whatsapp', id);
    const body = await signedWebhookBody(req, c);
    let accepted = 0, unmatched = 0;
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const v = change.value ?? {};
          const numberId = String(v.metadata?.phone_number_id ?? '');
          const source = sourceFor(c, numberId);
          const names = Object.fromEntries((v.contacts ?? []).map((ct) => [ct.wa_id, ct.profile?.name]));
          // "messages": received from clients. "smb_message_echoes": sent from the
          // WhatsApp Business app on a number connected to the platform.
          const batches = change.field === 'messages' ? [[v.messages, 'inbound']] : change.field === 'smb_message_echoes' ? [[v.message_echoes, 'outbound']] : [];
          for (const [list, direction] of batches) {
            for (const m of list ?? []) {
              if (!source) { unmatched++; continue; }
              const other = direction === 'inbound' ? m.from : m.to;
              const media = m[m.type];
              const r = archiveOnce(source, {
                clientMsgId: m.id,
                channel: 'whatsapp',
                direction,
                account: numberId,
                counterparty: `+${String(other ?? '').replace(/^\+/, '')}`,
                counterpartyName: names[other],
                threadId: `whatsapp:${numberId}:${other}`,
                body: waText(m),
                attachments: media?.mime_type ? [{ contentType: media.mime_type, size: null, sha256: media.sha256 ? Buffer.from(media.sha256, 'base64').toString('hex') : '', name: media.filename ?? '' }] : [],
                sentAt: new Date((Number(m.timestamp) || Date.now() / 1000) * 1000).toISOString(),
              });
              if (r === 'accepted') accepted++;
            }
          }
        }
      }
    }
    touch(c, { received: accepted, unmatched });
    sendJson(res, 200, { ok: true });
  }

  function listChannels(req, res) {
    requireAdmin(req);
    const stats = {};
    for (const e of messages.values()) {
      const s = (stats[e.data.channel] ??= { messages: 0, flagged: 0, lastMessageAt: null });
      s.messages++;
      if (e.data.flags.length) s.flagged++;
      if (!s.lastMessageAt || e.data.sentAt > s.lastMessageAt) s.lastMessageAt = e.data.sentAt;
    }
    const connectors = Object.values(store.state.connectors);
    const activeDevices = Object.values(store.state.devices).filter((d) => !d.revokedAt).length;
    const channels = Object.entries(CHANNELS).map(([id, ch]) => {
      const feeding = ch.source === 'device' ? [] : connectors.filter((c) => CONNECTOR_TYPES[c.type].includes(id));
      const connected = ch.source === 'device' ? activeDevices > 0 : feeding.some((c) => Object.keys(c.accounts).length);
      return {
        id, ...ch, ...(stats[id] ?? { messages: 0, flagged: 0, lastMessageAt: null }),
        // One partner connector can carry several channels, so a channel counts
        // as capturing only once its own messages arrive.
        status: !connected ? (feeding.length ? 'needs_accounts' : 'not_connected')
          : ch.source === 'connector' && !stats[id] ? 'waiting' : 'capturing',
        connectors: feeding.map((c) => c.name),
        accounts: feeding.reduce((n, c) => n + Object.keys(c.accounts).length, 0) + (ch.source === 'device' ? activeDevices : 0),
      };
    });
    sendJson(res, 200, { channels, connectors: connectors.map(connectorView), offChannelApps: Object.values(OFF_CHANNEL_APPS) });
  }

  // ---------- static dashboard ----------

  const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
  function serveStatic(res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new HttpError(404, 'not found');
    }
    res.writeHead(200, {
      'content-type': STATIC_TYPES[path.extname(file)] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:",
    });
    fs.createReadStream(file).pipe(res);
  }

  // ---------- router ----------

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const m = req.method;
    try {
      let match;
      if (m === 'GET' && p === '/healthz') return sendJson(res, 200, { ok: true });
      if (m === 'POST' && p === '/api/v1/devices/enroll') return await enroll(req, res);
      if (m === 'POST' && p === '/api/v1/messages') return await uploadMessages(req, res);
      if (m === 'POST' && p === '/api/v1/devices/heartbeat') return await heartbeat(req, res);
      if (m === 'POST' && p === '/api/v1/enrollment-codes') return await createEnrollmentCode(req, res);
      if (m === 'GET' && p === '/api/v1/summary') return summary(req, res);
      if (m === 'GET' && p === '/api/v1/messages') return listMessages(req, res, url);
      if (m === 'GET' && (match = p.match(/^\/api\/v1\/messages\/([0-9a-f-]{36})$/))) return getMessage(req, res, match[1]);
      if (m === 'POST' && (match = p.match(/^\/api\/v1\/messages\/([0-9a-f-]{36})\/reviews$/))) return await reviewMessage(req, res, match[1]);
      if (m === 'GET' && p === '/api/v1/devices') return listDevices(req, res);
      if (m === 'POST' && (match = p.match(/^\/api\/v1\/devices\/([0-9a-f-]{36})\/revoke$/))) return revokeDevice(req, res, match[1]);
      if (m === 'GET' && p === '/api/v1/ledger/verify') return verify(req, res);
      if (m === 'GET' && p === '/api/v1/export') return exportRecords(req, res, url);
      if (m === 'GET' && p === '/api/v1/channels') return listChannels(req, res);
      if (m === 'POST' && p === '/api/v1/connectors') return await createConnector(req, res);
      if (m === 'POST' && (match = p.match(/^\/api\/v1\/connectors\/([0-9a-f-]{36})\/accounts$/))) return await mapAccount(req, res, match[1]);
      if (m === 'POST' && p === '/api/v1/ingest/email') return await ingestEmail(req, res);
      if (m === 'POST' && p === '/api/v1/ingest/messages') return await ingestMessages(req, res);
      if ((match = p.match(/^\/api\/v1\/webhooks\/(meta|whatsapp)\/([0-9a-f-]{36})$/))) {
        if (m === 'GET') return verifyWebhook(req, res, url, match[1], match[2]);
        if (m === 'POST') return await (match[1] === 'meta' ? metaWebhook : whatsappWebhook)(req, res, match[2]);
      }
      if (p.startsWith('/api/')) throw new HttpError(404, 'no such endpoint');
      if (m === 'GET') return serveStatic(res, p);
      throw new HttpError(405, 'method not allowed');
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      return sendJson(res, 500, { error: 'internal error' });
    }
  }

  const server = http.createServer(handle);
  return { server, ledger, close: () => new Promise((r) => server.close(() => { ledger.close(); r(); })) };
}
