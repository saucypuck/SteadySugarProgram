const express = require('express');
const db = require('../db');
const content = require('../content');
const sched = require('../scheduling');
const meetings = require('../integrations/meetings');
const payments = require('../integrations/payments');
const email = require('../integrations/email');
const { requireAuth, planOf, tierAllows, canOpenLesson } = require('../auth');
const { track } = require('../track');

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
// Access state + progress for one course, from this user's point of view.
function decorate(user, c) {
  const done = new Set(user.completedLessons || []);
  const unlocked = tierAllows(user, c.tier);
  const lessons = c.lessons.map((l, i) => ({
    ...l,
    index: i,
    done: done.has(lessonKey(c, l)),
    open: canOpenLesson(user, c, l),
  }));
  const openLessons = lessons.filter((l) => l.open);
  const next = openLessons.find((l) => !l.done) || null;
  const freeCount = c.lessons.filter((l) => l.free).length;
  return {
    ...c,
    lessons,
    cat: content.categoryById[c.category],
    unlocked,
    state: unlocked ? 'unlocked' : openLessons.length ? 'preview' : 'locked',
    freeCount,
    next,
    progress: courseProgress(user, c),
    needPlan: content.plans[c.tier],
  };
}

// Turn a YouTube/Vimeo/mp4 URL into something the page can play.
function trailerEmbed(url) {
  if (!url) return null;
  let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/);
  if (m) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return { kind: 'iframe', src: `https://player.vimeo.com/video/${m[1]}` };
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(url)) return { kind: 'video', src: url };
  return null;
}

router.get('/courses', (req, res) => {
  const all = content.courses.map((c) => decorate(req.user, c));
  const cat = content.categoryById[req.query.cat] ? req.query.cat : null;
  const bundle = content.bundles.find((b) => b.id === req.query.bundle) || null;
  const tag = req.query.tag ? String(req.query.tag).slice(0, 40) : null;
  let list = all;
  if (cat) list = list.filter((c) => c.category === cat);
  if (bundle) list = list.filter((c) => c.tags.includes(bundle.tag));
  if (tag) list = list.filter((c) => c.tags.includes(tag));
  const groups = content.courseCategories
    .map((g) => ({ ...g, courses: list.filter((c) => c.category === g.id) }))
    .filter((g) => g.courses.length);
  res.render('app/courses', {
    title: 'Courses',
    groups,
    filtered: !!(cat || bundle || tag),
    active: { cat, bundle, tag },
    inProgress: all.filter((c) => c.progress.done > 0 && c.next).slice(0, 3),
    counts: Object.fromEntries(content.courseCategories.map((g) => [g.id, all.filter((c) => c.category === g.id).length])),
    totalCourses: all.length,
    freeLessons: all.reduce((n, c) => n + c.freeCount, 0),
  });
});

function findLesson(req) {
  const course = content.courses.find((c) => c.slug === req.params.course);
  if (!course) return {};
  const idx = req.params.lesson ? course.lessons.findIndex((l) => l.slug === req.params.lesson) : 0;
  return { course, lesson: course.lessons[idx], idx };
}

// Course landing page: trailer, description, outcomes, tags/bundles, lesson menu.
router.get('/courses/:course', (req, res, next) => {
  const raw = content.courses.find((c) => c.slug === req.params.course);
  if (!raw) return next();
  const course = decorate(req.user, raw);
  const related = content.courses
    .filter((c) => c.slug !== raw.slug && inLibrary(req.user, c))
    .map((c) => ({ c, score: (c.category === raw.category ? 2 : 0) + c.tags.filter((t) => raw.tags.includes(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => decorate(req.user, x.c));
  const modules = raw.modules.map((m) => ({ title: m.title, lessons: course.lessons.filter((l) => l.module === m.title) }));
  res.render('app/course', {
    title: course.title,
    course,
    modules,
    related,
    inBundles: content.bundles.filter((b) => raw.tags.includes(b.tag)),
    trailer: trailerEmbed(raw.trailer && raw.trailer.url),
    counts: { videos: course.lessons.filter((l) => l.type === 'video').length, worksheets: course.lessons.filter((l) => l.type === 'worksheet').length, readings: course.lessons.filter((l) => l.type === 'reading').length },
  });
});

router.get('/courses/:course/:lesson', (req, res, next) => {
  const { course, lesson, idx } = findLesson(req);
  if (!course || !lesson) return next();
  if (!canOpenLesson(req.user, course, lesson)) return res.render('app/locked', { title: lesson.title, course, lesson });
  const done = (req.user.completedLessons || []);
  res.render('app/lesson', {
    title: lesson.title,
    cat: content.categoryById[course.category],
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
  res.redirect(`/app/courses/${course.slug}`);
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
  await db.update('users', req.user.id, { status: 'canceled', canceledAt: new Date().toISOString() });
  await track(req, 'subscription_canceled', { plan: req.user.plan });
  req.session.flash = { type: 'info', msg: 'Your subscription is canceled — you’re now on the Free plan. Rejoin anytime.' };
  res.redirect('/app/account');
}));

module.exports = router;
