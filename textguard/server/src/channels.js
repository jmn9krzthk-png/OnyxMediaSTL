// Every channel TextGuard archives, and how each one is captured.
// Capture always goes through a route the platform itself supports for
// business use: the phone's SMS store, mail journaling, or the platform's
// official business API / compliance partner program. Personal accounts on
// consumer apps (Signal, personal WhatsApp, iMessage) have no such route, so
// firms prohibit them and TextGuard flags their use instead.

export const CHANNELS = {
  sms: { label: 'Text message', group: 'Phone', capture: 'Android app reads the phone\'s SMS store', source: 'device' },
  mms: { label: 'Picture message', group: 'Phone', capture: 'Android app reads the phone\'s MMS store', source: 'device' },
  call: { label: 'Phone call', group: 'Phone', capture: 'Android app reads the call log (no audio)', source: 'device' },
  email: { label: 'Email', group: 'Email', capture: 'Journaling from Microsoft 365, Google Workspace or any mail server', source: 'email' },
  facebook: { label: 'Facebook Messenger', group: 'Social', capture: 'Meta webhook for the advisor\'s business Page', source: 'meta' },
  instagram: { label: 'Instagram DM', group: 'Social', capture: 'Meta webhook for the advisor\'s business account', source: 'meta' },
  whatsapp: { label: 'WhatsApp', group: 'Messaging', capture: 'WhatsApp Business Platform webhook for a firm-owned number', source: 'whatsapp' },
  linkedin: { label: 'LinkedIn', group: 'Social', capture: 'LinkedIn compliance partner feed, sent through a connector', source: 'connector' },
  teams: { label: 'Microsoft Teams', group: 'Collaboration', capture: 'Microsoft Graph export API, sent through a connector', source: 'connector' },
  zoom: { label: 'Zoom chat', group: 'Collaboration', capture: 'Zoom archiving API, sent through a connector', source: 'connector' },
  slack: { label: 'Slack', group: 'Collaboration', capture: 'Slack Discovery API, sent through a connector', source: 'connector' },
  x: { label: 'X (Twitter) DM', group: 'Social', capture: 'X API for the advisor\'s business account, sent through a connector', source: 'connector' },
  web_chat: { label: 'Website chat', group: 'Web', capture: 'Chat widget transcript, sent through a connector', source: 'connector' },
};

export const DIRECTIONS = new Set(['inbound', 'outbound', 'internal', 'missed', 'rejected', 'voicemail', 'failed']);

// Consumer apps with no business capture route. The Android app reports which
// are installed, and the dashboard flags them for follow-up.
export const OFF_CHANNEL_APPS = {
  'org.thoughtcrime.securesms': 'Signal',
  'org.telegram.messenger': 'Telegram',
  'com.whatsapp': 'WhatsApp (personal)',
  'com.facebook.orca': 'Messenger (personal)',
  'com.tencent.mm': 'WeChat',
  'com.snapchat.android': 'Snapchat',
  'com.viber.voip': 'Viber',
  'com.discord': 'Discord',
};
