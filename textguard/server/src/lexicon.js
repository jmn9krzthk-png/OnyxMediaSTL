// Supervision lexicon: phrases a FINRA Rule 3110 reviewer would want surfaced.
// Each hit is stored on the message record at capture time, so the archive
// shows what was flagged and by which rule version, even if the rules change.
//
// This list is a starting point. A real firm supplies its own lexicon, and
// keyword rules are tuned against false positives over time.

export const LEXICON_VERSION = '2026.11-proto';

const RULES = [
  // Promissory / performance guarantees (FINRA Rule 2210)
  { id: 'guarantee', category: 'Promissory language', re: /\bguarantee[ds]?\b|\bguaranteed returns?\b/i },
  { id: 'cant-lose', category: 'Promissory language', re: /\bcan'?t (?:lose|go wrong|miss)\b|\bno[- ]risk\b|\brisk[- ]free\b|\bsure thing\b|\bsafe bet\b/i },
  { id: 'double-money', category: 'Promissory language', re: /\b(?:double|triple) your money\b|\bget rich\b/i },

  // Moving the conversation off the supervised channel
  { id: 'off-channel-app', category: 'Off-channel communication', re: /\b(?:whatsapp|signal|telegram|wechat|snapchat|imessage|facebook messenger|dm me)\b/i },
  { id: 'personal-number', category: 'Off-channel communication', re: /\b(?:my|text|call) (?:personal|other|private) (?:cell|phone|number)\b|\btext my personal\b/i },
  { id: 'conceal', category: 'Off-channel communication', re: /\boff the record\b|\bdelete (?:this|these|that|the) (?:text|message|thread)s?\b|\bbetween (?:you and me|us)\b|\bdon'?t tell\b/i },

  // Customer complaints (FINRA Rule 4530 reporting)
  { id: 'complaint', category: 'Possible complaint', re: /\b(?:complain(?:t|ing)?|unauthori[sz]ed|lawyer|attorney|sue|lawsuit|arbitration|fraud|ripped off|misled)\b/i },
  { id: 'lost-money', category: 'Possible complaint', re: /\blost (?:all |so much |my )?(?:money|savings)\b/i },

  // Money movement and account changes: instructions by text are a fraud risk
  { id: 'wire', category: 'Money movement', re: /\b(?:wire|transfer|move) (?:the |my |your )?(?:funds|money|cash|\$?\d[\d,]*(?:\.\d+)?)/i },
  { id: 'banking-details', category: 'Money movement', re: /\b(?:routing|account) (?:number|#|no\.?)\b/i },
  { id: 'trade-instruction', category: 'Trade instruction', re: /\b(?:buy|sell|short)\s+(?:\d[\d,]*\s+(?:shares?|units?)|all (?:of )?my|more)\b/i },

  // Gifts and entertainment (FINRA Rule 3220)
  { id: 'gifts', category: 'Gifts & entertainment', re: /\b(?:gift card|tickets? to|cash gift|my treat|kickback)\b/i },

  // Sensitive personal data sent in clear text
  { id: 'ssn', category: 'Sensitive data', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { id: 'card-number', category: 'Sensitive data', re: /\b(?:\d[ -]?){15,16}\b/ },
];

/** Returns [{ rule, category, match }] for each rule the text triggers. */
export function scan(text) {
  if (!text) return [];
  const hits = [];
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (m) hits.push({ rule: rule.id, category: rule.category, match: m[0] });
  }
  return hits;
}

export const rules = RULES.map(({ id, category, re }) => ({ id, category, pattern: re.source }));
