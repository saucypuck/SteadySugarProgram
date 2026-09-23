const express = require('express');
const db = require('../db');
const content = require('../content');
const sched = require('../scheduling');
const meetings = require('../integrations/meetings');
const payments = require('../integrations/payments');
const email = require('../integrations/email');
const { requireAuth, planOf, tierAllows, canOpenLesson } = require('../auth');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use((req, res, next) => {
  res.locals.variant = 'app';
  next();
});

// Every account (free included) gets into the member area; content is gated per lesson/feature.
router.use(requireAuth);

// Courses a user can see in their library: everything up to Core, plus VIP courses for VIPs.
const inLibrary = (user, course) => course.tier !== 'vip' || tierAllows(user, 'vip');
const lessonKey = (course, lesson) => `${course.slug}/${lesson.slug}`;

function programWeek(user) {
  const start = new Date(user.planStartedAt || user.createdAt).getTime();
  return Math.min(content.brand.programWeeks, Math.floor((Date.now() - start) / (7 * 864e5)) + 1);
}

function courseProgress(user, course) {
  const done = course.lessons.filter((l) => (user.completedLessons || []).includes(lessonKey(course, l))).length;
  return { done, total: course.lessons.length, pct: Math.round((done / course.lessons.length) * 100) };
}

// First unfinished lesson in the library. `locked` = free user has hit the paywall.
function nextLesson(user) {
  for (const course of content.courses) {
    if (!inLibrary(user, course)) continue;
    const lesson = course.lessons.find((l) => !(user.completedLessons || []).includes(lessonKey(course, l)));
    if (lesson) return { course, lesson, locked: !canOpenLesson(user, course, lesson) };
  }
  return null;
}

async function callQuota(user) {
  const plan = content.plans[planOf(user)];
  const allowed = plan.callsPerMonth;
  const month = sched.isoDate(new Date()).slice(0, 7);
  const mine = await db.findBy('bookings', 'userId', user.id);
  const used = mine.filter((b) => b.type === 'coaching' && b.status === 'booked' && b.date.startsWith(month)).length;
  const hadKickoff = mine.some((b) => b.type === 'kickoff' && b.status !== 'canceled');
  return { plan, allowed, used, remaining: Math.max(0, allowed - used), hadKickoff, mine };
}

// Sparkline points for an inline SVG.
function sparkline(values, w = 280, hgt = 60) {
  if (values.length < 2) return '';
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  return values
    .map((v, i) => `${Math.round((i / (values.length - 1)) * w)},${Math.round(hgt - ((v - min) / (max - min)) * hgt)}`)
    .join(' ');
}

// ---- Dashboard ------------------------------------------------------------
router.get('/', h(async (req, res) => {
  const user = req.user;
  const logs = (await db.findBy('logs', 'userId', user.id)).sort((a, b) => a.date.localeCompare(b.date));
  const quota = await callQuota(user);
  const upcoming = quota.mine.filter(sched.isUpcoming).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const accessible = content.courses.filter((c) => inLibrary(user, c));
  const totals = accessible.reduce((acc, c) => { const p = courseProgress(user, c); acc.done += p.done; acc.total += p.total; return acc; }, { done: 0, total: 0 });
  const fasting = logs.filter((l) => l.fasting).map((l) => Number(l.fasting));
  res.render('app/dashboard', {
    title: 'Dashboard',
    week: programWeek(user),
    next: nextLesson(user),
    upcoming,
    quota,
    totals,
    latest: logs[logs.length - 1] || null,
    fastingSpark: sparkline(fasting.slice(-14)),
    fastingChange: fasting.length > 1 ? fasting[fasting.length - 1] - fasting[0] : null,
    roadmapIndex: [2, 6, 10, 12].findIndex((end) => programWeek(user) <= end),
  });
}));

// ---- Courses ---------------------------------------------------------------
router.get('/courses', (req, res) => {
  const courses = content.courses.map((c) => ({
    ...c,
    unlocked: tierAllows(req.user, c.tier),
    freeCount: c.lessons.filter((l) => l.free).length,
    progress: courseProgress(req.user, c),
  }));
  res.render('app/courses', { title: 'Courses', courses });
});

function findLesson(req) {
  const course = content.courses.find((c) => c.slug === req.params.course);
  if (!course) return {};
  const idx = req.params.lesson ? course.lessons.findIndex((l) => l.slug === req.params.lesson) : 0;
  return { course, lesson: course.lessons[idx], idx };
}

router.get('/courses/:course', (req, res, next) => {
  const { course } = findLesson(req);
  if (!course) return next();
  const open = course.lessons.filter((l) => canOpenLesson(req.user, course, l));
  if (!open.length) return res.render('app/locked', { title: course.title, course, lesson: null });
  const resume = open.find((l) => !(req.user.completedLessons || []).includes(lessonKey(course, l))) || open[0];
  res.redirect(`/app/courses/${course.slug}/${resume.slug}`);
});

router.get('/courses/:course/:lesson', (req, res, next) => {
  const { course, lesson, idx } = findLesson(req);
  if (!course || !lesson) return next();
  if (!canOpenLesson(req.user, course, lesson)) return res.render('app/locked', { title: lesson.title, course, lesson });
  const done = (req.user.completedLessons || []);
  res.render('app/lesson', {
    title: lesson.title,
    course,
    lesson,
    idx,
    prev: course.lessons[idx - 1],
    next: course.lessons[idx + 1],
    isDone: (l) => done.includes(lessonKey(course, l)),
    canOpen: (l) => canOpenLesson(req.user, course, l),
    progress: courseProgress(req.user, course),
  });
});

router.post('/courses/:course/:lesson/complete', h(async (req, res, next) => {
  const { course, lesson, idx } = findLesson(req);
  if (!course || !lesson || !canOpenLesson(req.user, course, lesson)) return next();
  const key = lessonKey(course, lesson);
  const done = new Set(req.user.completedLessons || []);
  done.add(key);
  await db.update('users', req.user.id, { completedLessons: [...done] });
  const nxt = course.lessons[idx + 1];
  if (nxt) return res.redirect(`/app/courses/${course.slug}/${nxt.slug}`);
  req.session.flash = { type: 'success', msg: `Course complete: ${course.title}! 🎉` };
  res.redirect('/app/courses');
}));

// ---- Plans -------------------------------------------------------------------
router.get('/plans', (req, res) => res.redirect('/app/plans/nutrition'));
// Free tier sees a sample; the full plans unlock with Core.
router.get('/plans/nutrition', (req, res) => res.render('app/nutrition', { title: 'Nutrition plan', plan: content.nutritionPlan, full: tierAllows(req.user, 'core') }));
router.get('/plans/workout', (req, res) => res.render('app/workout', { title: 'Workout plan', plan: content.workoutPlan, week: programWeek(req.user), full: tierAllows(req.user, 'core') }));

// ---- Calendar / call scheduling ------------------------------------------------
router.get('/calendar', h(async (req, res) => {
  const quota = await callQuota(req.user);
  // VIPs start with a kickoff call; after that (and for Core), monthly coaching calls.
  const type = quota.plan.kickoff && !quota.hadKickoff ? 'kickoff' : 'coaching';
  const canBook = type === 'kickoff' || quota.remaining > 0;
  const days = sched.availability(await db.all('bookings'));
  const mine = quota.mine.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  res.render('app/calendar', {
    title: 'Calls',
    type: sched.CALL_TYPES[type],
    days,
    quota,
    canBook,
    onboarding: req.query.onboarding === '1',
    upcoming: mine.filter(sched.isUpcoming).reverse(),
    past: mine.filter((b) => !sched.isUpcoming(b)),
  });
}));

router.post('/calendar', h(async (req, res) => {
  const [date, time] = String(req.body.slot || '').split('|');
  const type = req.body.type === 'kickoff' ? 'kickoff' : 'coaching';
  const quota = await callQuota(req.user);
  if (type === 'kickoff' && (quota.hadKickoff || !quota.plan.kickoff)) {
    req.session.flash = { type: 'error', msg: 'You’ve already booked your kickoff call.' };
    return res.redirect('/app/calendar');
  }
  if (type === 'coaching' && quota.remaining < 1) {
    req.session.flash = { type: 'error', msg: 'You’ve used this month’s calls. Upgrade for more.' };
    return res.redirect('/app/calendar');
  }
  const days = sched.availability(await db.all('bookings'));
  if (!days.some((d) => d.date === date && d.slots.includes(time))) {
    req.session.flash = { type: 'error', msg: 'That time isn’t available — please pick another.' };
    return res.redirect('/app/calendar');
  }
  let booking = await db.insert('bookings', {
    userId: req.user.id, name: req.user.name, email: req.user.email,
    type, date, time, status: 'booked', notes: String(req.body.notes || '').slice(0, 1000),
  });
  const meeting = await meetings.createMeeting({ booking });
  booking = await db.update('bookings', booking.id, { joinUrl: meeting.joinUrl });
  await email.send(req.user.email, 'booking_confirmed', { date, time, type });
  req.session.flash = { type: 'success', msg: `Booked: ${sched.CALL_TYPES[type].name} on ${sched.formatDate(date)} at ${sched.formatTime(time)} ${content.brand.timezoneLabel}.` };
  res.redirect(req.body.onboarding === '1' ? '/app?welcome=1' : '/app/calendar');
}));

router.post('/calendar/:id/cancel', h(async (req, res) => {
  const b = await db.get('bookings', req.params.id);
  if (b && b.userId === req.user.id) await db.update('bookings', b.id, { status: 'canceled' });
  req.session.flash = { type: 'info', msg: 'Call canceled.' };
  res.redirect('/app/calendar');
}));

// ---- Tracker -----------------------------------------------------------------
router.get('/log', h(async (req, res) => {
  const logs = (await db.findBy('logs', 'userId', req.user.id)).sort((a, b) => b.date.localeCompare(a.date));
  const asc = [...logs].reverse();
  res.render('app/log', {
    title: 'Tracker',
    logs,
    today: sched.isoDate(new Date()),
    fastingSpark: sparkline(asc.filter((l) => l.fasting).map((l) => Number(l.fasting)).slice(-30), 600, 120),
    postSpark: sparkline(asc.filter((l) => l.postMeal).map((l) => Number(l.postMeal)).slice(-30), 600, 120),
  });
}));

router.post('/log', h(async (req, res) => {
  const num = (v) => (v === '' || v == null ? null : Math.max(0, Math.min(100000, Number(v)) || 0));
  await db.insert('logs', {
    userId: req.user.id,
    date: /^\d{4}-\d{2}-\d{2}$/.test(req.body.date) ? req.body.date : sched.isoDate(new Date()),
    fasting: num(req.body.fasting),
    postMeal: num(req.body.postMeal),
    weight: num(req.body.weight),
    steps: num(req.body.steps),
    notes: String(req.body.notes || '').slice(0, 500),
  });
  req.session.flash = { type: 'success', msg: 'Entry saved. Nice work staying consistent.' };
  res.redirect(req.body.from === 'dashboard' ? '/app' : '/app/log');
}));

// ---- Account & billing -----------------------------------------------------------
router.get('/account', h(async (req, res) => {
  const orders = await db.findBy('orders', 'userId', req.user.id);
  res.render('app/account', { title: 'Account', orders, plan: content.plans[planOf(req.user)] });
}));

router.post('/account/cancel', h(async (req, res) => {
  // TODO(retention): route through a save flow (pause / downgrade offer) before cancelling.
  await payments.cancelSubscription(req.user);
  await db.update('users', req.user.id, { status: 'canceled' });
  req.session.flash = { type: 'info', msg: 'Your subscription is canceled — you’re now on the Free plan. Rejoin anytime.' };
  res.redirect('/app/account');
}));

module.exports = router;
