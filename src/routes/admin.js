const express = require('express');
const db = require('../db');
const content = require('../content');
const sched = require('../scheduling');
const { requireAdmin } = require('../auth');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(requireAdmin, (req, res, next) => {
  res.locals.variant = 'admin';
  next();
});

router.get('/', h(async (req, res) => {
  const [users, leads, orders, bookings, events] = await Promise.all(
    ['users', 'leads', 'orders', 'bookings', 'events'].map((c) => db.all(c))
  );
  const members = users.filter((u) => u.plan && u.status === 'active');
  const mrr = members.reduce((sum, u) => sum + (content.plans[u.plan] ? content.plans[u.plan].price : 0), 0);
  const revenue = orders.filter((o) => o.status === 'paid').reduce((s, o) => s + Number(o.amount || 0), 0);
  const count = (name) => events.filter((e) => e.name === name).length;

  const funnel = [
    { label: 'Quiz started', n: count('quiz_start') },
    { label: 'Quiz completed (lead)', n: count('quiz_complete') },
    { label: 'Viewed checkout', n: count('checkout_view') },
    { label: 'Purchased', n: count('purchase') },
  ];
  const top = Math.max(1, ...funnel.map((f) => f.n));
  funnel.forEach((f, i) => {
    f.pct = Math.round((f.n / top) * 100);
    f.step = i === 0 ? null : funnel[i - 1].n ? Math.round((f.n / funnel[i - 1].n) * 100) : 0;
  });

  const byPlan = Object.values(content.plans).map((p) => ({ ...p, count: members.filter((u) => u.plan === p.id).length }));

  res.render('admin/dashboard', {
    title: 'Admin',
    kpis: {
      mrr,
      revenue,
      members: members.length,
      leads: leads.length,
      hotLeads: leads.filter((l) => l.temperature === 'hot' && !l.convertedUserId).length,
      upcomingCalls: bookings.filter(sched.isUpcoming).length,
      churned: users.filter((u) => u.status === 'canceled').length,
    },
    funnel,
    byPlan,
    leads: leads.slice(0, 50),
    members: users.filter((u) => u.plan).slice(0, 50),
    bookings: bookings.filter(sched.isUpcoming).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    orders: orders.slice(0, 20),
  });
}));

module.exports = router;
