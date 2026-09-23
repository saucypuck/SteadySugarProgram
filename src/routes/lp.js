// Ad-facing landing pages. Pages are built in Admin → Marketing, not in code.
//   /lp/:slug  — a single landing page
//   /go/:slug  — an A/B test: assigns the visitor a variant (sticky) and redirects to it
const express = require('express');
const db = require('../db');
const { CTA_TARGETS } = require('../marketing');
const { setLanding, track } = require('../track');
const { isAdmin } = require('../auth');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const passThroughQuery = (req, extra = {}) => {
  const q = new URLSearchParams({ ...req.query, ...extra });
  return q.toString() ? `?${q}` : '';
};

router.get('/go/:slug', h(async (req, res, next) => {
  const x = await db.findOneBy('experiments', 'slug', req.params.slug);
  if (!x) return next();
  const variants = [];
  for (const id of x.variantIds || []) {
    const p = await db.get('pages', id);
    if (p) variants.push(p);
  }
  if (!variants.length) return res.redirect('/');
  // Concluded tests send everyone to the winner so old ads keep working.
  let page = x.status === 'concluded' ? variants.find((v) => v.id === x.winnerId) : null;
  if (!page) {
    req.session.assign = req.session.assign || {};
    page = variants.find((v) => v.id === req.session.assign[x.slug]);
    if (!page) {
      page = variants[Math.floor(Math.random() * variants.length)];
      req.session.assign[x.slug] = page.id;
    }
  }
  res.redirect(`/lp/${page.slug}${passThroughQuery(req, x.status === 'concluded' ? {} : { exp: x.slug })}`);
}));

router.get('/lp/:slug', h(async (req, res, next) => {
  const page = await db.findOneBy('pages', 'slug', req.params.slug);
  if (!page) return next();
  const preview = isAdmin(req.user) || req.query.preview === '1';
  if (page.status === 'draft' && !preview) return next();

  if (!preview) {
    const exp = req.query.exp ? await db.findOneBy('experiments', 'slug', String(req.query.exp)) : null;
    const inExp = exp && (exp.variantIds || []).includes(page.id);
    setLanding(req, page.slug, inExp ? exp.slug : null);
    await track(req, 'lp_view');
  }

  const cta = CTA_TARGETS[page.ctaTarget] || CTA_TARGETS.quiz;
  res.render('marketing/lp', {
    title: page.headline,
    page,
    cta: { label: page.ctaLabel || cta.label, href: cta.href },
    bullets: String(page.bullets || '').split('\n').map((b) => b.trim()).filter(Boolean),
    preview,
  });
}));

module.exports = router;
