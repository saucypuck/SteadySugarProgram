// First-party funnel events (feeds the admin funnel). Also the place to forward
// events to GA4 / Meta Pixel / PostHog server-side later.
const db = require('./db');

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ref'];

// Remember the first-touch attribution for the visitor's session.
function captureUtm(req, res, next) {
  if (!req.session.utm) {
    const utm = {};
    for (const k of UTM_KEYS) if (req.query[k]) utm[k] = String(req.query[k]).slice(0, 100);
    if (Object.keys(utm).length) req.session.utm = utm;
  }
  next();
}

async function track(req, name, data = {}) {
  try {
    await db.insert('events', {
      name,
      userId: req.user ? req.user.id : null,
      utm: req.session.utm || null,
      ...data,
    });
  } catch (err) {
    console.error('[track]', err.message);
  }
}

module.exports = { captureUtm, track };
