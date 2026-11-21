import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { scan } from '../src/lexicon.js';
import { Ledger } from '../src/ledger.js';

const ADMIN = 'test-admin-token-0123456789';
let app, base, dataDir;

async function req(p, { token, body, method } = {}) {
  const res = await fetch(base + p, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

async function enrollDevice(advisorId = 'FA-1', advisorName = 'Test Advisor') {
  const code = await req('/api/v1/enrollment-codes', { token: ADMIN, body: { advisorId, advisorName } });
  const r = await req('/api/v1/devices/enroll', { body: { enrollmentCode: code.body.enrollmentCode, disclosureAccepted: true, deviceModel: 'Pixel' } });
  assert.equal(r.status, 201);
  return r.body;
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'textguard-test-'));
  app = createApp({ dataDir, adminToken: ADMIN });
  await new Promise((r) => app.server.listen(0, r));
  base = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('lexicon flags risky phrases and ignores routine ones', () => {
  assert.deepEqual(scan('See you Thursday at 2').map((f) => f.rule), []);
  assert.ok(scan('This is a guaranteed return').some((f) => f.rule === 'guarantee'));
  assert.ok(scan('text me on WhatsApp').some((f) => f.category === 'Off-channel communication'));
  assert.ok(scan('my ssn is 123-45-6789').some((f) => f.rule === 'ssn'));
  assert.ok(scan('please wire $5000 today').some((f) => f.rule === 'wire'));
});

test('supervisor endpoints require the token', async () => {
  assert.equal((await req('/api/v1/messages')).status, 401);
  assert.equal((await req('/api/v1/messages', { token: 'wrong' })).status, 401);
  assert.equal((await req('/api/v1/messages', { token: ADMIN })).status, 200);
});

test('enrollment needs a valid single-use code and accepted disclosure', async () => {
  const code = (await req('/api/v1/enrollment-codes', { token: ADMIN, body: { advisorId: 'FA-9', advisorName: 'Nine' } })).body.enrollmentCode;
  const noDisclosure = await req('/api/v1/devices/enroll', { body: { enrollmentCode: code } });
  assert.equal(noDisclosure.status, 400);
  const ok = await req('/api/v1/devices/enroll', { body: { enrollmentCode: code, disclosureAccepted: true } });
  assert.equal(ok.status, 201);
  const reuse = await req('/api/v1/devices/enroll', { body: { enrollmentCode: code, disclosureAccepted: true } });
  assert.equal(reuse.status, 400);
});

test('device upload is archived, flagged, and idempotent', async () => {
  const { deviceToken } = await enrollDevice('FA-2', 'Two');
  const msg = { clientMsgId: 'sms:1', channel: 'sms', direction: 'outbound', counterparty: '+13145550100', body: 'This fund is risk-free', sentAt: new Date().toISOString() };
  const first = await req('/api/v1/messages', { token: deviceToken, body: { messages: [msg, { ...msg, clientMsgId: 'bad', channel: 'fax' }] } });
  assert.deepEqual(first.body.accepted, ['sms:1']);
  assert.equal(first.body.rejected.length, 1);
  const again = await req('/api/v1/messages', { token: deviceToken, body: { messages: [msg] } });
  assert.deepEqual(again.body.duplicates, ['sms:1']);

  const list = await req('/api/v1/messages?advisor=FA-2&status=pending', { token: ADMIN });
  assert.equal(list.body.total, 1);
  const m = list.body.messages[0];
  assert.equal(m.flags[0].category, 'Promissory language');

  const review = await req(`/api/v1/messages/${m.messageId}/reviews`, { token: ADMIN, body: { decision: 'escalated', reviewer: 'Sup', note: 'Promissory' } });
  assert.equal(review.status, 201);
  const after = await req('/api/v1/messages?advisor=FA-2&status=pending', { token: ADMIN });
  assert.equal(after.body.total, 0);
});

test('revoked devices cannot upload', async () => {
  const { deviceToken, deviceId } = await enrollDevice('FA-3', 'Three');
  await req(`/api/v1/devices/${deviceId}/revoke`, { token: ADMIN, method: 'POST' });
  const r = await req('/api/v1/messages', { token: deviceToken, body: { messages: [] } });
  assert.equal(r.status, 403);
});

test('ledger verifies, and detects an edited record after restart', async () => {
  const ok = await req('/api/v1/ledger/verify', { token: ADMIN });
  assert.equal(ok.body.ok, true);
  assert.ok(ok.body.count >= 2);

  const file = path.join(dataDir, 'ledger.jsonl');
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, original.replace('risk-free', 'low-risk'));
  const tampered = new Ledger(fs.mkdtempSync(path.join(os.tmpdir(), 'tg-')));
  tampered.file = file;
  const result = tampered.verify();
  assert.equal(result.ok, false);
  assert.match(result.reason, /edited/);
  fs.writeFileSync(file, original);
});

test('CSV export neutralizes spreadsheet formulas', async () => {
  const { deviceToken } = await enrollDevice('FA-4', 'Four');
  await req('/api/v1/messages', { token: deviceToken, body: { messages: [{ clientMsgId: 'x', channel: 'sms', direction: 'inbound', counterparty: '+1', body: '=HYPERLINK("http://evil")', sentAt: new Date().toISOString() }] } });
  const r = await req('/api/v1/export?format=csv&advisor=FA-4', { token: ADMIN });
  assert.match(r.body, /"'=HYPERLINK/);
});

test('static files cannot escape the public folder', async () => {
  const r = await req('/..%2f..%2fpackage.json');
  assert.equal(r.status, 404);
});
