// Admin → Members: everyone by tier, member profiles, subscription management.
const express = require('express');
const db = require('../db');
const content = require('../content');
const sched = require('../scheduling');
const crm = require('../crm');
const email = require('../integrations/email');
const webhooks = require('../integrations/webhooks');
const { planOf, isAdmin } = require('../auth');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'free', label: 'Free' },
  { id: 'core', label: 'Core' },
  { id: 'vip', label: 'VIP 1:1' },
  { id: 'canceled', label: 'Canceled' },
  { id: 'comp', label: 'Complimentary' },
];
const inTab = (row, tab) =>
  tab === 'all' ? true
    : tab === 'canceled' ? row.status === 'canceled'
      : tab === 'comp' ? !!row.comp
        : tab === 'free' ? row.tier === 'free' && row.status !== 'canceled'
          : row.tier === tab;

const totalLessons = (tier) => content.courses.filter((c) => c.tier !== 'vip' || tier === 'vip').reduce((n, c) => n + c.lessons.length, 0);

async function memberRows() {
  const [users, logs, bookings, orders] = await Promise.all(['users', 'logs', 'bookings', 'orders'].map((c) => db.all(c)));
  const lastLog = {}; for (const l of logs) if (!lastLog[l.userId] || l.date > lastLog[l.userId]) lastLog[l.userId] = l.date;
  const nextCall = {}; for (const b of bookings.filter(sched.isUpcoming)) if (!nextCall[b.userId] || b.date < nextCall[b.userId].date) nextCall[b.userId] = b;
  const ltv = {}; for (const o of orders.filter((x) => x.status === 'paid')) ltv[o.userId] = (ltv[o.userId] || 0) + Number(o.amount || 0);
  return users.filter((u) => !isAdmin(u)).map((u) => {
    const tier = planOf(u);
    return {
      ...u,
      tier,
      lessons: (u.completedLessons || []).length,
      lessonsTotal: totalLessons(tier),
      lastLog: lastLog[u.id] || null,
      nextCall: nextCall[u.id] || null,
      ltv: ltv[u.id] || 0,
      mrr: tier !== 'free' && !u.comp ? content.plans[tier].price : 0,
      source: u.utm ? [u.utm.utm_source, u.utm.lp && `/lp/${u.utm.lp}`].filter(Boolean).join(' · ') : 'direct',
    };
  });
}

function filtered(rows, q) {
  const tab = TABS.some((t) => t.id === q.tier) ? q.tier : 'all';
  const search = String(q.q || '').trim().toLowerCase();
  let list = rows.filter((r) => inTab(r, tab));
  if (search) list = list.filter((r) => [r.name, r.email, ...(r.tags || [])].join(' ').toLowerCase().includes(search));
  const sorts = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    ltv: (a, b) => b.ltv - a.ltv,
    active: (a, b) => String(b.lastLog || '').localeCompare(String(a.lastLog || '')),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  const sort = sorts[q.sort] ? q.sort : 'newest';
  return { tab, search, sort, list: list.sort(sorts[sort]) };
}

router.get('/', h(async (req, res) => {
  const rows = await memberRows();
  const f = filtered(rows, req.query);
  const counts = Object.fromEntries(TABS.map((t) => [t.id, rows.filter((r) => inTab(r, t.id)).length]));
  const paying = rows.filter((r) => r.mrr > 0);
  res.render('admin/members', {
    title: 'Members', tabs: TABS, counts, ...f,
    stats: {
      mrr: paying.reduce((s, r) => s + r.mrr, 0),
      paying: paying.length,
      free: counts.free,
      churned: counts.canceled,
      arpu: paying.length ? paying.reduce((s, r) => s + r.mrr, 0) / paying.length : 0,
      activeWeek: rows.filter((r) => r.lastLog && r.lastLog >= sched.isoDate(new Date(Date.now() - 7 * 864e5))).length,
    },
  });
}));

router.get('/export.csv', h(async (req, res) => {
  const { list } = filtered(await memberRows(), req.query);
  const cols = ['name', 'email', 'tier', 'status', 'comp', 'createdAt', 'lessons', 'lastLog', 'ltv', 'mrr', 'source', 'tags'];
  const esc = (v) => `"${String(Array.isArray(v) ? v.join('; ') : v == null ? '' : v).replace(/"/g, '""')}"`;
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', `attachment; filename="members-${sched.isoDate(new Date())}.csv"`);
  res.send([cols.join(','), ...list.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n'));
}));

async function loadMember(req, res, next) {
  const u = await db.get('users', req.params.id);
  if (!u || isAdmin(u)) return next('route');
  req.member = u;
  next();
}

router.get('/:id', h(loadMember), h(async (req, res) => {
  const u = req.member;
  const tier = planOf(u);
  const [orders, bookings, logs, lead, notes, tasks, timeline] = await Promise.all([
    db.findBy('orders', 'userId', u.id),
    db.findBy('bookings', 'userId', u.id),
    db.findBy('logs', 'userId', u.id),
    u.leadId ? db.get('leads', u.leadId) : db.findOneBy('leads', 'email', u.email),
    crm.notesFor('user', u.id),
    crm.tasksFor('user', u.id),
    crm.memberTimeline(u),
  ]);
  const sortedLogs = logs.sort((a, b) => b.date.localeCompare(a.date));
  const fasting = sortedLogs.filter((l) => l.fasting).map((l) => Number(l.fasting));
  res.render('admin/member', {
    title: u.name,
    m: u,
    tier,
    plan: content.plans[tier],
    orders,
    ltv: orders.filter((o) => o.status === 'paid').reduce((s, o) => s + Number(o.amount || 0), 0),
    upcoming: bookings.filter(sched.isUpcoming).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    pastCalls: bookings.filter((b) => !sched.isUpcoming(b)).length,
    logs: sortedLogs.slice(0, 5),
    logCount: logs.length,
    fastingChange: fasting.length > 1 ? fasting[0] - fasting[fasting.length - 1] : null,
    lessonsTotal: totalLessons(tier),
    lead,
    quiz: content.quiz,
    notes,
    tasks,
    timeline,
    today: sched.isoDate(new Date()),
  });
}));

// ---- Subscription management -------------------------------------------------
// TODO(stripe): mirror these on the Stripe subscription (update price, cancel_at_period_end, coupons).
const back = (res, u, msg, type = 'success') => { res.req.session.flash = { type, msg }; res.redirect(`/admin/members/${u.id}`); };

router.post('/:id/plan', h(loadMember), h(async (req, res) => {
  const u = req.member;
  const to = content.plans[req.body.plan] ? req.body.plan : null;
  if (!to) return back(res, u, 'Unknown plan.', 'error');
  const from = planOf(u);
  await db.update('users', u.id, { plan: to, status: 'active', planStartedAt: from === 'free' && to !== 'free' ? new Date().toISOString() : u.planStartedAt, canceledAt: null });
  await crm.logActivity({ userId: u.id, text: `Plan changed ${content.plans[from].name} → ${content.plans[to].name}`, by: req.user.email });
  webhooks.fire('plan_changed', { user: { id: u.id, email: u.email, name: u.name }, from, to, by: req.user.email });
  back(res, u, `Moved to ${content.plans[to].name}.`);
}));

router.post('/:id/status', h(loadMember), h(async (req, res) => {
  const u = req.member;
  if (req.body.action === 'cancel') {
    await db.update('users', u.id, { status: 'canceled', canceledAt: new Date().toISOString() });
    await crm.logActivity({ userId: u.id, text: `Subscription canceled by admin${req.body.reason ? ` — ${req.body.reason}` : ''}`, by: req.user.email });
    webhooks.fire('subscription_canceled', { user: { id: u.id, email: u.email, name: u.name }, plan: u.plan, by: req.user.email, reason: req.body.reason || null });
    return back(res, u, 'Subscription canceled — member now has Free access.');
  }
  if (req.body.action === 'reactivate') {
    await db.update('users', u.id, { status: 'active', canceledAt: null });
    await crm.logActivity({ userId: u.id, text: 'Subscription reactivated', by: req.user.email });
    return back(res, u, 'Subscription reactivated.');
  }
  back(res, u, 'Unknown action.', 'error');
}));

router.post('/:id/comp', h(loadMember), h(async (req, res) => {
  const u = req.member;
  await db.update('users', u.id, { comp: !u.comp });
  await crm.logActivity({ userId: u.id, text: u.comp ? 'Complimentary access removed' : 'Marked as complimentary (excluded from MRR)', by: req.user.email });
  back(res, u, u.comp ? 'No longer complimentary.' : 'Marked complimentary.');
}));

router.post('/:id/tags', h(loadMember), h(async (req, res) => {
  const tags = [...new Set(String(req.body.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  await db.update('users', req.member.id, { tags });
  back(res, req.member, 'Tags saved.');
}));

router.post('/:id/reset', h(loadMember), h(async (req, res) => {
  await email.send(req.member.email, 'password_reset', { by: 'admin' });
  await crm.logActivity({ userId: req.member.id, text: 'Password reset email sent', by: req.user.email });
  back(res, req.member, 'Password reset email queued.');
}));

module.exports = router;
