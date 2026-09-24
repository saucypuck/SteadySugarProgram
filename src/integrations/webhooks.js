// Outgoing webhooks (Zapier, Make, n8n, your own endpoints) + Slack alerts.
// Fired from track() for funnel/business events. Fire-and-forget: a slow or
// failing endpoint never slows down the visitor's request.
const crypto = require('crypto');
const db = require('../db');
const registry = require('./registry');

const EVENTS = {
  quiz_complete: 'Quiz completed (new lead)',
  lead_guide: 'Free guide opt-in',
  signup_free: 'Free account created',
  discovery_booked: 'Discovery call booked',
  checkout_view: 'Checkout viewed',
  purchase: 'Purchase',
  subscription_canceled: 'Subscription canceled',
  plan_changed: 'Plan changed by admin',
};

const validUrl = (u) => /^https:\/\/[^\s]+$/i.test(u) || (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u));

async function post(url, body, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === 'AbortError' ? 'timeout' : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function send(hook, payload) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', hook.secret || '').update(body).digest('hex');
  const result = await post(hook.url, payload, { 'X-SteadySugar-Event': payload.event, 'X-SteadySugar-Signature': `sha256=${signature}` });
  await db.update('webhooks', hook.id, { lastStatus: result.status, lastOk: result.ok, lastError: result.error || null, lastAt: new Date().toISOString() });
  return result;
}

function slackText(event, p) {
  const who = (p.user && (p.user.email || p.user.name)) || p.email || 'someone';
  const src = p.attribution && p.attribution.utm_source ? ` · via ${p.attribution.utm_source}${p.attribution.lp ? ` → /lp/${p.attribution.lp}` : ''}` : '';
  switch (event) {
    case 'purchase': return `💰 New ${p.plan || ''} sale — $${p.amount} — ${who}${src}`;
    case 'quiz_complete': return `📝 New quiz lead (${p.plan || '—'} recommended) — ${who}${src}`;
    case 'signup_free': return `🆕 Free signup — ${who}${src}`;
    case 'discovery_booked': return `📞 Discovery call booked — ${who}${src}`;
    default: return `🔔 ${EVENTS[event] || event} — ${who}${src}`;
  }
}

async function dispatch(event, payload) {
  const full = { event, at: new Date().toISOString(), ...payload };
  const hooks = (await db.all('webhooks')).filter((h) => h.enabled && (h.events || []).includes(event));
  const jobs = hooks.map((h) => send(h, full));
  const slack = await registry.getConfig('slack');
  if (slack && slack.enabled && slack.webhookUrl && (slack.events && slack.events.length ? slack.events : registry.SLACK_EVENTS).includes(event)) {
    jobs.push(post(slack.webhookUrl, { text: slackText(event, full) }));
  }
  return Promise.allSettled(jobs);
}

// Never throws, never blocks the caller.
function fire(event, payload) {
  dispatch(event, payload).catch((err) => console.error('[webhooks]', err.message));
}

module.exports = { EVENTS, validUrl, fire, send, post, slackText };
