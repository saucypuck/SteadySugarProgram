// Integration catalog + settings store.
// - Values can come from environment variables (take precedence, read-only in the UI)
//   or be saved from Admin → Integrations (encrypted at rest with AES-256-GCM,
//   key derived from SESSION_SECRET — rotating that secret makes saved keys unreadable).
// - `live: true` means code in this repo already uses the integration. Others store
//   credentials now; their adapters (src/integrations/*) get wired up later.
const crypto = require('crypto');
const db = require('../db');

const CATALOG = [
  { id: 'stripe', name: 'Stripe', category: 'Payments', desc: 'Subscriptions, checkout, customer billing portal and payment webhooks.', adapter: 'src/integrations/payments.js',
    fields: [
      { key: 'secretKey', label: 'Secret key', secret: true, env: 'STRIPE_SECRET_KEY', required: true },
      { key: 'publishableKey', label: 'Publishable key' },
      { key: 'webhookSecret', label: 'Webhook signing secret', secret: true, env: 'STRIPE_WEBHOOK_SECRET' },
      { key: 'priceCore', label: 'Price ID — Core Program' },
      { key: 'priceVip', label: 'Price ID — VIP 1:1' },
    ] },
  { id: 'resend', name: 'Resend', category: 'Email', desc: 'Transactional email: welcome, receipts, call reminders, password resets.', adapter: 'src/integrations/email.js',
    fields: [{ key: 'apiKey', label: 'API key', secret: true, env: 'RESEND_API_KEY', required: true }, { key: 'fromEmail', label: 'From address', required: true }] },
  { id: 'kit', name: 'Kit (ConvertKit)', category: 'Email', desc: 'Nurture sequences for quiz and free-guide leads.',
    fields: [{ key: 'apiKey', label: 'API key', secret: true, required: true }, { key: 'quizFormId', label: 'Form ID — quiz leads' }, { key: 'guideFormId', label: 'Form ID — free guide' }] },
  { id: 'twilio', name: 'Twilio', category: 'Messaging', desc: 'SMS call reminders and check-in nudges.',
    fields: [{ key: 'accountSid', label: 'Account SID', required: true }, { key: 'authToken', label: 'Auth token', secret: true, required: true }, { key: 'fromNumber', label: 'From number', required: true }] },
  { id: 'slack', name: 'Slack alerts', category: 'Team', live: true, testable: true, desc: 'Get a Slack message for new leads, free signups, booked calls and sales.',
    fields: [{ key: 'webhookUrl', label: 'Incoming webhook URL', secret: true, required: true }, { key: 'events', label: 'Notify on', type: 'events' }] },
  { id: 'zoom', name: 'Zoom', category: 'Calls & calendar', desc: 'Auto-create meeting links for discovery, kickoff and coaching calls.', adapter: 'src/integrations/meetings.js',
    fields: [{ key: 'accountId', label: 'Account ID', required: true }, { key: 'clientId', label: 'Client ID', required: true }, { key: 'clientSecret', label: 'Client secret', secret: true, required: true }] },
  { id: 'google_calendar', name: 'Google Calendar', category: 'Calls & calendar', desc: 'Sync coach availability and push booked calls to the coach calendar.', adapter: 'src/scheduling.js',
    fields: [{ key: 'clientId', label: 'OAuth client ID', required: true }, { key: 'clientSecret', label: 'OAuth client secret', secret: true, required: true }, { key: 'calendarId', label: 'Calendar ID' }] },
  { id: 'meta_ads', name: 'Meta Ads', category: 'Advertising', desc: 'Import daily spend into Marketing and send conversions (Pixel + Conversions API).', adapter: 'src/marketing.js',
    fields: [{ key: 'adAccountId', label: 'Ad account ID', required: true }, { key: 'accessToken', label: 'System user access token', secret: true, required: true }, { key: 'pixelId', label: 'Pixel ID' }, { key: 'capiToken', label: 'Conversions API token', secret: true }] },
  { id: 'google_ads', name: 'Google Ads', category: 'Advertising', desc: 'Import daily spend and upload offline conversions.', adapter: 'src/marketing.js',
    fields: [{ key: 'customerId', label: 'Customer ID', required: true }, { key: 'developerToken', label: 'Developer token', secret: true, required: true }, { key: 'refreshToken', label: 'OAuth refresh token', secret: true, required: true }] },
  { id: 'tiktok_ads', name: 'TikTok Ads', category: 'Advertising', desc: 'Import spend and send Events API conversions.',
    fields: [{ key: 'advertiserId', label: 'Advertiser ID', required: true }, { key: 'accessToken', label: 'Access token', secret: true, required: true }, { key: 'pixelId', label: 'Pixel ID' }] },
  { id: 'ga4', name: 'Google Analytics 4', category: 'Analytics', desc: 'Site analytics and server-side conversion events.', adapter: 'src/track.js',
    fields: [{ key: 'measurementId', label: 'Measurement ID', required: true }, { key: 'apiSecret', label: 'Measurement Protocol API secret', secret: true }] },
  { id: 'posthog', name: 'PostHog', category: 'Analytics', desc: 'Product analytics, session replay and feature flags.',
    fields: [{ key: 'projectKey', label: 'Project API key', required: true }, { key: 'host', label: 'Host', placeholder: 'https://us.i.posthog.com' }] },
  { id: 'vimeo', name: 'Vimeo', category: 'Content', desc: 'Private hosting for course lesson videos.',
    fields: [{ key: 'accessToken', label: 'Access token', secret: true, required: true }, { key: 'folderId', label: 'Course folder ID' }] },
  { id: 'dexcom', name: 'Dexcom', category: 'Health data', desc: 'Let members sync CGM readings into their tracker (with consent).',
    fields: [{ key: 'clientId', label: 'Client ID', required: true }, { key: 'clientSecret', label: 'Client secret', secret: true, required: true }, { key: 'sandbox', label: 'Use sandbox', type: 'checkbox' }] },
  { id: 'libre', name: 'FreeStyle Libre', category: 'Health data', desc: 'Sync Libre CGM data via LibreView partner API.',
    fields: [{ key: 'partnerId', label: 'Partner ID', required: true }, { key: 'apiKey', label: 'API key', secret: true, required: true }] },
];

const SLACK_EVENTS = ['quiz_complete', 'signup_free', 'discovery_booked', 'purchase'];

// ---- encryption for saved secrets --------------------------------------------
const KEY = crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'dev-only-secret-change-me').digest();
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `enc:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}
function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:')) return value;
  try {
    const [, iv, tag, data] = value.split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null; // SESSION_SECRET changed — value must be re-entered
  }
}
const mask = (v) => (v ? `••••${String(v).slice(-4)}` : '');

// ---- settings --------------------------------------------------------------------
const find = (id) => CATALOG.find((i) => i.id === id);
const record = async (id) => db.findOneBy('integrations', 'key', id);

// Decrypted config for use in code: env vars win over saved values.
async function getConfig(id) {
  const def = find(id);
  const rec = await record(id);
  if (!def) return null;
  const out = { enabled: rec ? rec.enabled !== false : false };
  for (const f of def.fields) {
    const envVal = f.env && process.env[f.env];
    out[f.key] = envVal || (rec && rec.values ? decrypt(rec.values[f.key]) : undefined);
    if (envVal) out.enabled = true;
  }
  return out;
}

// Status for the admin UI (never returns raw secrets).
async function status(def) {
  const rec = await record(def.id);
  const fields = def.fields.map((f) => {
    const fromEnv = !!(f.env && process.env[f.env]);
    const saved = rec && rec.values ? rec.values[f.key] : undefined;
    const plain = f.secret ? null : saved;
    const unreadable = f.secret && saved && decrypt(saved) === null;
    return { ...f, fromEnv, has: fromEnv || (saved != null && saved !== '' && !unreadable), display: f.secret ? (fromEnv ? 'set in environment' : saved ? mask(decrypt(saved)) : '') : plain, unreadable };
  });
  const complete = def.fields.filter((f) => f.required).every((f) => fields.find((x) => x.key === f.key).has);
  const enabled = fields.some((f) => f.fromEnv) || (rec ? rec.enabled !== false : false);
  let state = 'not_connected';
  if (complete && enabled) state = def.live ? 'connected' : 'saved';
  else if (rec && complete) state = 'disabled';
  else if (rec) state = 'incomplete';
  return { ...def, fields, state, enabled, updatedAt: rec && rec.updatedAt, lastTest: rec && rec.lastTest };
}

async function save(id, body, by) {
  const def = find(id);
  const rec = await record(id);
  const values = { ...((rec && rec.values) || {}) };
  for (const f of def.fields) {
    if (f.env && process.env[f.env]) continue;
    const v = body[f.key];
    if (f.type === 'checkbox') values[f.key] = v === 'on';
    else if (f.type === 'events') values[f.key] = [].concat(v || []);
    else if (f.secret) { if (v) values[f.key] = encrypt(v.trim()); } // blank = keep existing
    else values[f.key] = String(v || '').trim();
  }
  const data = { key: id, values, enabled: body.enabled === 'on', by };
  return rec ? db.update('integrations', rec.id, data) : db.insert('integrations', data);
}

async function disconnect(id) {
  const rec = await record(id);
  if (rec) await db.update('integrations', rec.id, { values: {}, enabled: false });
}

async function recordTest(id, result) {
  const rec = await record(id);
  if (rec) await db.update('integrations', rec.id, { lastTest: { ...result, at: new Date().toISOString() } });
}

module.exports = { CATALOG, SLACK_EVENTS, find, getConfig, status, save, disconnect, recordTest, encrypt, decrypt };
