const bcrypt = require('bcryptjs');
const db = require('./db');

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const isAdmin = (user) => !!user && (user.role === 'admin' || adminEmails().includes(user.email));
const hasPlan = (user) => !!user && !!user.plan && user.status === 'active';

async function createUser({ name, email, password, extra = {} }) {
  return db.insert('users', {
    name: String(name || '').trim(),
    email: normalizeEmail(email),
    passwordHash: await bcrypt.hash(password, 10),
    plan: null,
    status: 'free',
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
    res.locals.hasPlan = hasPlan(user);
    next();
  } catch (err) {
    next(err);
  }
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

// Logged in but not paying -> send to pricing with a nudge.
function requirePlan(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (hasPlan(req.user) || isAdmin(req.user)) return next();
  req.session.flash = { type: 'info', msg: 'Choose a plan to unlock the member area.' };
  res.redirect('/pricing');
}

function requireAdmin(req, res, next) {
  if (isAdmin(req.user)) return next();
  if (!req.user) return requireAuth(req, res, next);
  res.status(403).render('marketing/error', { title: 'Not allowed', message: 'Admins only.' });
}

module.exports = { createUser, verify, login, loadUser, requireAuth, requirePlan, requireAdmin, isAdmin, hasPlan, normalizeEmail };
