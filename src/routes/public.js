const express = require('express');
const db = require('../db');
const content = require('../content');
const email = require('../integrations/email');
const meetings = require('../integrations/meetings');
const sched = require('../scheduling');
const { scoreQuiz } = require('../quiz');
const { track, attribution } = require('../track');
const { normalizeEmail } = require('../auth');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

router.get('/', (req, res) => res.render('marketing/home', { title: 'Blood sugar coaching for real life' }));
router.get('/program', (req, res) => res.render('marketing/program', { title: 'The 12-week program' }));
router.get('/pricing', (req, res) => res.render('marketing/pricing', { title: 'Pricing' }));
router.get('/about', (req, res) => res.render('marketing/about', { title: 'Meet your coach' }));

const LEGAL = { terms: 'Terms of Service', privacy: 'Privacy Policy', disclaimer: 'Medical Disclaimer' };
router.get('/legal/:page', (req, res, next) => {
  if (!LEGAL[req.params.page]) return next();
  res.render('marketing/legal', { title: LEGAL[req.params.page], page: req.params.page });
});

// ---- Lead magnet ----------------------------------------------------------
router.get('/free-guide', (req, res) => res.render('marketing/free-guide', { title: 'Free 7-Day Meal Guide', error: null }));
router.post('/free-guide', h(async (req, res) => {
  const addr = normalizeEmail(req.body.email);
  if (!validEmail(addr)) return res.status(400).render('marketing/free-guide', { title: 'Free 7-Day Meal Guide', error: 'Please enter a valid email.' });
  await db.insert('leads', { name: String(req.body.name || '').trim(), email: addr, source: 'guide', temperature: 'cold', utm: attribution(req) });
  await email.send(addr, 'lead_guide');
  await track(req, 'lead_guide', { email: addr });
  res.redirect('/free-guide/thanks');
}));
router.get('/free-guide/thanks', (req, res) => res.render('marketing/free-guide-thanks', { title: 'Check your inbox' }));

// ---- Onboarding quiz -------------------------------------------------------
router.get('/quiz', h(async (req, res) => {
  await track(req, 'quiz_start');
  res.render('marketing/quiz', { title: 'Find your plan', variant: 'minimal', error: null });
}));

router.post('/quiz', h(async (req, res) => {
  const answers = {};
  for (const q of content.quiz) answers[q.id] = req.body[q.id];
  const addr = normalizeEmail(req.body.email);
  const missing = content.quiz.some((q) => !answers[q.id]);
  if (missing || !validEmail(addr)) {
    return res.status(400).render('marketing/quiz', { title: 'Find your plan', variant: 'minimal', error: 'Please answer every question and enter a valid email.' });
  }
  const result = scoreQuiz(answers);
  const lead = await db.insert('leads', {
    name: String(req.body.name || '').trim(),
    email: addr,
    source: 'quiz',
    answers,
    recommendedPlan: result.plan,
    temperature: result.temperature,
    utm: attribution(req),
  });
  req.session.leadId = lead.id;
  await email.send(addr, 'lead_quiz', { plan: result.plan });
  await track(req, 'quiz_complete', { plan: result.plan, email: addr, name: lead.name, temperature: result.temperature });
  res.redirect('/quiz/results');
}));

router.get('/quiz/results', h(async (req, res) => {
  const lead = await db.get('leads', req.session.leadId);
  if (!lead) return res.redirect('/quiz');
  const result = scoreQuiz(lead.answers);
  res.render('marketing/quiz-results', { title: 'Your results', lead, result, recommended: content.plans[result.plan] });
}));

// ---- Free discovery call (sales call for prospects) ------------------------
router.get('/book-call', h(async (req, res) => {
  const lead = await db.get('leads', req.session.leadId);
  const days = sched.availability(await db.all('bookings'));
  res.render('marketing/book-call', { title: 'Book a free discovery call', days, lead, error: null });
}));

router.post('/book-call', h(async (req, res) => {
  const addr = normalizeEmail(req.body.email);
  const [date, time] = String(req.body.slot || '').split('|');
  const bookings = await db.all('bookings');
  const days = sched.availability(bookings);
  const open = days.some((d) => d.date === date && d.slots.includes(time));
  if (!validEmail(addr) || !open) {
    const lead = await db.get('leads', req.session.leadId);
    return res.status(400).render('marketing/book-call', { title: 'Book a free discovery call', days, lead, error: !open ? 'That time was just taken — please pick another.' : 'Please enter a valid email.' });
  }
  let booking = await db.insert('bookings', {
    userId: req.user ? req.user.id : null,
    leadId: req.session.leadId || null,
    name: String(req.body.name || '').trim(),
    email: addr,
    phone: String(req.body.phone || '').trim(),
    notes: String(req.body.notes || '').slice(0, 1000),
    type: 'discovery',
    date,
    time,
    status: 'booked',
  });
  const meeting = await meetings.createMeeting({ booking });
  booking = await db.update('bookings', booking.id, { joinUrl: meeting.joinUrl });
  if (req.session.leadId) await db.update('leads', req.session.leadId, { temperature: 'hot', bookedCall: true });
  await email.send(addr, 'booking_confirmed', { date, time });
  await track(req, 'discovery_booked', { email: addr, date, time });
  req.session.lastBookingId = booking.id;
  res.redirect('/book-call/confirmed');
}));

router.get('/book-call/confirmed', h(async (req, res) => {
  const booking = await db.get('bookings', req.session.lastBookingId);
  if (!booking) return res.redirect('/book-call');
  res.render('marketing/book-call-confirmed', { title: 'You’re booked', booking });
}));

module.exports = router;
