// Admin → CRM: lead pipeline, follow-up tasks, notes. Notes/tasks attach to either
// a lead or a member (subjectType 'lead' | 'user').
const express = require('express');
const db = require('../db');
const content = require('../content');
const crm = require('../crm');
const sched = require('../scheduling');
const { planOf, isAdmin } = require('../auth');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const safeBack = (b) => (typeof b === 'string' && /^\/admin(\/|$)/.test(b) ? b : '/admin/crm');

async function subjects() {
  const [users, leads] = await Promise.all([db.all('users'), db.all('leads')]);
  const byEmail = Object.fromEntries(users.filter((u) => !isAdmin(u)).map((u) => [u.email, u]));
  const names = {};
  for (const u of users) names[`user:${u.id}`] = { name: u.name || u.email, href: `/admin/members/${u.id}`, kind: 'Member' };
  for (const l of leads) names[`lead:${l.id}`] = { name: l.name || l.email, href: `/admin/crm/leads/${l.id}`, kind: 'Lead' };
  return { users, leads, byEmail, names };
}

router.get('/', h(async (req, res) => {
  const { leads, byEmail, names } = await subjects();
  const tasks = await crm.openTasks();
  const temp = req.query.temp || 'all';
  const cards = leads
    .filter((l) => temp === 'all' || l.temperature === temp)
    .map((l) => ({ ...l, stage: crm.leadStage(l), member: l.convertedUserId ? { id: l.convertedUserId } : byEmail[l.email] || null }));
  const columns = crm.LEAD_STAGES.map((s) => ({ ...s, cards: cards.filter((c) => c.stage === s.id) }));
  const open = cards.filter((c) => !['won', 'lost'].includes(c.stage));
  const decided = cards.filter((c) => ['won', 'lost'].includes(c.stage));
  res.render('admin/crm', {
    title: 'CRM',
    columns,
    temp,
    tasks,
    names,
    today: sched.today(),
    stats: {
      open: open.length,
      hot: open.filter((c) => c.temperature === 'hot').length,
      winRate: decided.length ? Math.round((decided.filter((c) => c.stage === 'won').length / decided.length) * 100) : null,
      overdue: tasks.overdue.length,
    },
  });
}));

router.get('/leads/:id', h(async (req, res, next) => {
  const lead = await db.get('leads', req.params.id);
  if (!lead) return next();
  const [notes, tasks, member, bookings] = await Promise.all([
    crm.notesFor('lead', lead.id),
    crm.tasksFor('lead', lead.id),
    lead.convertedUserId ? db.get('users', lead.convertedUserId) : db.findOneBy('users', 'email', lead.email),
    db.findBy('bookings', 'email', lead.email),
  ]);
  const activity = (await db.findBy('activity', 'leadId', lead.id));
  res.render('admin/lead', {
    title: lead.name || lead.email,
    lead: { ...lead, stage: crm.leadStage(lead) },
    stages: crm.LEAD_STAGES,
    notes, tasks, member, bookings, activity,
    memberTier: member ? planOf(member) : null,
    quiz: content.quiz,
    today: sched.today(),
  });
}));

router.post('/leads/:id/stage', h(async (req, res, next) => {
  const lead = await db.get('leads', req.params.id);
  const stage = crm.LEAD_STAGES.find((s) => s.id === req.body.stage);
  if (!lead || !stage) return next();
  await db.update('leads', lead.id, { stage: stage.id, lostReason: stage.id === 'lost' ? String(req.body.lostReason || '').slice(0, 200) : null });
  await crm.logActivity({ leadId: lead.id, text: `Stage → ${stage.label}${stage.id === 'lost' && req.body.lostReason ? ` (${req.body.lostReason})` : ''}`, by: req.user.email });
  req.session.flash = { type: 'success', msg: `Moved to ${stage.label}.` };
  res.redirect(safeBack(req.body.back || `/admin/crm/leads/${lead.id}`));
}));

// ---- Notes & tasks (shared by leads and members) -------------------------------
const validSubject = (t) => t === 'lead' || t === 'user';

router.post('/notes', h(async (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 2000);
  if (validSubject(req.body.subjectType) && req.body.subjectId && body) {
    await db.insert('notes', { subjectType: req.body.subjectType, subjectId: req.body.subjectId, body, by: req.user.email });
  }
  res.redirect(safeBack(req.body.back));
}));

router.post('/tasks', h(async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 200);
  if (validSubject(req.body.subjectType) && req.body.subjectId && title) {
    await db.insert('tasks', {
      subjectType: req.body.subjectType,
      subjectId: req.body.subjectId,
      title,
      due: /^\d{4}-\d{2}-\d{2}$/.test(req.body.due) ? req.body.due : null,
      done: false,
      by: req.user.email,
    });
  }
  res.redirect(safeBack(req.body.back));
}));

router.post('/tasks/:id/toggle', h(async (req, res) => {
  const t = await db.get('tasks', req.params.id);
  if (t) await db.update('tasks', t.id, { done: !t.done, doneAt: t.done ? null : new Date().toISOString(), doneBy: req.user.email });
  res.redirect(safeBack(req.body.back));
}));

module.exports = router;
