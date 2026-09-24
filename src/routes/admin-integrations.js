// Admin → Integrations: connect / change / disconnect third-party tools, plus
// custom outgoing webhooks (Zapier, Make, n8n, your own endpoints).
const crypto = require('crypto');
const express = require('express');
const db = require('../db');
const registry = require('../integrations/registry');
const webhooks = require('../integrations/webhooks');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };

router.get('/', h(async (req, res) => {
  const items = await Promise.all(registry.CATALOG.map((d) => registry.status(d)));
  const categories = [...new Set(items.map((i) => i.category))].map((cat) => ({ name: cat, items: items.filter((i) => i.category === cat) }));
  res.render('admin/integrations', {
    title: 'Integrations',
    categories,
    connected: items.filter((i) => ['connected', 'saved'].includes(i.state)).length,
    total: items.length,
    hooks: await db.all('webhooks'),
    events: webhooks.EVENTS,
  });
}));

// ---- Custom webhooks (defined before /:id so they aren't swallowed) ---------------
router.post('/webhooks', h(async (req, res) => {
  const url = String(req.body.url || '').trim();
  const events = [].concat(req.body.events || []).filter((e) => webhooks.EVENTS[e]);
  if (!webhooks.validUrl(url) || !events.length) {
    flash(req, 'error', 'Webhook needs an https:// URL and at least one event.');
    return res.redirect('/admin/integrations#webhooks');
  }
  await db.insert('webhooks', { name: String(req.body.name || 'Webhook').trim().slice(0, 80), url, events, enabled: true, secret: crypto.randomBytes(24).toString('hex') });
  flash(req, 'success', 'Webhook added.');
  res.redirect('/admin/integrations#webhooks');
}));

router.post('/webhooks/:id/:action', h(async (req, res, next) => {
  const hook = await db.get('webhooks', req.params.id);
  if (!hook) return next();
  if (req.params.action === 'toggle') {
    await db.update('webhooks', hook.id, { enabled: !hook.enabled });
    flash(req, 'success', hook.enabled ? 'Webhook paused.' : 'Webhook enabled.');
  } else if (req.params.action === 'delete') {
    await db.remove('webhooks', hook.id);
    flash(req, 'success', 'Webhook removed.');
  } else if (req.params.action === 'test') {
    const r = await webhooks.send(hook, { event: 'test', at: new Date().toISOString(), message: 'Test from Steady Sugar admin' });
    flash(req, r.ok ? 'success' : 'error', r.ok ? `Test delivered (HTTP ${r.status}).` : `Test failed: ${r.error || `HTTP ${r.status}`}.`);
  } else return next();
  res.redirect('/admin/integrations#webhooks');
}));

// ---- Catalog integrations ------------------------------------------------------------
router.get('/:id', h(async (req, res, next) => {
  const def = registry.find(req.params.id);
  if (!def) return next();
  res.render('admin/integration', { title: def.name, it: await registry.status(def), events: webhooks.EVENTS, slackDefaults: registry.SLACK_EVENTS });
}));

router.post('/:id', h(async (req, res, next) => {
  const def = registry.find(req.params.id);
  if (!def) return next();
  await registry.save(def.id, req.body, req.user.email);
  const st = await registry.status(def);
  flash(req, st.state === 'incomplete' ? 'info' : 'success',
    st.state === 'incomplete' ? `${def.name} saved — fill in the required fields to connect.` : `${def.name} saved.`);
  res.redirect(`/admin/integrations/${def.id}`);
}));

router.post('/:id/disconnect', h(async (req, res, next) => {
  const def = registry.find(req.params.id);
  if (!def) return next();
  await registry.disconnect(def.id);
  flash(req, 'success', `${def.name} disconnected. (Values set as environment variables stay in effect.)`);
  res.redirect(`/admin/integrations/${def.id}`);
}));

router.post('/:id/test', h(async (req, res, next) => {
  const def = registry.find(req.params.id);
  if (!def) return next();
  let result = { ok: false, error: 'Connection test becomes available once this integration’s adapter is built.' };
  if (def.id === 'slack') {
    const cfg = await registry.getConfig('slack');
    result = cfg.webhookUrl ? await webhooks.post(cfg.webhookUrl, { text: '✅ Steady Sugar is connected to Slack.' }) : { ok: false, error: 'Add a webhook URL first.' };
  }
  await registry.recordTest(def.id, { ok: result.ok, status: result.status || null, error: result.error || null });
  flash(req, result.ok ? 'success' : 'error', result.ok ? 'Test message sent.' : `Test failed: ${result.error || `HTTP ${result.status}`}`);
  res.redirect(`/admin/integrations/${def.id}`);
}));

module.exports = router;
