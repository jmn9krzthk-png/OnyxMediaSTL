// Demo data: enrolls three simulated advisor phones and uploads a realistic mix
// of texts and calls through the same device API the Android app uses.
//
//   TEXTGUARD_ADMIN_TOKEN=... node scripts/simulate.js [http://localhost:8787]

const base = process.argv[2] ?? process.env.TEXTGUARD_URL ?? 'http://localhost:8787';
const adminToken = process.env.TEXTGUARD_ADMIN_TOKEN;
if (!adminToken) {
  console.error('Set TEXTGUARD_ADMIN_TOKEN to the server\'s supervisor token.');
  process.exit(1);
}

async function call(path, { token, body, method = 'POST' } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path}: ${json.error}`);
  return json;
}

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const ADVISORS = [
  {
    id: 'FA-20418', name: 'Dana Whitfield', model: 'Google Pixel 8', sms: 'com.onyxmedia.textguard.demo', rcsOff: true,
    convo: [
      ['+13145550142', 'inbound', 'Hi Dana, did the RMD paperwork go through for Mom\'s IRA?', 2900],
      ['+13145550142', 'outbound', 'Yes, processed this morning. You should see it in 3-5 business days.', 2890],
      ['+13145550142', 'inbound', 'Great, thank you!', 2885],
      ['+13145550199', 'inbound', 'Can we move our review to Thursday at 2?', 1500],
      ['+13145550199', 'outbound', 'Thursday at 2 works. See you then.', 1490],
      ['+13145550177', 'outbound', 'Honestly this fund is a sure thing, you can\'t lose with it over 10 years.', 600],
      ['+13145550177', 'inbound', 'Ok if you say so. Should I just buy 500 shares now?', 590],
      ['+13145550177', 'outbound', 'Let\'s talk on a call before placing anything. I\'ll call you at 4.', 585],
    ],
    calls: [['+13145550177', 'outbound', 420, 560], ['+13145550142', 'missed', 0, 200]],
  },
  {
    id: 'FA-31877', name: 'Marcus Reyes', model: 'Samsung Galaxy S24', sms: 'com.samsung.android.messaging', rcsOff: false, apps: ['org.telegram.messenger', 'com.whatsapp'],
    convo: [
      ['+16365550110', 'inbound', 'Marcus I\'m really upset, I lost so much money on that annuity and nobody told me about the surrender fees.', 1300],
      ['+16365550110', 'outbound', 'I\'m sorry to hear that. Let me pull the contract and call you today.', 1280],
      ['+16365550110', 'inbound', 'I\'m thinking about talking to a lawyer honestly.', 1270],
      ['+16365550123', 'outbound', 'Easier to chat on WhatsApp, add me there', 800],
      ['+16365550123', 'inbound', 'Sure what\'s the number', 795],
      ['+16365550131', 'inbound', 'Please wire $25,000 from my brokerage to my Chase account today. Routing number is 0710 and acct number follows.', 120],
    ],
    calls: [['+16365550110', 'inbound', 900, 1200]],
  },
  {
    id: 'FA-40902', name: 'Priya Natarajan', model: 'Google Pixel 7a', sms: 'com.google.android.apps.messaging', rcsOff: true,
    convo: [
      ['+16185550188', 'inbound', 'Thanks for the Cardinals tickets to last night\'s game!', 3000],
      ['+16185550188', 'outbound', 'Glad you enjoyed it! Talk soon about the 529 plan.', 2990],
      ['+16185550166', 'inbound', 'Here\'s my SSN for the form: 512-44-9031', 400],
      ['+16185550166', 'outbound', 'Thanks, but please don\'t send that by text. I\'ll call you to collect it securely. Delete this message on your side.', 395],
      ['+16185550145', 'inbound', 'Quarterly statement looks good, no questions.', 50],
    ],
    calls: [],
  },
];

let total = 0;
for (const a of ADVISORS) {
  const { enrollmentCode } = await call('/api/v1/enrollment-codes', { token: adminToken, body: { advisorId: a.id, advisorName: a.name } });
  const { deviceToken } = await call('/api/v1/devices/enroll', {
    body: { enrollmentCode, disclosureAccepted: true, deviceModel: a.model, osVersion: '14', appVersion: '0.1.0-sim' },
  });
  const messages = [
    ...a.convo.map(([number, direction, body, ago], i) => ({ clientMsgId: `sms:${i + 1}`, channel: 'sms', direction, counterparty: number, body, sentAt: minutesAgo(ago) })),
    ...a.calls.map(([number, direction, durationSec, ago], i) => ({ clientMsgId: `call:${i + 1}`, channel: 'call', direction, counterparty: number, durationSec, body: '', sentAt: minutesAgo(ago) })),
  ];
  const r = await call('/api/v1/messages', { token: deviceToken, body: { messages } });
  total += r.accepted.length;
  await call('/api/v1/devices/heartbeat', {
    token: deviceToken,
    body: {
      permissions: { READ_SMS: true, RECEIVE_SMS: true, RECEIVE_MMS: true, READ_CALL_LOG: true },
      defaultSmsPackage: a.sms, rcsDisabledByPolicy: a.rcsOff, pendingUploads: 0, appVersion: '0.1.0-sim', batteryOptimizationExempt: true,
      installedPackages: a.apps ?? [],
    },
  });
  console.log(`${a.name}: enrolled, ${r.accepted.length} records uploaded`);
}
// ---------- other channels, through the real connector endpoints ----------
import crypto from 'node:crypto';
const ADVISOR_EMAIL = { 'FA-20418': 'dana.whitfield@firm.example', 'FA-31877': 'marcus.reyes@firm.example', 'FA-40902': 'priya.natarajan@firm.example' };
const byId = Object.fromEntries(ADVISORS.map((a) => [a.id, a]));
const mapAll = async (connectorId, pairs) => { for (const [account, id] of pairs) await call(`/api/v1/connectors/${connectorId}/accounts`, { token: adminToken, body: { account, advisorId: id, advisorName: byId[id].name } }); };

// Email (as a journaling rule would deliver it)
const mail = await call('/api/v1/connectors', { token: adminToken, body: { type: 'email', name: 'Microsoft 365 journaling' } });
await mapAll(mail.connector.connectorId, Object.entries(ADVISOR_EMAIL).map(([id, addr]) => [addr, id]));
const EMAILS = [
  ['FA-20418', 'in', 'tom.haverford@gmail.com', 'Tom Haverford', 'Roth conversion question', "Hi Dana,\n\nMy brother-in-law says a Roth conversion this year is a no-risk move. Should we do the whole IRA before December?\n\nTom", 1700, 'r1'],
  ['FA-20418', 'out', 'tom.haverford@gmail.com', 'Tom Haverford', 'Re: Roth conversion question', "Tom,\n\nNothing is risk-free here: converting adds to this year's taxable income. Let's run the numbers with your CPA on Thursday.\n\nDana", 1650, 'r1'],
  ['FA-31877', 'in', 'linda.cho@outlook.com', 'Linda Cho', 'Formal complaint about my annuity', 'Marcus, I want to file a formal complaint. I was never told about a 7-year surrender charge and I feel misled.', 260, 'r2'],
  ['FA-40902', 'in', 'ops@titleco.example', 'Gateway Title', 'Updated wire instructions for closing', 'Our bank details have changed. Please wire the closing funds to the new routing number below by 3pm today.', 90, 'r3'],
  ['FA-40902', 'out', 'jmorales@yahoo.com', 'J. Morales', '529 plan summary', 'Attached is the 529 comparison we discussed. Happy to walk through it next week.', 700, 'r4'],
];
let i = 0;
for (const [id, dir, addr, name, subject, body, mins, thread] of EMAILS) {
  const adv = ADVISOR_EMAIL[id];
  const from = dir === 'in' ? `"${name}" <${addr}>` : `"${byId[id].name}" <${adv}>`;
  const to = dir === 'in' ? `"${byId[id].name}" <${adv}>` : `"${name}" <${addr}>`;
  const eml = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`, `Message-ID: <sim-${i++}@mail.example>`, `References: <thread-${thread}@mail.example>`,
    `Date: ${new Date(Date.now() - mins * 60000).toUTCString()}`, 'Content-Type: text/plain; charset=utf-8', '', body.replace(/\\n/g, '\r\n')].join('\r\n');
  const r = await fetch(`${base}/api/v1/ingest/email`, { method: 'POST', headers: { authorization: `Bearer ${mail.connectorKey}`, 'content-type': 'message/rfc822' }, body: eml });
  total += (await r.json()).accepted;
}

// Facebook Messenger and Instagram (as Meta's webhook would deliver them)
const SECRET = 'demo-meta-app-secret';
const meta = await call('/api/v1/connectors', { token: adminToken, body: { type: 'meta', name: 'Meta business Pages', appSecret: SECRET } });
await mapAll(meta.connector.connectorId, [['104883920011', 'FA-20418'], ['178820019554', 'FA-31877']]);
const signedPost = (path, secret, payload) => {
  const raw = JSON.stringify(payload);
  return fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}` }, body: raw });
};
const ev = (page, user, text, mins, echo, mid) => ({ sender: { id: echo ? page : user }, recipient: { id: echo ? user : page }, timestamp: Date.now() - mins * 60000, message: { mid, text, ...(echo ? { is_echo: true } : {}) } });
await signedPost(`/api/v1/webhooks/meta/${meta.connector.connectorId}`, SECRET, { object: 'page', entry: [
  { id: '104883920011', messaging: [
    ev('104883920011', '6633019', 'Hi! Saw your seminar post. Do you help with rolling over a 401k?', 980, false, 'fb1'),
    ev('104883920011', '6633019', 'I do. Happy to set up a call. What does your schedule look like this week?', 960, true, 'fb2'),
  ] },
  { id: '178820019554', messaging: [
    ev('178820019554', '7120044', 'Can we just do this over WhatsApp? Easier for me', 330, false, 'fb3'),
  ] },
] });
await signedPost(`/api/v1/webhooks/meta/${meta.connector.connectorId}`, SECRET, { object: 'instagram', entry: [
  { id: '104883920011', messaging: [ev('104883920011', '9980021', 'Love the market update reel. Is now a good time to buy more of that fund?', 140, false, 'ig1')] },
] });
total += 4;

// WhatsApp Business (firm-owned number)
const WA = 'demo-whatsapp-app-secret';
const wa = await call('/api/v1/connectors', { token: adminToken, body: { type: 'whatsapp', name: 'WhatsApp Business Platform', appSecret: WA } });
await mapAll(wa.connector.connectorId, [['301566789012', 'FA-40902']]);
const ts = (mins) => String(Math.floor((Date.now() - mins * 60000) / 1000));
await signedPost(`/api/v1/webhooks/whatsapp/${wa.connector.connectorId}`, WA, { object: 'whatsapp_business_account', entry: [{ id: 'WABA1', changes: [
  { field: 'messages', value: { metadata: { phone_number_id: '301566789012' }, contacts: [{ wa_id: '16185550133', profile: { name: 'Anika Shah' } }],
    messages: [{ from: '16185550133', id: 'wamid.A1', timestamp: ts(520), type: 'text', text: { body: "I'm in Mumbai until March. Can you sell all of my bank stock and transfer $40,000 to my account here?" } }] } },
  { field: 'smb_message_echoes', value: { metadata: { phone_number_id: '301566789012' },
    message_echoes: [{ from: '16185559000', to: '16185550133', id: 'wamid.A2', timestamp: ts(505), type: 'text', text: { body: "I'll need to verify that by phone first. I'll call you at 9pm your time." } }] } },
] }] });
total += 2;

// LinkedIn and Microsoft Teams (through a partner connector)
const partner = await call('/api/v1/connectors', { token: adminToken, body: { type: 'connector', name: 'LinkedIn + Teams compliance feed' } });
await mapAll(partner.connector.connectorId, [['urn:li:person:dwhit', 'FA-20418'], ['urn:li:person:mreyes', 'FA-31877'], ['teams:priya.natarajan', 'FA-40902']]);
const pm = await call('/api/v1/ingest/messages', { token: partner.connectorKey, body: { messages: [
  { clientMsgId: 'li-1', channel: 'linkedin', account: 'urn:li:person:dwhit', direction: 'inbound', counterparty: 'urn:li:person:k9x', counterpartyName: 'Kevin Brandt', body: 'Congrats on 10 years! Are you taking new clients? I just sold my business.', sentAt: minutesAgo(2200) },
  { clientMsgId: 'li-2', channel: 'linkedin', account: 'urn:li:person:mreyes', direction: 'outbound', counterparty: 'urn:li:person:p2r', counterpartyName: 'Rachel Owens', body: 'Great connecting at the chamber lunch. Text my personal cell anytime: 636-555-0188', sentAt: minutesAgo(1000) },
  { clientMsgId: 'tm-1', channel: 'teams', account: 'teams:priya.natarajan', direction: 'internal', counterparty: 'teams:branch.ops', counterpartyName: 'Branch Operations', body: 'Client Anika Shah asked by WhatsApp to transfer $40k abroad. Holding until I verify by phone.', sentAt: minutesAgo(500) },
] } });
total += pm.accepted.length;

console.log(`Done: ${total} records. Open ${base} and sign in with the supervisor token.`);
