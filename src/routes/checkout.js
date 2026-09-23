const express = require('express');
const db = require('../db');
const content = require('../content');
const payments = require('../integrations/payments');
const email = require('../integrations/email');
const { createUser, verify, login, requireAuth, normalizeEmail } = require('../auth');
const { track } = require('../track');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const pickPlan = (id) => content.plans[id] || content.plans.coaching;

function renderCheckout(res, plan, extra = {}) {
  res.render('checkout/checkout', { title: `Checkout — ${plan.name}`, variant: 'minimal', plan, error: null, form: {}, ...extra });
}

router.get('/checkout', h(async (req, res) => {
  const plan = pickPlan(req.query.plan);
  await track(req, 'checkout_view', { plan: plan.id });
  const lead = await db.get('leads', req.session.leadId);
  renderCheckout(res, plan, { form: lead ? { name: lead.name, email: lead.email } : {} });
}));

router.post('/checkout', h(async (req, res) => {
  const plan = pickPlan(req.body.plan);
  const fail = (error) => renderCheckout(res.status(400), plan, { error, form: req.body });

  let user = req.user;
  if (!user) {
    const addr = normalizeEmail(req.body.email);
    const { name, password } = req.body;
    if (!name || !addr || !password) return fail('Please fill in your name, email and a password.');
    const existing = await db.findOneBy('users', 'email', addr);
    if (existing) {
      user = await verify(addr, password);
      if (!user) return fail('You already have an account — enter that password, or log in first.');
    } else {
      if (password.length < 8) return fail('Password must be at least 8 characters.');
      user = await createUser({ name, email: addr, password, extra: { leadId: req.session.leadId || null, utm: req.session.utm || null } });
    }
    login(req, user);
  }

  const bump = req.body.bump === 'on' ? content.orderBump : null;
  const payment = await payments.charge({ user, plan, bump });
  if (payment.status !== 'paid') return fail('Payment didn’t go through. Please try again.');

  await db.insert('orders', {
    userId: user.id,
    email: user.email,
    plan: plan.id,
    bump: bump ? bump.id : null,
    amount: payment.amount,
    status: payment.status,
    provider: payment.provider,
    reference: payment.reference,
    utm: req.session.utm || null,
  });
  const isNew = !user.plan;
  await db.update('users', user.id, {
    plan: plan.id,
    status: 'active',
    planStartedAt: isNew ? new Date().toISOString() : user.planStartedAt,
    recipeVault: user.recipeVault || !!bump,
  });
  if (req.session.leadId) await db.update('leads', req.session.leadId, { convertedUserId: user.id });
  await email.send(user.email, 'welcome', { plan: plan.id });
  await track(req, 'purchase', { plan: plan.id, amount: payment.amount });

  if (!isNew) {
    req.session.flash = { type: 'success', msg: `You’re now on ${plan.name}.` };
    return res.redirect('/app/account');
  }
  res.redirect('/welcome');
}));

// ---- Post-purchase onboarding ----------------------------------------------
router.get('/welcome', requireAuth, h(async (req, res) => {
  const lead = await db.get('leads', req.user.leadId || req.session.leadId);
  res.render('checkout/welcome', { title: 'Welcome', variant: 'minimal', lead, plan: content.plans[req.user.plan] });
}));

router.post('/welcome', requireAuth, h(async (req, res) => {
  await db.update('users', req.user.id, {
    goals: {
      target: String(req.body.target || '').slice(0, 200),
      why: String(req.body.why || '').slice(0, 500),
      baselineA1c: String(req.body.baselineA1c || '').slice(0, 10),
      doctorAware: req.body.doctorAware === 'on',
    },
  });
  const includesCalls = (content.plans[req.user.plan] || {}).callsPerMonth > 0;
  if (!includesCalls) req.session.flash = { type: 'success', msg: 'You\u2019re all set — start with your first lesson below.' };
  res.redirect(includesCalls ? '/app/calendar?onboarding=1' : '/app?welcome=1');
}));

module.exports = router;
