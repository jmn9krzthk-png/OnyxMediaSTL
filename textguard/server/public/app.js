// Supervision console. Message text is untrusted input from the field, so every
// value goes into the page through textContent (via h()), never innerHTML.

const $ = (sel) => document.querySelector(sel);
const session = {
  get token() { try { return sessionStorage.getItem('tg.token') ?? ''; } catch { return this._t ?? ''; } },
  set token(v) { try { v ? sessionStorage.setItem('tg.token', v) : sessionStorage.removeItem('tg.token'); } catch { this._t = v; } },
  get reviewer() { try { return localStorage.getItem('tg.reviewer') ?? ''; } catch { return this._r ?? ''; } },
  set reviewer(v) { try { localStorage.setItem('tg.reviewer', v); } catch { this._r = v; } },
};

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json', ...(options.headers ?? {}) },
  });
  if (res.status === 401) { signOut(); throw new Error('Signed out: token rejected'); }
  const body = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body;
}

const fmtTime = (iso) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtAgo = (iso) => {
  if (!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const DECISION_LABEL = { no_action: 'No action needed', approved: 'Approved', follow_up: 'Follow up with advisor', escalated: 'Escalated to compliance' };
const CHANNEL = {
  sms: 'SMS', mms: 'MMS', call: 'Call', email: 'Email', facebook: 'Messenger', instagram: 'Instagram', whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn', teams: 'Teams', zoom: 'Zoom', slack: 'Slack', x: 'X', web_chat: 'Web chat',
};
const STATUS = { capturing: ['Capturing', 'ok'], waiting: ['Connected, no messages yet', 'neutral'], needs_accounts: ['Connected, no accounts mapped', 'warn'], not_connected: ['Not connected', 'neutral'] };
const who = (m) => m.counterpartyName ? `${m.counterpartyName} (${m.counterparties[0]})` : m.counterparties.join(', ');
const DIRECTION_LABEL = { internal: 'internal with', inbound: 'from', outbound: 'to', missed: 'missed call from', rejected: 'declined call from', voicemail: 'voicemail from', failed: 'failed send to' };

// ---------- state ----------
let view = 'queue';
let selectedId = null;
let summaryData = null;

// ---------- sign in ----------
function signOut() {
  session.token = '';
  $('#app').hidden = true;
  $('#login').hidden = false;
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  session.token = $('#token').value.trim();
  session.reviewer = $('#reviewer').value.trim();
  try {
    await start();
    $('#login-error').textContent = '';
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});
$('#logout').addEventListener('click', signOut);

// ---------- tabs ----------
for (const tab of document.querySelectorAll('.tabs button')) {
  tab.addEventListener('click', () => setView(tab.dataset.view));
}
function setView(v) {
  view = v;
  for (const t of document.querySelectorAll('.tabs button')) t.setAttribute('aria-selected', String(t.dataset.view === v));
  $('#view-list').hidden = !(v === 'queue' || v === 'messages');
  $('#view-devices').hidden = v !== 'devices';
  $('#view-channels').hidden = v !== 'channels';
  $('#view-records').hidden = v !== 'records';
  $('#f-flag').hidden = v === 'queue';
  selectedId = null;
  renderDetailEmpty();
  if (v === 'queue' || v === 'messages') loadList();
  if (v === 'devices') loadDevices();
  if (v === 'channels') loadChannels();
  if (v === 'records') renderRecords();
}

// ---------- summary ----------
async function loadSummary() {
  summaryData = await api('/api/v1/summary');
  const s = summaryData;
  $('#queue-count').textContent = s.pendingReview || '';
  $('#device-alert').hidden = !s.devicesWithIssues;
  $('#device-alert').textContent = s.devicesWithIssues || '';
  const cats = Object.entries(s.pendingByCategory).sort((a, b) => b[1] - a[1]);
  $('#stats').replaceChildren(
    h('div', { class: `stat ${s.pendingReview ? 'alert' : 'good'}` }, h('div', { class: 'n' }, s.pendingReview), h('div', { class: 'l' }, 'Flagged, awaiting review')),
    h('div', { class: 'stat' }, h('div', { class: 'n' }, s.messages.toLocaleString()), h('div', { class: 'l' }, 'Messages and calls archived')),
    h('div', { class: 'stat' }, h('div', { class: 'n' }, s.devices), h('div', { class: 'l' }, 'Enrolled phones')),
    h('div', { class: `stat ${s.devicesWithIssues ? 'alert' : 'good'}` }, h('div', { class: 'n' }, s.devicesWithIssues), h('div', { class: 'l' }, 'Phones needing attention')),
    h('div', { class: 'stat' }, h('div', { class: 'n text' }, cats[0]?.[0] ?? 'None'), h('div', { class: 'l' }, 'Top flag category in queue')),
  );
  if ($('#f-channel').options.length === 1) {
    $('#f-channel').append(...Object.entries(CHANNEL).map(([id, label]) => h('option', { value: id }, label)));
  }
  for (const sel of [$('#f-advisor'), $('#x-advisor')]) {
    const keep = sel.value;
    sel.replaceChildren(h('option', { value: '' }, 'All advisors'), ...s.advisors.map((a) => h('option', { value: a.id }, `${a.name} (${a.id})`)));
    sel.value = keep;
  }
}

// ---------- message list ----------
let searchTimer;
$('#f-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadList, 250); });
$('#f-advisor').addEventListener('change', loadList);
$('#f-flag').addEventListener('change', loadList);
$('#f-channel').addEventListener('change', loadList);

async function loadList() {
  const p = new URLSearchParams({ limit: '300' });
  if ($('#f-q').value.trim()) p.set('q', $('#f-q').value.trim());
  if ($('#f-advisor').value) p.set('advisor', $('#f-advisor').value);
  if ($('#f-channel').value) p.set('channel', $('#f-channel').value);
  if (view === 'queue') p.set('status', 'pending');
  else if ($('#f-flag').value) p.set('flagged', $('#f-flag').value);
  const { messages, total } = await api(`/api/v1/messages?${p}`);
  const list = $('#msg-list');
  if (!messages.length) {
    list.replaceChildren(h('li', { class: 'empty' }, view === 'queue' ? 'Nothing waiting for review.' : 'No messages match.'));
    return;
  }
  list.replaceChildren(
    ...messages.map((m) =>
      h('li', { tabindex: '0', 'aria-current': String(m.messageId === selectedId), onclick: () => select(m.messageId), onkeydown: (e) => e.key === 'Enter' && select(m.messageId), 'data-id': m.messageId },
        h('div', { class: 'row1' }, h('span', {}, h('span', { class: `ch ch-${m.channel}` }, CHANNEL[m.channel] ?? m.channel), ' ', h('b', {}, m.advisorName), ` ${DIRECTION_LABEL[m.direction] ?? ''} ${who(m)}`), h('span', { class: 'time' }, fmtTime(m.sentAt))),
        h('div', { class: 'body' }, m.subject ? `${m.subject} · ${m.body}` : m.channel === 'call' ? `Phone call${m.durationSec ? `, ${Math.round(m.durationSec / 60)} min` : ''}` : m.body || (m.attachments.length ? `[${m.attachments.length} attachment]` : '')),
        (m.flags.length || m.review) && h('div', { class: 'tags' },
          [...new Set(m.flags.map((f) => f.category))].map((c) => h('span', { class: 'tag' }, c)),
          m.review && h('span', { class: 'tag ok' }, DECISION_LABEL[m.review.decision])),
      ),
    ),
    total > messages.length ? h('li', { class: 'empty' }, `Showing ${messages.length} of ${total}. Narrow the search to see more.`) : '',
  );
}

// ---------- detail ----------
function renderDetailEmpty() {
  $('#detail').replaceChildren(h('p', { class: 'muted empty' }, 'Select a message to see the conversation and record a review.'));
}

function highlight(text, flags) {
  if (!flags?.length) return [text];
  const needles = flags.map((f) => f.match).filter(Boolean);
  const out = [];
  let rest = text;
  while (rest) {
    let best = null;
    for (const n of needles) {
      const i = rest.toLowerCase().indexOf(n.toLowerCase());
      if (i >= 0 && (best === null || i < best.i)) best = { i, n };
    }
    if (!best) { out.push(rest); break; }
    out.push(rest.slice(0, best.i), h('mark', {}, rest.slice(best.i, best.i + best.n.length)));
    rest = rest.slice(best.i + best.n.length);
  }
  return out;
}

async function select(id) {
  selectedId = id;
  for (const li of document.querySelectorAll('#msg-list li')) li.setAttribute('aria-current', String(li.dataset.id === id));
  const { message: m, reviews } = await api(`/api/v1/messages/${id}`);
  // Conversation context: everything this advisor exchanged with the same number.
  const p = new URLSearchParams({ advisor: m.advisorId, order: 'asc', limit: '200', channel: m.channel });
  if (m.threadId) p.set('thread', m.threadId); else p.set('counterparty', m.counterparties[0] ?? '');
  const { messages: thread } = await api(`/api/v1/messages?${p}`);

  const decisionInputs = Object.entries(DECISION_LABEL).map(([value, label], i) =>
    h('label', {}, h('input', { type: 'radio', name: 'decision', value, required: true, checked: i === 0 }), label));
  const note = h('textarea', { placeholder: 'Reviewer note (kept with the record)' });
  const status = h('p', { class: 'error', role: 'alert' });

  $('#detail').replaceChildren(
    h('header', {},
      h('div', {}, h('h2', {}, m.subject || `${m.advisorName} and ${who(m)}`), h('div', { class: 'muted' }, `${CHANNEL[m.channel] ?? m.channel} · ${m.advisorName} (${m.advisorId}) ${DIRECTION_LABEL[m.direction] ?? ''} ${who(m)}${m.account ? ` · account ${m.account}` : ''} · ${new Date(m.sentAt).toLocaleString()}`)),
      h('div', { class: 'tags' }, m.flags.map((f) => h('span', { class: 'tag', title: `Rule ${f.rule}, lexicon ${m.lexiconVersion}` }, `${f.category}: "${f.match}"`))),
    ),
    h('div', { class: 'thread' },
      thread.map((t) => {
        if (t.channel === 'call') {
          return h('div', { class: 'bubble call' }, `${t.direction === 'outbound' ? 'Outgoing' : t.direction === 'inbound' ? 'Incoming' : 'Missed'} call · ${t.durationSec ? `${Math.round(t.durationSec / 60)} min · ` : ''}${fmtTime(t.sentAt)}`);
        }
        return h('div', { class: `bubble ${t.direction === 'outbound' ? 'out' : ''} ${t.channel === 'email' ? 'mail' : ''} ${t.messageId === m.messageId ? 'focus' : ''}` },
          t.channel === 'email' && h('span', { class: 'mail-head' }, `${t.direction === 'outbound' ? `To ${t.counterparties.join(', ')}` : `From ${t.counterparties.join(', ')}`}${t.subject ? ` · ${t.subject}` : ''}`),
          ...highlight(t.body, t.flags),
          t.attachments.map((a) => h('span', { class: 'meta' }, `Attachment: ${a.contentType}${a.size ? `, ${Math.round(a.size / 1024)} KB` : ''}`)),
          h('span', { class: 'meta' }, `${fmtTime(t.sentAt)}${t.flags.length && t.messageId !== m.messageId ? ' · flagged' : ''}`));
      }),
    ),
    h('form', { class: 'review-box', onsubmit: async (e) => {
      e.preventDefault();
      const decision = new FormData(e.target).get('decision');
      try {
        await api(`/api/v1/messages/${id}/reviews`, { method: 'POST', body: JSON.stringify({ decision, note: note.value, reviewer: session.reviewer }) });
        await Promise.all([loadSummary(), loadList()]);
        if (view === 'queue') renderDetailEmpty(); else select(id);
      } catch (err) { status.textContent = err.message; }
    } },
      h('h2', {}, 'Record review'),
      h('div', { class: 'decisions' }, decisionInputs),
      note,
      h('div', {}, h('button', { type: 'submit' }, `Save review as ${session.reviewer}`)),
      status,
      reviews.length > 0 && h('div', { class: 'history' }, h('b', {}, 'Review history'),
        reviews.map((r) => h('div', {}, `${new Date(r.recordedAt).toLocaleString()} · ${r.reviewer} · ${DECISION_LABEL[r.decision]}${r.note ? ` · "${r.note}"` : ''}`))),
      h('div', { class: 'hash' }, `Record #${m.seq} · SHA-256 ${m.hash}`),
    ),
  );
}

// ---------- channels ----------
async function loadChannels() {
  const { channels, connectors, offChannelApps } = await api('/api/v1/channels');
  $('#channel-table').replaceChildren(
    h('thead', {}, h('tr', {}, ['Channel', 'How it is captured', 'Status', 'Archived', 'Flagged', 'Last message'].map((t) => h('th', {}, t)))),
    h('tbody', {}, channels.map((c) => h('tr', {},
      h('td', {}, h('span', { class: `ch ch-${c.id}` }, CHANNEL[c.id] ?? c.id), h('div', { class: 'muted' }, c.label)),
      h('td', {}, c.capture),
      h('td', {}, h('span', { class: `tag ${STATUS[c.status][1]}` }, STATUS[c.status][0]), c.accounts ? h('div', { class: 'muted' }, `${c.accounts} account${c.accounts === 1 ? '' : 's'}`) : null),
      h('td', { class: 'num' }, c.messages.toLocaleString()),
      h('td', { class: 'num' }, c.flagged.toLocaleString()),
      h('td', {}, c.lastMessageAt ? fmtAgo(c.lastMessageAt) : '—'),
    ))),
  );
  $('#connector-table').replaceChildren(
    h('thead', {}, h('tr', {}, ['Source', 'Channels', 'Accounts mapped', 'Received', 'Last activity'].map((t) => h('th', {}, t)))),
    h('tbody', {}, [
      h('tr', {}, h('td', {}, h('b', {}, 'TextGuard Android app')), h('td', {}, 'SMS, MMS, Call'), h('td', {}, 'Enrolled phones (see Devices)'), h('td'), h('td')),
      ...connectors.map((c) => h('tr', {},
        h('td', {}, h('b', {}, c.name), c.lastError ? h('div', {}, h('span', { class: 'tag' }, c.lastError)) : null),
        h('td', {}, c.channels.map((id) => CHANNEL[id]).join(', ')),
        h('td', {}, Object.entries(c.accounts).map(([acct, a]) => h('div', {}, `${a.advisorName}: `, h('span', { class: 'hash' }, acct)))),
        h('td', { class: 'num' }, `${c.received.toLocaleString()}${c.unmatched ? ` (+${c.unmatched} unmapped)` : ''}`),
        h('td', {}, fmtAgo(c.lastReceivedAt)),
      )),
    ]),
  );
  $('#offchannel').replaceChildren(...offChannelApps.map((a) => h('span', { class: 'tag neutral' }, a)), h('span', { class: 'tag neutral' }, 'iMessage'), h('span', { class: 'tag neutral' }, 'Personal email'));
}

// ---------- devices ----------
async function loadDevices() {
  const { devices, pendingEnrollmentCodes } = await api('/api/v1/devices');
  const rows = devices.sort((a, b) => Number(a.healthy) - Number(b.healthy)).map((d) =>
    h('tr', {},
      h('td', {}, h('b', {}, d.advisorName), h('div', { class: 'muted' }, d.advisorId)),
      h('td', {}, d.model || 'Unknown device', h('div', { class: 'muted' }, `Android ${d.osVersion || '?'} · app ${d.status?.appVersion || d.appVersion || '?'}`)),
      h('td', {}, `Checked in ${fmtAgo(d.lastSeen)}`, h('div', { class: 'muted' }, `Last capture ${fmtAgo(d.lastCaptureAt)}`)),
      h('td', {}, d.healthy ? h('span', { class: 'tag ok' }, 'Capturing') : d.issues.map((i) => h('div', {}, h('span', { class: d.revokedAt ? 'tag neutral' : 'tag' }, i)))),
      h('td', {}, d.revokedAt ? '' : h('button', { class: 'secondary', onclick: async () => {
        if (!confirm(`Revoke ${d.advisorName}'s device? It will stop uploading and must be re-enrolled.`)) return;
        await api(`/api/v1/devices/${d.deviceId}/revoke`, { method: 'POST' });
        loadDevices(); loadSummary();
      } }, 'Revoke')),
    ));
  const pending = pendingEnrollmentCodes.map((c) =>
    h('tr', {}, h('td', {}, h('b', {}, c.advisorName), h('div', { class: 'muted' }, c.advisorId)), h('td', {}, 'Waiting for enrollment'), h('td', {}, `Code ${c.code}`), h('td', {}, h('span', { class: 'tag neutral' }, `Expires ${fmtTime(c.expiresAt)}`)), h('td')));
  $('#device-table').replaceChildren(
    h('thead', {}, h('tr', {}, ['Advisor', 'Phone', 'Activity', 'Status', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.length || pending.length ? [...rows, ...pending] : h('tr', {}, h('td', { colspan: '5', class: 'muted' }, 'No phones enrolled yet.'))),
  );
}
$('#enroll-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api('/api/v1/enrollment-codes', { method: 'POST', body: JSON.stringify({ advisorId: $('#e-id').value.trim(), advisorName: $('#e-name').value.trim() }) });
  $('#enroll-result').replaceChildren('Give this code to ', h('b', {}, r.advisorName), ': ', h('code', {}, r.enrollmentCode), ` (expires ${fmtTime(r.expiresAt)})`);
  e.target.reset();
  loadDevices();
});

// ---------- records ----------
function renderRecords() {
  const lx = summaryData?.lexicon;
  $('#lexicon-version').textContent = lx ? `Version ${lx.version}. Each flag is stored with the message along with the rule and version that raised it.` : '';
  $('#lexicon-table').replaceChildren(
    h('thead', {}, h('tr', {}, h('th', {}, 'Category'), h('th', {}, 'Rule'), h('th', {}, 'Pattern'))),
    h('tbody', {}, (lx?.rules ?? []).map((r) => h('tr', {}, h('td', {}, r.category), h('td', {}, r.id), h('td', { class: 'hash' }, r.pattern)))),
  );
}
$('#verify').addEventListener('click', async () => {
  const r = await api('/api/v1/ledger/verify');
  $('#verify-result').replaceChildren(r.ok
    ? h('div', { class: 'verify-ok' }, `All ${r.count.toLocaleString()} records intact. Chain head ${r.head.slice(0, 16)}…, checked ${new Date(r.checkedAt).toLocaleTimeString()}.`)
    : h('div', { class: 'verify-bad' }, `Integrity failure at record #${r.brokenAt}: ${r.reason}. Records before it (${r.count}) are intact.`));
});
$('#export-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = new URLSearchParams({ format: $('#x-format').value });
  if ($('#x-advisor').value) p.set('advisor', $('#x-advisor').value);
  if ($('#x-from').value) p.set('from', `${$('#x-from').value}T00:00:00`);
  if ($('#x-to').value) p.set('to', `${$('#x-to').value}T23:59:59.999`);
  const res = await fetch(`/api/v1/export?${p}`, { headers: { authorization: `Bearer ${session.token}` } });
  if (!res.ok) return alert('Export failed');
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'export';
  const a = h('a', { href: URL.createObjectURL(await res.blob()), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- boot ----------
async function start() {
  await loadSummary();
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#who').textContent = session.reviewer;
  setView(view);
}
$('#reviewer').value = session.reviewer;
if (session.token) start().catch(signOut); else signOut();
setInterval(() => { if (session.token && !$('#app').hidden) loadSummary().catch(() => {}); }, 30000);
