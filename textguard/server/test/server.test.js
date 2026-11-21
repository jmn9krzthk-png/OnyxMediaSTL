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

// ---------- multi-channel connectors ----------
import crypto from 'node:crypto';

async function connector(type, extra = {}) {
  const r = await req('/api/v1/connectors', { token: ADMIN, body: { type, name: `${type} test`, ...extra } });
  assert.equal(r.status, 201);
  return r.body;
}
const mapAcct = (id, account, advisorId, advisorName = advisorId) =>
  req(`/api/v1/connectors/${id}/accounts`, { token: ADMIN, body: { account, advisorId, advisorName } });

async function postSigned(path, secret, payload) {
  const raw = JSON.stringify(payload);
  const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: raw });
  return res.status;
}

test('journaled email is parsed, attributed to the advisor and flagged', async () => {
  const c = await connector('email');
  await mapAcct(c.connector.connectorId, 'Dana.Whitfield@firm.example', 'FA-E1', 'Dana');
  const eml = [
    'From: "Pat Client" <pat@client.example>',
    'To: Dana Whitfield <dana.whitfield@firm.example>',
    'Subject: =?utf-8?B?UXVlc3Rpb24gYWJvdXQgbXkgSVJB?=',
    'Message-ID: <abc123@client.example>',
    'Date: Fri, 20 Nov 2026 15:04:00 -0600',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="b1"',
    '',
    '--b1',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Can you wire $10,000 to my new account? Thanks =E2=80=94 Pat',
    '--b1',
    'Content-Type: application/pdf; name="form.pdf"',
    'Content-Disposition: attachment; filename="form.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from('%PDF-1.4 test').toString('base64'),
    '--b1--',
    '',
  ].join('\r\n');
  const send = () => fetch(`${base}/api/v1/ingest/email`, { method: 'POST', headers: { authorization: `Bearer ${c.connectorKey}`, 'content-type': 'message/rfc822' }, body: eml }).then((r) => r.json());
  assert.equal((await send()).accepted, 1);
  assert.equal((await send()).duplicates, 1);
  const { body } = await req('/api/v1/messages?channel=email&advisor=FA-E1', { token: ADMIN });
  const m = body.messages[0];
  assert.equal(m.subject, 'Question about my IRA');
  assert.equal(m.direction, 'inbound');
  assert.deepEqual(m.counterparties, ['pat@client.example']);
  assert.match(m.body, /Thanks — Pat/);
  assert.equal(m.attachments[0].name, 'form.pdf');
  assert.ok(m.flags.some((f) => f.rule === 'wire'));
  assert.equal(m.sentAt, '2026-11-20T21:04:00.000Z');
});

test('Meta webhook archives Messenger and Instagram messages and rejects forged calls', async () => {
  const c = await connector('meta', { appSecret: 'meta-secret' });
  const id = c.connector.connectorId;
  await mapAcct(id, 'PAGE1', 'FA-M1');
  const verify = await fetch(`${base}/api/v1/webhooks/meta/${id}?hub.mode=subscribe&hub.verify_token=${c.verifyToken}&hub.challenge=42`);
  assert.equal(await verify.text(), '42');
  const payload = { object: 'page', entry: [{ id: 'PAGE1', messaging: [
    { sender: { id: 'PSID9' }, recipient: { id: 'PAGE1' }, timestamp: 1763700000000, message: { mid: 'm1', text: 'Is this guaranteed?' } },
    { sender: { id: 'PAGE1' }, recipient: { id: 'PSID9' }, timestamp: 1763700060000, message: { mid: 'm2', text: 'No investment is guaranteed.', is_echo: true } },
    { sender: { id: 'PSID9' }, recipient: { id: 'PAGE1' }, timestamp: 1763700070000, read: { watermark: 1 } },
  ] }] };
  assert.equal(await postSigned(`/api/v1/webhooks/meta/${id}`, 'wrong-secret', payload), 401);
  assert.equal(await postSigned(`/api/v1/webhooks/meta/${id}`, 'meta-secret', payload), 200);
  const ig = { object: 'instagram', entry: [{ id: 'PAGE1', messaging: [{ sender: { id: 'IG7' }, recipient: { id: 'PAGE1' }, timestamp: 1763700100000, message: { mid: 'ig1', text: 'hi' } }] }] };
  assert.equal(await postSigned(`/api/v1/webhooks/meta/${id}`, 'meta-secret', ig), 200);
  const { body } = await req('/api/v1/messages?advisor=FA-M1&order=asc', { token: ADMIN });
  assert.deepEqual(body.messages.map((m) => [m.channel, m.direction]), [['facebook', 'inbound'], ['facebook', 'outbound'], ['instagram', 'inbound']]);
  assert.ok(body.messages[0].flags.length);
});

test('WhatsApp Business webhook archives received and sent messages', async () => {
  const c = await connector('whatsapp', { appSecret: 'wa-secret' });
  const id = c.connector.connectorId;
  await mapAcct(id, '1098765', 'FA-W1');
  const payload = { object: 'whatsapp_business_account', entry: [{ id: 'WABA', changes: [
    { field: 'messages', value: { metadata: { phone_number_id: '1098765' }, contacts: [{ wa_id: '13145550100', profile: { name: 'Lee' } }],
      messages: [{ from: '13145550100', id: 'wamid.1', timestamp: '1763700000', type: 'text', text: { body: 'Can you text my personal cell?' } }] } },
    { field: 'smb_message_echoes', value: { metadata: { phone_number_id: '1098765' },
      message_echoes: [{ from: '13145559999', to: '13145550100', id: 'wamid.2', timestamp: '1763700100', type: 'text', text: { body: 'Please keep it here.' } }] } },
  ] }] };
  assert.equal(await postSigned(`/api/v1/webhooks/whatsapp/${id}`, 'wa-secret', payload), 200);
  const { body } = await req('/api/v1/messages?channel=whatsapp&order=asc', { token: ADMIN });
  assert.equal(body.total, 2);
  assert.equal(body.messages[0].counterpartyName, 'Lee');
  assert.equal(body.messages[1].direction, 'outbound');
});

test('partner connector accepts mapped accounts and its channels only', async () => {
  const c = await connector('connector');
  await mapAcct(c.connector.connectorId, 'urn:li:person:abc', 'FA-L1');
  const msg = { clientMsgId: 'li-1', channel: 'linkedin', account: 'urn:li:person:abc', direction: 'inbound', counterparty: 'urn:li:person:xyz', counterpartyName: 'Sam', body: 'Saw your post', sentAt: new Date().toISOString() };
  const r = await req('/api/v1/ingest/messages', { token: c.connectorKey, body: { messages: [msg, { ...msg, clientMsgId: 'li-2', account: 'nobody' }, { ...msg, clientMsgId: 'li-3', channel: 'sms' }] } });
  assert.deepEqual(r.body.accepted, ['li-1']);
  assert.equal(r.body.rejected.length, 2);
  const ch = await req('/api/v1/channels', { token: ADMIN });
  assert.equal(ch.body.channels.find((x) => x.id === 'linkedin').status, 'capturing');
  assert.equal(ch.body.channels.find((x) => x.id === 'slack').status, 'waiting');
  assert.equal(ch.body.channels.find((x) => x.id === 'zoom').status, 'waiting');
});

test('heartbeat reports off-channel apps as a device issue', async () => {
  const { deviceToken } = await enrollDevice('FA-H1', 'Heartbeat');
  await req('/api/v1/devices/heartbeat', { token: deviceToken, body: { permissions: { READ_SMS: true }, installedPackages: ['org.thoughtcrime.securesms', 'com.example.calc'] } });
  const { body } = await req('/api/v1/devices', { token: ADMIN });
  const d = body.devices.find((x) => x.advisorId === 'FA-H1');
  assert.ok(d.issues.some((i) => i.includes('Signal')));
});
