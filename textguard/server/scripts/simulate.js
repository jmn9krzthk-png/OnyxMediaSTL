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
    id: 'FA-31877', name: 'Marcus Reyes', model: 'Samsung Galaxy S24', sms: 'com.samsung.android.messaging', rcsOff: false,
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
    },
  });
  console.log(`${a.name}: enrolled, ${r.accepted.length} records uploaded`);
}
console.log(`Done: ${total} records. Open ${base} and sign in with the supervisor token.`);
