// CRM essentials shared by members and leads: notes, follow-up tasks, activity
// log, lead pipeline stages, and a unified timeline.
const db = require('./db');
const { isoDate } = require('./scheduling');

const LEAD_STAGES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'call_booked', label: 'Call booked' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' },
];

// Converted/booked leads move themselves forward; otherwise use the stage set by the team.
function leadStage(lead) {
  if (lead.convertedUserId) return 'won';
  if (lead.stage) return lead.stage;
  return lead.bookedCall ? 'call_booked' : 'new';
}

async function logActivity({ userId = null, leadId = null, text, by = null }) {
  return db.insert('activity', { userId, leadId, text, by });
}

async function notesFor(subjectType, subjectId) {
  return (await db.findBy('notes', 'subjectId', subjectId)).filter((n) => n.subjectType === subjectType);
}

async function tasksFor(subjectType, subjectId) {
  return (await db.findBy('tasks', 'subjectId', subjectId))
    .filter((t) => t.subjectType === subjectType)
    .sort((a, b) => Number(a.done) - Number(b.done) || String(a.due).localeCompare(String(b.due)));
}

// Open tasks across the business, bucketed for the CRM home.
async function openTasks() {
  const today = isoDate(new Date());
  const open = (await db.all('tasks')).filter((t) => !t.done).sort((a, b) => String(a.due).localeCompare(String(b.due)));
  return {
    overdue: open.filter((t) => t.due && t.due < today),
    today: open.filter((t) => t.due === today),
    upcoming: open.filter((t) => !t.due || t.due > today),
    all: open,
  };
}

const EVENT_LABELS = {
  signup_free: 'Created a free account',
  quiz_complete: 'Completed the quiz',
  checkout_view: 'Viewed checkout',
  purchase: 'Purchased',
  lp_view: 'Visited a landing page',
  discovery_booked: 'Booked a discovery call',
};

// Everything that happened with a member, newest first.
async function memberTimeline(user) {
  const [events, orders, bookings, notes, activity] = await Promise.all([
    db.findBy('events', 'userId', user.id),
    db.findBy('orders', 'userId', user.id),
    db.findBy('bookings', 'userId', user.id),
    notesFor('user', user.id),
    db.findBy('activity', 'userId', user.id),
  ]);
  const items = [
    { at: user.createdAt, icon: '👋', text: 'Account created' },
    ...events.filter((e) => EVENT_LABELS[e.name] && e.name !== 'purchase').map((e) => ({ at: e.createdAt, icon: '•', text: EVENT_LABELS[e.name] })),
    ...orders.map((o) => ({ at: o.createdAt, icon: '💳', text: `Payment $${o.amount} — ${o.plan} (${o.status})` })),
    ...bookings.map((b) => ({ at: b.createdAt, icon: '📅', text: `Booked ${b.type} call for ${b.date} ${b.time} (${b.status})` })),
    ...notes.map((n) => ({ at: n.createdAt, icon: '📝', text: n.body, by: n.by, note: true })),
    ...activity.map((a) => ({ at: a.createdAt, icon: '⚙️', text: a.text, by: a.by })),
  ];
  return items.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 50);
}

module.exports = { LEAD_STAGES, leadStage, logActivity, notesFor, tasksFor, openTasks, memberTimeline };
