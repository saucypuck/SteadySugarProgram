// First-party attribution + funnel events. Feeds the admin funnel and the
// marketing dashboard. Also the place to forward events to GA4 / Meta CAPI /
// Google Ads conversions server-side later.
const db = require('./db');
const webhooks = require('./integrations/webhooks');

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref'];

// Last non-direct touch wins (so the ad that brought someone back gets credit);
// the very first touch is kept separately for reporting.
function captureUtm(req, res, next) {
  const utm = {};
  for (const k of UTM_KEYS) if (req.query[k]) utm[k] = String(req.query[k]).slice(0, 100);
  if (Object.keys(utm).length) {
    req.session.utm = utm;
    if (!req.session.firstUtm) req.session.firstUtm = utm;
  }
  next();
}

// Called when a visitor lands on a tracked landing page (and experiment variant).
function setLanding(req, lpSlug, expSlug) {
  req.session.lp = lpSlug;
  req.session.exp = expSlug || null;
}

// Attribution snapshot stored on events, leads, users and orders.
function attribution(req) {
  const s = req.session || {};
  if (!s.utm && !s.lp) return null;
  return { ...(s.utm || {}), lp: s.lp || null, exp: s.exp || null };
}

async function track(req, name, data = {}) {
  try {
    const u = req.user;
    await db.insert('events', {
      name,
      userId: u ? u.id : null,
      utm: attribution(req),
      ...data,
    });
    if (name !== 'lp_view' && name !== 'quiz_start') {
      webhooks.fire(name, { user: u ? { id: u.id, email: u.email, name: u.name, plan: u.plan } : null, attribution: attribution(req), ...data });
    }
  } catch (err) {
    console.error('[track]', err.message);
  }
}

module.exports = { captureUtm, setLanding, attribution, track };
