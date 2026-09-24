const express = require('express');
const db = require('../db');
const content = require('../content');
const sched = require('../scheduling');
const meetings = require('../integrations/meetings');
const payments = require('../integrations/payments');
const email = require('../integrations/email');
const { requireAuth, planOf, tierAllows, canOpenLesson } = require('../auth');
const { track } = require('../track');
const crypto = require('crypto');
const schedule = require('../schedule');
const plans = require('../plans');
const enroll = require('../enroll');
const crm = require('../crm');
const ics = require('../ics');

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
  const month = sched.today().slice(0, 7);
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
  const today = sched.today();
  const lead = user.leadId ? await db.get('leads', user.leadId) : null;
  const todays = schedule.buildEvents(user, schedule.getSchedule(user, lead), { from: today, to: today, bookings: quota.mine });
  res.render('app/dashboard', {
    todays,
    program: tierAllows(user, 'core') ? enroll.activeProgram(user) : null,
    blueprint: tierAllows(user, 'core') ? enroll.activeBlueprint(user) : null,
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
router.get('/courses/:course', h(async (req, res, next) => {
  const raw = content.courses.find((c) => c.slug === req.params.course);
  if (!raw) return next();
  const lead = req.user.leadId ? await db.get('leads', req.user.leadId) : null;
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
    inPlan: schedule.getSchedule(req.user, lead).courses.includes(raw.slug),
    activeBp: enroll.activeBlueprint(req.user),
    activeProg: enroll.activeProgram(req.user),
    counts: { videos: course.lessons.filter((l) => l.type === 'video').length, worksheets: course.lessons.filter((l) => l.type === 'worksheet').length, readings: course.lessons.filter((l) => l.type === 'reading').length },
  });
}));

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
  req.session.flash = { type: 'success', msg: `Course complete: ${course.title}. Well done.` };
  res.redirect(`/app/courses/${course.slug}`);
}));

// ---- Meal & Movement Plans --------------------------------------------------------
// One plan at a time with fixed start/end dates. Free members can browse, take the
// finder quiz and see a sample day; enrolling requires Core.
const planCtx = (req) => ({ full: tierAllows(req.user, 'core'), program: enroll.activeProgram(req.user), blueprint: enroll.activeBlueprint(req.user) });

router.get('/plans', (req, res) => {
  const ctx = planCtx(req);
  const browse = req.query.browse === '1' || !ctx.program;
  const quiz = req.user.planQuiz || null;
  const ranked = quiz ? plans.scorePlans(quiz.answers) : null;
  let week = null;
  if (ctx.program && !browse) {
    const start = ctx.program.state === 'upcoming' ? ctx.program.startDate : sched.today();
    week = [];
    for (let i = 0; i < 7; i++) {
      const date = enroll.addDays(start, i);
      const info = plans.dayOf(ctx.program.plan, ctx.program.startDate, date);
      if (info) week.push({ date, label: sched.formatDate(date), isToday: date === sched.today(), ...info });
    }
  }
  res.render('app/plans', { title: 'Plans', tab: 'plans', ...ctx, browse, week, plans: plans.PLANS, recommendedId: ranked ? ranked[0].plan.id : null, history: req.user.programHistory || [] });
});

router.get('/plans/nutrition', (req, res) => res.redirect('/app/plans'));
router.get('/plans/workout', (req, res) => res.redirect('/app/plans'));

router.get('/plans/quiz', (req, res) => res.render('app/plan-quiz', { title: 'Find your plan', tab: 'plans', quiz: plans.PLAN_QUIZ, prev: (req.user.planQuiz || {}).answers || {} }));

router.post('/plans/quiz', h(async (req, res) => {
  const answers = {};
  for (const q of plans.PLAN_QUIZ) answers[q.id] = q.options.some(([v]) => v === req.body[q.id]) ? req.body[q.id] : q.options[0][0];
  await db.update('users', req.user.id, { planQuiz: { answers, at: new Date().toISOString() } });
  res.redirect('/app/plans/match');
}));

router.get('/plans/match', (req, res) => {
  const quiz = req.user.planQuiz;
  if (!quiz) return res.redirect('/app/plans/quiz');
  const ranked = plans.scorePlans(quiz.answers);
  const pairing = plans.suggestPairing(quiz.answers);
  const bySlug = (slug) => content.courses.find((c) => c.slug === slug);
  res.render('app/plan-match', { title: 'Your plan match', tab: 'plans', ...planCtx(req), top: ranked[0], others: ranked.slice(1, 3), pairCourse: bySlug(pairing.course), pairBlueprint: bySlug(pairing.blueprint) });
});

function pairOptions(user) {
  return {
    courses: content.courses.filter((c) => !c.blueprint && inLibrary(user, c) && c.lessons.some((l) => canOpenLesson(user, c, l))),
    blueprints: content.courses.filter((c) => c.blueprint && tierAllows(user, c.tier)),
  };
}

router.get('/plans/:id', (req, res, next) => {
  const plan = plans.planById[req.params.id];
  if (!plan) return next();
  const ctx = planCtx(req);
  const quiz = req.user.planQuiz;
  const match = quiz ? plans.scorePlans(quiz.answers).find((r) => r.plan.id === plan.id) : null;
  const pairing = quiz ? plans.suggestPairing(quiz.answers) : { course: 'foundations', blueprint: 'steady-5' };
  const sample = [];
  for (let i = 0; i < 7; i++) sample.push(plans.dayOf(plan, '2026-01-05', enroll.addDays('2026-01-05', i))); // Mon–Sun
  res.render('app/plan', { title: plan.name, tab: 'plans', ...ctx, plan, match, sample, WORKOUTS: plans.WORKOUTS, defaultStart: enroll.nextMonday(), defaultEnd: plans.endDate(plan, enroll.nextMonday()), today: sched.today(), pair: pairOptions(req.user), pairing, isCurrent: ctx.program && ctx.program.planId === plan.id });
});

router.post('/plans/:id/enroll', h(async (req, res, next) => {
  const plan = plans.planById[req.params.id];
  if (!plan) return next();
  if (!tierAllows(req.user, 'core')) {
    req.session.flash = { type: 'info', msg: 'Meal & Movement Plans are included with Core. Upgrade to enroll.' };
    return res.redirect('/checkout?plan=core');
  }
  const u = req.user;
  const startDate = enroll.cleanStart(req.body.startDate);
  const patch = {
    program: { planId: plan.id, startDate, endDate: plans.endDate(plan, startDate), pairedWith: req.body.pair || null, status: 'active', enrolledAt: new Date().toISOString() },
  };
  const current = enroll.activeProgram(u);
  if (current) patch.programHistory = [...(u.programHistory || []), { ...u.program, status: current.state === 'completed' ? 'completed' : 'switched', endedAt: sched.today() }];

  // Line up a course or blueprint with the plan's start date.
  const [kind, slug] = String(req.body.pair || '').split(':');
  const paired = content.courses.find((c) => c.slug === slug);
  let note = '';
  if (kind === 'course' && paired && !paired.blueprint) {
    const lead = u.leadId ? await db.get('leads', u.leadId) : null;
    const sc = schedule.getSchedule(u, lead);
    const { recommended, isSetUp, ...saved } = sc;
    patch.schedule = { ...saved, courses: [paired.slug, ...sc.courses.filter((x) => x !== paired.slug)], lessonStart: startDate, updatedAt: new Date().toISOString() };
    note = ` ${paired.title} lessons start the same day.`;
  }
  if (kind === 'blueprint' && paired && paired.blueprint && tierAllows(u, paired.tier)) {
    const bpNow = enroll.activeBlueprint(u);
    if (!bpNow || bpNow.state === 'completed' || req.body.replaceBlueprint === 'on') {
      if (bpNow) patch.blueprintHistory = [...(u.blueprintHistory || []), { ...u.blueprint, status: bpNow.state === 'completed' ? 'completed' : 'switched' }];
      patch.blueprint = { slug: paired.slug, startDate, endDate: enroll.addDays(startDate, paired.blueprint.days - 1), checks: {}, checkins: [], status: 'active', enrolledAt: new Date().toISOString() };
      note = ` ${paired.title} starts the same day.`;
    } else note = ` (You already have ${bpNow.course.title} running, so it wasn’t changed.)`;
  }
  await db.update('users', u.id, patch);
  await crm.logActivity({ userId: u.id, text: `Enrolled in ${plan.name} (${startDate} → ${patch.program.endDate})${paired ? ` paired with ${paired.title}` : ''}` });
  await track(req, 'plan_enrolled', { planId: plan.id, startDate, pairedWith: req.body.pair || null });
  req.session.flash = { type: 'success', msg: `You’re enrolled in ${plan.name}, ${sched.formatDate(startDate)} – ${sched.formatDate(patch.program.endDate)}.${note} It’s on your calendar.` };
  res.redirect('/app/plans');
}));

router.post('/plans/end', h(async (req, res) => {
  const current = enroll.activeProgram(req.user);
  if (current) {
    await db.update('users', req.user.id, { program: null, programHistory: [...(req.user.programHistory || []), { ...req.user.program, status: current.state === 'completed' ? 'completed' : 'ended', endedAt: sched.today() }] });
    await crm.logActivity({ userId: req.user.id, text: `Ended ${current.plan.name} early` });
  }
  req.session.flash = { type: 'info', msg: 'Plan ended. Pick a new one whenever you’re ready.' };
  res.redirect('/app/plans?browse=1');
}));

// ---- Blueprints: daily checklist, streaks, weekly check-ins ------------------------
router.get('/blueprint', (req, res) => {
  const ctx = planCtx(req);
  const list = content.courses.filter((c) => c.blueprint).map((c) => ({ ...c, unlocked: tierAllows(req.user, c.tier), cat: content.categoryById[c.category] }));
  res.render('app/blueprint', { title: 'Blueprint', tab: 'blueprint', ...ctx, list, today: sched.today(), history: req.user.blueprintHistory || [], hasCoach: content.plans[planOf(req.user)].callsPerMonth > 0 });
});

router.post('/blueprints/:slug/start', h(async (req, res, next) => {
  const course = content.courses.find((c) => c.slug === req.params.slug && c.blueprint);
  if (!course) return next();
  if (!tierAllows(req.user, course.tier)) return res.redirect(`/app/courses/${course.slug}`);
  const u = req.user;
  const prog = enroll.activeProgram(u);
  const startDate = req.body.align === 'plan' && prog ? (prog.startDate > sched.today() ? prog.startDate : sched.today()) : enroll.cleanStart(req.body.startDate || sched.today());
  const current = enroll.activeBlueprint(u);
  const patch = { blueprint: { slug: course.slug, startDate, endDate: enroll.addDays(startDate, course.blueprint.days - 1), checks: {}, checkins: [], status: 'active', enrolledAt: new Date().toISOString() } };
  if (current) patch.blueprintHistory = [...(u.blueprintHistory || []), { ...u.blueprint, status: current.state === 'completed' ? 'completed' : 'switched' }];
  await db.update('users', u.id, patch);
  await crm.logActivity({ userId: u.id, text: `Started blueprint: ${course.title} (${startDate})` });
  await track(req, 'blueprint_started', { blueprint: course.slug, startDate });
  req.session.flash = { type: 'success', msg: `${course.title} ${startDate > sched.today() ? `starts ${sched.formatDate(startDate)}` : 'starts today'} — your daily checklist is on your calendar.` };
  res.redirect('/app/blueprint');
}));

// Toggle a task. Today and yesterday only (grace for late-night check-offs).
router.post('/blueprint/check', h(async (req, res) => {
  const bp = enroll.activeBlueprint(req.user);
  const today = sched.today();
  const date = [today, enroll.addDays(today, -1)].includes(req.body.date) ? req.body.date : today;
  if (bp && bp.state === 'active' && date >= bp.startDate && bp.bp.daily.some((t) => t.id === req.body.task)) {
    const checks = { ...(req.user.blueprint.checks || {}) };
    const set = new Set(checks[date] || []);
    set.has(req.body.task) ? set.delete(req.body.task) : set.add(req.body.task);
    checks[date] = [...set];
    await db.update('users', req.user.id, { blueprint: { ...req.user.blueprint, checks } });
    if (set.size === bp.bp.daily.length && date === today) req.session.flash = { type: 'success', msg: `Day ${bp.dayNumber} complete. Current streak: ${bp.streak + (bp.days.find((d) => d.today && d.complete) ? 0 : 1)} days.` };
  }
  res.redirect(req.body.back === 'dashboard' ? '/app' : '/app/blueprint');
}));

router.post('/blueprint/checkin', h(async (req, res) => {
  const bp = enroll.activeBlueprint(req.user);
  if (bp && !bp.checkinDone) {
    const score = Math.max(1, Math.min(5, parseInt(req.body.score, 10) || 3));
    const entry = { week: bp.week, date: sched.today(), score, wins: String(req.body.wins || '').slice(0, 500), blockers: String(req.body.blockers || '').slice(0, 500), help: req.body.help === 'on' };
    await db.update('users', req.user.id, { blueprint: { ...req.user.blueprint, checkins: [...bp.checkins, entry] } });
    await crm.logActivity({ userId: req.user.id, text: `Blueprint check-in (${bp.course.title}, week ${bp.week}): ${score}/5 · ${bp.completion}% of tasks done${entry.blockers ? ` · Blocker: ${entry.blockers}` : ''}` });
    // Accountability: coached members who are struggling (or ask for help) get a coach follow-up.
    const coached = content.plans[planOf(req.user)].callsPerMonth > 0;
    if (coached && (score <= 2 || entry.help || bp.completion < 50)) {
      await db.insert('tasks', { subjectType: 'user', subjectId: req.user.id, title: `Reach out: ${req.user.name} ${entry.help ? 'asked for help' : 'is struggling'} with ${bp.course.title} (week ${bp.week}, ${score}/5)`, due: sched.today(), done: false, by: 'system' });
    }
    await track(req, 'blueprint_checkin', { blueprint: bp.slug, week: bp.week, score, completion: bp.completion });
    req.session.flash = { type: 'success', msg: coached ? 'Check-in sent — your coach will see it.' : 'Check-in saved. Thank you for reflecting on your week.' };
  }
  res.redirect('/app/blueprint');
}));

router.post('/blueprint/end', h(async (req, res) => {
  const bp = enroll.activeBlueprint(req.user);
  if (bp) {
    await db.update('users', req.user.id, { blueprint: null, blueprintHistory: [...(req.user.blueprintHistory || []), { ...req.user.blueprint, status: bp.state === 'completed' ? 'completed' : 'ended', endedAt: sched.today(), completion: bp.completion }] });
    await crm.logActivity({ userId: req.user.id, text: `${bp.state === 'completed' ? 'Finished' : 'Ended'} blueprint ${bp.course.title} (${bp.completion}% of tasks)` });
  }
  res.redirect('/app/blueprint');
}));

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
  res.redirect(req.body.onboarding === '1' ? '/app/schedule?welcome=1' : '/app/calendar');
}));

router.post('/calendar/:id/cancel', h(async (req, res) => {
  const b = await db.get('bookings', req.params.id);
  if (b && b.userId === req.user.id) await db.update('bookings', b.id, { status: 'canceled' });
  req.session.flash = { type: 'info', msg: 'Call canceled.' };
  res.redirect('/app/calendar');
}));

// ---- Calendar: my plan + week view + private feed -------------------------------
const baseUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
const newToken = () => crypto.randomBytes(24).toString('hex');

async function ensureToken(user) {
  if (user.calendarToken) return user.calendarToken;
  const token = newToken();
  await db.update('users', user.id, { calendarToken: token });
  return token;
}

router.get('/schedule', h(async (req, res) => {
  const user = req.user;
  const token = await ensureToken(user);
  const lead = user.leadId ? await db.get('leads', user.leadId) : null;
  const s = schedule.getSchedule(user, lead);
  const week = Math.max(-4, Math.min(8, parseInt(req.query.week, 10) || 0));
  const today = sched.today();
  const monday = schedule.addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + week * 7);
  const sunday = schedule.addDays(monday, 6);
  const bookings = await db.findBy('bookings', 'userId', user.id);
  const events = schedule.buildEvents(user, s, { from: monday, to: sunday, bookings });
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = schedule.addDays(monday, i);
    days.push({ date, label: sched.formatDate(date), isToday: date === today, isPast: date < today, events: events.filter((e) => e.date === date) });
  }
  const httpsUrl = `${baseUrl(req)}/cal/${token}.ics`;
  const webcal = httpsUrl.replace(/^https?:/, 'webcal:');
  res.render('app/schedule', {
    title: 'Calendar',
    s,
    days,
    week,
    range: `${sched.formatDate(monday)} – ${sched.formatDate(sunday)}`,
    welcome: req.query.welcome === '1',
    feed: {
      https: httpsUrl,
      webcal,
      google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`,
      outlook: `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(httpsUrl)}&name=${encodeURIComponent('Steady Sugar')}`,
    },
    synced: user.calendarFetchedAt || null,
    program: enroll.activeProgram(user),
    blueprintRun: enroll.activeBlueprint(user),
    full: tierAllows(user, 'core'),
    courseOptions: content.courses.filter((c) => !c.blueprint && inLibrary(user, c)).map((c) => ({
      slug: c.slug, title: c.title, cat: content.categoryById[c.category], recommended: s.recommended.includes(c.slug),
      openLessons: c.lessons.filter((l) => canOpenLesson(user, c, l)).length, total: c.lessons.length,
    })),
    counts: events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {}),
    DAY_NAMES: schedule.DAY_NAMES,
    ALARMS: schedule.ALARMS,
  });
}));

router.post('/schedule', h(async (req, res) => {
  const lead = req.user.leadId ? await db.get('leads', req.user.leadId) : null;
  const current = schedule.getSchedule(req.user, lead);
  await db.update('users', req.user.id, { schedule: schedule.parse(req.body, current) });
  req.session.flash = { type: 'success', msg: 'Your plan is saved — your calendar will update on its next sync.' };
  res.redirect('/app/schedule');
}));

// Add/remove a course from My Plan (from the course landing page).
router.post('/schedule/enroll', h(async (req, res, next) => {
  const course = content.courses.find((c) => c.slug === req.body.course);
  if (!course) return next();
  const lead = req.user.leadId ? await db.get('leads', req.user.leadId) : null;
  const s = schedule.getSchedule(req.user, lead);
  const courses = s.courses.filter((x) => x !== course.slug);
  if (req.body.on === '1') courses.push(course.slug);
  const { recommended, isSetUp, ...saved } = s;
  await db.update('users', req.user.id, { schedule: { ...saved, courses, updatedAt: new Date().toISOString() } });
  req.session.flash = { type: 'success', msg: req.body.on === '1' ? `${course.title} added to your calendar.` : `${course.title} removed from your calendar.` };
  res.redirect(`/app/courses/${course.slug}`);
}));

router.post('/schedule/reset-link', h(async (req, res) => {
  await db.update('users', req.user.id, { calendarToken: newToken(), calendarFetchedAt: null });
  req.session.flash = { type: 'info', msg: 'New calendar link created. The old link stops working — re-subscribe on your devices.' };
  res.redirect('/app/schedule#sync');
}));

// Single coaching call as an .ics download (for "Add to calendar" buttons).
router.get('/calendar/:id.ics', h(async (req, res, next) => {
  const b = await db.get('bookings', req.params.id);
  if (!b || b.userId !== req.user.id) return next();
  const [event] = schedule.buildEvents(req.user, { ...schedule.getSchedule(req.user), readings: false, weeklyReview: false, meals: 'off', workouts: false, lessonDays: [] }, { from: b.date, to: b.date, base: baseUrl(req), bookings: [b] });
  res.set('Content-Disposition', `attachment; filename="steady-sugar-call-${b.date}.ics"`);
  res.type('text/calendar; charset=utf-8').send(ics.calendar({ name: 'Steady Sugar call', events: [event], domain: req.get('host') }));
}));

// ---- Tracker -----------------------------------------------------------------
router.get('/log', h(async (req, res) => {
  const logs = (await db.findBy('logs', 'userId', req.user.id)).sort((a, b) => b.date.localeCompare(a.date));
  const asc = [...logs].reverse();
  res.render('app/log', {
    title: 'Tracker',
    logs,
    today: sched.today(),
    fastingSpark: sparkline(asc.filter((l) => l.fasting).map((l) => Number(l.fasting)).slice(-30), 600, 120),
    postSpark: sparkline(asc.filter((l) => l.postMeal).map((l) => Number(l.postMeal)).slice(-30), 600, 120),
  });
}));

router.post('/log', h(async (req, res) => {
  const num = (v) => (v === '' || v == null ? null : Math.max(0, Math.min(100000, Number(v)) || 0));
  await db.insert('logs', {
    userId: req.user.id,
    date: /^\d{4}-\d{2}-\d{2}$/.test(req.body.date) ? req.body.date : sched.today(),
    fasting: num(req.body.fasting),
    postMeal: num(req.body.postMeal),
    weight: num(req.body.weight),
    steps: num(req.body.steps),
    notes: String(req.body.notes || '').slice(0, 500),
  });
  req.session.flash = { type: 'success', msg: 'Entry saved.' };
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
