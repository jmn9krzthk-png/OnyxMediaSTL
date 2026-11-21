# TextGuard (prototype)

Compliance archiving and supervision for every channel clients use to reach financial advisors: text, phone, email, Facebook Messenger, Instagram, WhatsApp, LinkedIn, Teams, Zoom, Slack, X and website chat.

Broker-dealers must keep business texts (SEC Rule 17a-4, FINRA Rule 4511) and review them (FINRA Rule 3110). TextGuard does three things:

1. **Captures.** An Android app copies every SMS, MMS and call-log entry on an enrolled phone. Server-side connectors bring in email, social and collaboration messages through each platform's own business or compliance route (see "Channels").
2. **Preserves.** The server appends each record to a hash-chained, append-only log. Edits, deletions and reordering are detectable, and there is no edit or delete function.
3. **Supervises.** A web console flags risky language (guarantees, off-channel requests, complaints, wire instructions, gifts, SSNs) into a review queue. Reviewers record decisions, and the console shows which phones have stopped capturing.

This is a **demo-grade prototype**. Read "What it would take to sell this" before showing it to a firm as a product.

```
textguard/
  android/   Kotlin app (minSdk 26, targetSdk 34), WorkManager only, no other libraries
  server/    Node 20+ API, archive and supervision console, no dependencies
```

## Run the demo (5 minutes)

```bash
cd textguard/server
```

```bash
TEXTGUARD_ADMIN_TOKEN=demo-supervisor-token-123 npm start
```

In a second terminal, load three simulated advisors with realistic texts:

```bash
cd textguard/server && TEXTGUARD_ADMIN_TOKEN=demo-supervisor-token-123 npm run simulate
```

Open http://localhost:8787 and sign in with `demo-supervisor-token-123`. Delete `server/data/` to start over.

Run the tests:

```bash
cd textguard/server && npm test
```

## Channels

Each channel is captured only through a route the platform supports for business use.

| Channel | How it's captured | Endpoint |
|---|---|---|
| SMS, MMS, calls | Android app on the enrolled phone | `POST /api/v1/messages` |
| Email | Journaling rule in Microsoft 365, Google Workspace or any mail server sends a copy of every message as raw .eml | `POST /api/v1/ingest/email` |
| Facebook Messenger, Instagram DMs | Meta webhook for the advisor's **business** Page or Instagram account, signature-checked | `/api/v1/webhooks/meta/:id` |
| WhatsApp | WhatsApp Business Platform webhook for a **firm-owned** number: received messages, plus sent ones from the WhatsApp Business app via message echoes | `/api/v1/webhooks/whatsapp/:id` |
| LinkedIn, Teams, Zoom, Slack, X, website chat | A connector job pulls from the platform's compliance API or partner feed and posts normalized JSON | `POST /api/v1/ingest/messages` |

**Setup.** Create a connector (`POST /api/v1/connectors` with `type` set to `email`, `meta`, `whatsapp` or `connector`). Then map each platform account to an advisor with `POST /api/v1/connectors/:id/accounts`. The account is an email address, Page id, WhatsApp phone-number id, LinkedIn member id and so on. Messages for unmapped accounts are counted but not archived. The **Channels** page in the console shows each channel's status, volume and connected sources.

**Not capturable.** Personal Signal, Telegram, WeChat, iMessage, personal WhatsApp and personal Messenger have no business capture route. The only legitimate approach is the one firms already use: prohibit them, flag messages that try to move a client onto them, and have the Android app report when one is installed on an enrolled phone. The app checks for specific apps and reads nothing inside them. Reading other apps' notifications, or shipping modified copies of consumer apps, is fragile and gets incomplete data. It's also how TeleMessage ended up with the breach that leaked archived messages in 2025.

**Partner programs still needed.** LinkedIn, Microsoft Teams export and Slack Discovery each require approval or a partnership before their compliance APIs can be used. The connector endpoint is ready, but those pullers aren't written yet.

## Run the Android app

1. Open `textguard/android` in Android Studio and run it on an emulator (API 26+).
2. In the console, go to **Devices** and create an enrollment code.
3. In the app, read the disclosure, tick the box, enter the code and grant permissions. The default server URL `http://10.0.2.2:8787` reaches your computer from the emulator.
4. Send the emulator a text: Android Studio → Extended controls → Phone → "Send message". It appears in the console within seconds.

On a physical phone, put the server behind HTTPS and set its URL on the enrollment screen. Cleartext HTTP is allowed only for the emulator address.

**How capture works.** Android keeps all SMS/MMS in a shared system database regardless of the texting app. The app reads new rows from that database and from the call log. It is triggered by WorkManager whenever those databases change, by incoming-SMS broadcasts, and by a 15-minute sweep. Records sit in a local outbox until the server confirms they're archived. Only messages created after enrollment are collected, and call audio is never recorded.

**Transparency is a design requirement, not an option.** The advisor must accept a written disclosure before enrollment. A notification stays visible while recording is on, the app icon is never hidden, and revoking a device stops capture. Keep it that way. Covert phone monitoring is illegal in many places and is not what firms are buying.

## Verified so far

- Server: 13 automated tests pass. They cover auth, enrollment, flagging, de-duplication, revocation, tamper detection, CSV formula injection, path traversal, email parsing, Meta and WhatsApp webhooks (including forged signatures), partner feeds and off-channel app reporting. Demo data loads, and the console works in desktop and phone layouts.
- Android: all Kotlin sources compile against the real Android 14 framework classes. WorkManager was checked against signature stubs, because Google's Maven host wasn't reachable from the build machine. **The APK has not been built or run on a device yet.** First step in Android Studio: build, then run the emulator walkthrough above.

## Known gaps

| Gap | Why it matters | Fix |
|---|---|---|
| **iPhones** | iOS lets no app read texts. Most advisors carry iPhones. | Carrier-level capture (partnering with AT&T, Verizon and T-Mobile archiving programs) or a separate business-number app. This is how incumbents cover iOS. |
| **RCS chat** | Google Messages and Samsung Messages send RCS "chat" messages outside the shared SMS database, so they aren't captured. | Turn RCS off by MDM policy on enrolled phones. The console flags phones whose texting app supports RCS. Longer term: become the default SMS app, or capture at the carrier. |
| **Play Store** | Google allows SMS permissions only for default SMS apps. | Distribute as a private app through the firm's MDM (managed Google Play), which can also pre-grant permissions. |
| **Attachments** | Only each attachment's type, size and SHA-256 fingerprint are archived, not the file. | Upload files to object storage and keep the hash in the record. |
| **Messages deleted within seconds** | A text deleted before capture runs is missed. | Become the default SMS app (sees every message first), or use carrier capture. |

## What it would take to sell this to a broker-dealer

The prototype shows the workflow. A firm like Edward Jones (about 20,000 advisors, with an approved vendor already in place) would also require:

- **17a-4-compliant storage.** Records go to WORM storage, e.g. S3 Object Lock in compliance mode, with 3–6 year retention, legal holds and a designated third party. The ledger already produces the right records. `Ledger.append` is the one place to add the second write.
- **Security.** SOC 2 Type II, an annual pen test, encryption at rest (SQLCipher on device, KMS on the server), SSO (SAML/OIDC) and role-based access for supervisors. Records should be encrypted per firm. Smarsh's TeleMessage was breached in 2025 and archived messages leaked, so buyers will ask about this first.
- **Integrations.** Export to the archives firms already use (Smarsh, Global Relay, Proofpoint), MDM deployment (Intune, Workspace ONE), and a production lexicon tuned against false positives.
- **Scale.** Postgres or a similar database instead of in-memory indexes, multi-tenancy, monitoring, and a support SLA.

Smaller independent broker-dealers and RIAs buy faster and with less procurement than the largest firms, and are a realistic first market.

## API summary

Device (bearer device token): `POST /api/v1/devices/enroll`, `POST /api/v1/messages` (batches of up to 500, idempotent on `clientMsgId`), `POST /api/v1/devices/heartbeat`.

Connectors: `POST /api/v1/ingest/email` (bearer connector key, raw .eml), `POST /api/v1/ingest/messages` (bearer connector key, JSON batch), `GET|POST /api/v1/webhooks/meta/:id` and `/api/v1/webhooks/whatsapp/:id` (Meta verify token and `X-Hub-Signature-256`).

Supervisor (bearer admin token): `GET /api/v1/summary`, `GET /api/v1/channels`, `POST /api/v1/connectors`, `POST /api/v1/connectors/:id/accounts`, `GET /api/v1/messages?q=&advisor=&channel=&thread=&counterparty=&flagged=&status=pending|reviewed&from=&to=`, `GET /api/v1/messages/:id`, `POST /api/v1/messages/:id/reviews`, `POST /api/v1/enrollment-codes`, `GET /api/v1/devices`, `POST /api/v1/devices/:id/revoke`, `GET /api/v1/ledger/verify`, `GET /api/v1/export?format=csv|jsonl`.
