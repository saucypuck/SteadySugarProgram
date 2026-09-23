const bcrypt = require('bcryptjs');
const db = require('./db');
const content = require('./content');

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const isAdmin = (user) => !!user && (user.role === 'admin' || adminEmails().includes(user.email));

// The tier a user currently has. Everyone with an account is at least 'free';
// canceled or unknown paid plans fall back to 'free'.
function planOf(user) {
  if (!user) return null;
  const id = content.legacyPlans[user.plan] || user.plan;
  return content.plans[id] && user.status === 'active' ? id : 'free';
}

const isPaid = (user) => !!user && planOf(user) !== 'free';

// Does the user's tier meet the required tier? Admins see everything.
function tierAllows(user, tier) {
  if (isAdmin(user)) return true;
  const have = content.plans[planOf(user)];
  return !!have && have.rank >= content.plans[tier].rank;
}

const canOpenLesson = (user, course, lesson) => tierAllows(user, course.tier) || (!!lesson.free && !!user);

async function createUser({ name, email, password, extra = {} }) {
  return db.insert('users', {
    name: String(name || '').trim(),
    email: normalizeEmail(email),
    passwordHash: await bcrypt.hash(password, 10),
    plan: 'free',
    status: 'active',
    completedLessons: [],
    ...extra,
  });
}

async function verify(email, password) {
  const user = await db.findOneBy('users', 'email', normalizeEmail(email));
  if (!user) return null;
  return (await bcrypt.compare(password || '', user.passwordHash)) ? user : null;
}

function login(req, user) {
  req.session.userId = user.id;
}

async function loadUser(req, res, next) {
  try {
    const user = req.session.userId ? await db.get('users', req.session.userId) : null;
    if (req.session.userId && !user) req.session.userId = null; // stale session (e.g. store reset)
    req.user = user;
    res.locals.user = user;
    res.locals.isAdmin = isAdmin(user);
    res.locals.tier = planOf(user);
    res.locals.isPaid = isPaid(user);
    res.locals.tierAllows = (tier) => tierAllows(user, tier);
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/signup');
}

function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  if (!req.user) return requireAuth(req, res, next);
  res.status(403).render('marketing/error', { title: 'Not allowed', message: 'Admins only.' });
}

module.exports = { createUser, verify, login, loadUser, requireAuth, requireAdmin, isAdmin, planOf, isPaid, tierAllows, canOpenLesson, normalizeEmail };
