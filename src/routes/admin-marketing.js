// Admin → Marketing: one place for campaigns, ads, landing pages, A/B tests and spend.
const express = require('express');
const db = require('../db');
const mk = require('../marketing');
const { isoDate } = require('../scheduling');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
const rangeOf = (req) => (mk.RANGES[req.query.range] ? req.query.range : '30');

router.use((req, res, next) => {
  res.locals.fmt = {
    money: (n) => (n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`),
    money2: (n) => (n == null ? '—' : `$${Number(n).toFixed(2)}`),
    pct: (n) => (n == null ? '—' : `${(n * 100).toFixed(1)}%`),
    x: (n) => (n == null ? '—' : `${n.toFixed(2)}×`),
    num: (n) => Number(n || 0).toLocaleString('en-US'),
  };
  res.locals.ranges = mk.RANGES;
  next();
});

async function load(req) {
  const r = await mk.report(rangeOf(req));
  return { r, base: baseUrl(req), trackingUrl: (ad) => mk.trackingUrl(baseUrl(req), ad) };
}

router.get('/', h(async (req, res) => res.render('admin/marketing/overview', { title: 'Marketing', tab: 'overview', ...(await load(req)) })));
router.get('/pages', h(async (req, res) => res.render('admin/marketing/pages', { title: 'Landing pages', tab: 'pages', ...(await load(req)) })));
router.get('/ads', h(async (req, res) => res.render('admin/marketing/ads', { title: 'Campaigns & ads', tab: 'ads', today: isoDate(new Date()), ...(await load(req)) })));
router.get('/experiments', h(async (req, res) => res.render('admin/marketing/experiments', { title: 'A/B tests', tab: 'experiments', ...(await load(req)) })));

// ---- Spend log (manual until ad-platform APIs are connected) ------------------------
router.post('/spend', h(async (req, res) => {
  const ad = await db.get('ads', req.body.adId);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.date) ? req.body.date : isoDate(new Date());
  if (ad) {
    await db.insert('spend', {
      adId: ad.id,
      campaignId: ad.campaignId,
      date,
      spend: Number(req.body.spend || 0),
      impressions: Number(req.body.impressions || 0),
      clicks: Number(req.body.clicks || 0),
      source: 'manual',
    });
    req.session.flash = { type: 'success', msg: `Logged spend for "${ad.name}" on ${date}.` };
  }
  res.redirect('/admin/marketing/ads#spend');
}));

// ---- Generic create / edit (driven by ENTITIES schemas) ---------------------------
async function options(source) {
  if (source === 'campaigns') return (await db.all('campaigns')).map((c) => ({ value: c.id, label: `${c.name} (${c.channel})` }));
  if (source === 'pages') return (await db.all('pages')).map((p) => ({ value: p.id, label: `${p.name} — /lp/${p.slug}` }));
  if (source === 'destinations') {
    const [pages, exps] = await Promise.all([db.all('pages'), db.all('experiments')]);
    return [
      ...exps.map((x) => ({ value: `exp:${x.id}`, label: `A/B test: ${x.name} — /go/${x.slug}` })),
      ...pages.map((p) => ({ value: `lp:${p.id}`, label: `Page: ${p.name} — /lp/${p.slug}` })),
    ];
  }
  return [];
}

async function renderForm(res, entity, doc, error) {
  const schema = mk.ENTITIES[entity];
  const fields = [];
  for (const f of schema.fields) {
    const opts = f.optionsFrom ? await options(f.optionsFrom) : (f.options || []).map((o) => ({ value: o, label: o }));
    fields.push({ ...f, opts });
  }
  res.status(error ? 400 : 200).render('admin/marketing/form', { title: `${doc.id ? 'Edit' : 'New'} ${schema.label.toLowerCase()}`, tab: entity === 'campaigns' ? 'ads' : entity, entity, schema, fields, doc, error });
}

const UNIQUE = { campaigns: 'utmCampaign', pages: 'slug', experiments: 'slug' };
async function validate(entity, data, id) {
  const key = UNIQUE[entity];
  if (key && data[key]) {
    const clash = (await db.findBy(entity, key, data[key])).find((d) => d.id !== id);
    if (clash) return `${key} "${data[key]}" is already used by "${clash.name}".`;
  }
  if (entity === 'ads') {
    const camp = await db.get('campaigns', data.campaignId);
    const clash = (await db.findBy('ads', 'utmContent', data.utmContent)).find((d) => d.id !== id && d.campaignId === data.campaignId);
    if (clash) return `utm_content "${data.utmContent}" is already used in ${camp ? camp.name : 'this campaign'}.`;
  }
  return null;
}

const guard = (req, res, next) => (mk.ENTITIES[req.params.entity] ? next() : res.status(404).render('marketing/error', { title: 'Not found', message: 'Unknown type.' }));

router.get('/:entity/new', guard, h(async (req, res) => {
  const defaults = { status: 'draft', showPricing: true, showTestimonials: true, primaryMetric: 'lead_rate', minViews: 100, ctaTarget: 'quiz' };
  await renderForm(res, req.params.entity, { ...defaults, ...req.query });
}));

router.get('/:entity/:id/edit', guard, h(async (req, res, next) => {
  const doc = await db.get(req.params.entity, req.params.id);
  if (!doc) return next();
  await renderForm(res, req.params.entity, doc);
}));

router.post('/:entity', guard, h(async (req, res) => {
  const { entity } = req.params;
  const { data, error } = mk.parseForm(entity, req.body);
  const err = error || (await validate(entity, data));
  if (err) return renderForm(res, entity, data, err);
  await db.insert(entity, data);
  req.session.flash = { type: 'success', msg: `${mk.ENTITIES[entity].label} created.` };
  res.redirect(mk.ENTITIES[entity].list);
}));

router.post('/:entity/:id', guard, h(async (req, res, next) => {
  const { entity, id } = req.params;
  const doc = await db.get(entity, id);
  if (!doc) return next();
  const { data, error } = mk.parseForm(entity, req.body);
  const err = error || (await validate(entity, data, id));
  if (err) return renderForm(res, entity, { ...doc, ...data }, err);
  await db.update(entity, id, data);
  req.session.flash = { type: 'success', msg: `${mk.ENTITIES[entity].label} saved.` };
  res.redirect(mk.ENTITIES[entity].list);
}));

// ---- Experiment detail + decision ----------------------------------------------
router.get('/experiments/:id', h(async (req, res, next) => {
  const data = await load(req);
  const x = data.r.experiments.find((e) => e.id === req.params.id);
  if (!x) return next();
  res.render('admin/marketing/experiment', { title: x.name, tab: 'experiments', x, ...data });
}));

router.post('/experiments/:id/decide', h(async (req, res, next) => {
  const x = await db.get('experiments', req.params.id);
  if (!x || !(x.variantIds || []).includes(req.body.winnerId)) return next();
  await db.update('experiments', x.id, {
    status: 'concluded',
    winnerId: req.body.winnerId,
    decision: String(req.body.decision || '').slice(0, 1000),
    decidedAt: new Date().toISOString(),
  });
  for (const pid of x.variantIds) await db.update('pages', pid, { status: pid === req.body.winnerId ? 'winner' : 'retired' });
  req.session.flash = { type: 'success', msg: 'Winner recorded. /go traffic now goes 100% to the winning page.' };
  res.redirect(`/admin/marketing/experiments/${x.id}`);
}));

module.exports = router;
