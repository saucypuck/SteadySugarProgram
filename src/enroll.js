// Enrollment state for the two dated programs a member can run — one of each at a time:
//   user.program   = { planId, startDate, endDate, pairedWith, status, enrolledAt }   (Meal & Movement Plan)
//   user.blueprint = { slug, startDate, endDate, checks: { date: [taskId] }, checkins: [], status }
// Past runs are kept in programHistory / blueprintHistory.
const content = require('./content');
const plans = require('./plans');
const sched = require('./scheduling');

const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 864e5);

function nextMonday(from = sched.today()) {
  const dow = new Date(`${from}T12:00:00Z`).getUTCDay();
  return addDays(from, ((8 - dow) % 7) || 7);
}

// Start date from a form: today or later, max 60 days out; otherwise next Monday.
function cleanStart(value) {
  const today = sched.today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return nextMonday();
  if (value < today) return today;
  if (daysBetween(today, value) > 60) return addDays(today, 60);
  return value;
}

function stateOf(e) {
  if (!e || e.status === 'ended') return null;
  const today = sched.today();
  if (e.endDate < today) return 'completed';
  return e.startDate > today ? 'upcoming' : 'active';
}

function activeProgram(user) {
  const e = user.program;
  const state = stateOf(e);
  const plan = e && plans.planById[e.planId];
  if (!state || !plan) return null;
  const today = sched.today();
  const day = state === 'active' ? plans.dayOf(plan, e.startDate, today) : null;
  return { ...e, plan, state, today: day, daysLeft: daysBetween(today, e.endDate) + 1, startsIn: daysBetween(today, e.startDate) };
}

function activeBlueprint(user) {
  const e = user.blueprint;
  const state = stateOf(e);
  const course = e && content.courses.find((c) => c.slug === e.slug && c.blueprint);
  if (!state || !course) return null;
  const bp = course.blueprint;
  const today = sched.today();
  const checks = e.checks || {};
  const total = bp.daily.length;
  const lastDay = today < e.endDate ? today : e.endDate;
  const days = [];
  for (let d = e.startDate; d <= e.endDate; d = addDays(d, 1)) {
    const done = (checks[d] || []).filter((id) => bp.daily.some((t) => t.id === id)).length;
    days.push({ date: d, done, total, complete: done === total, future: d > today, today: d === today, dayNumber: daysBetween(e.startDate, d) + 1 });
  }
  const elapsed = days.filter((d) => d.date <= lastDay);
  // Streak: consecutive complete days ending today (or yesterday if today isn't done yet).
  let streak = 0;
  for (let i = elapsed.length - 1; i >= 0; i--) {
    if (elapsed[i].complete) streak++;
    else if (elapsed[i].today) continue;
    else break;
  }
  const dayNumber = state === 'active' ? daysBetween(e.startDate, today) + 1 : state === 'upcoming' ? 0 : bp.days;
  const week = Math.min(bp.weeks.length, Math.max(1, Math.ceil(dayNumber / 7)));
  const checkins = e.checkins || [];
  const checkinDone = checkins.some((c) => c.week === week);
  const dayInWeek = ((dayNumber - 1) % 7) + 1;
  return {
    ...e,
    course,
    bp,
    state,
    days,
    todayChecks: checks[today] || [],
    dayNumber,
    week,
    milestone: bp.weeks[week - 1],
    streak,
    completion: elapsed.length ? Math.round((elapsed.reduce((n, d) => n + d.done, 0) / (elapsed.length * total)) * 100) : 0,
    completeDays: elapsed.filter((d) => d.complete).length,
    checkins,
    checkinDue: state !== 'upcoming' && !checkinDone && (dayInWeek >= 6 || state === 'completed'),
    checkinDone,
    startsIn: daysBetween(today, e.startDate),
  };
}

module.exports = { addDays, daysBetween, nextMonday, cleanStart, activeProgram, activeBlueprint };
