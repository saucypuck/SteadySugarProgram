const express = require('express');
const db = require('../db');
const email = require('../integrations/email');
const { createUser, verify, login, normalizeEmail, hasPlan, isAdmin } = require('../auth');

const router = express.Router();
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const landingFor = (user) => (isAdmin(user) && !hasPlan(user) ? '/admin' : hasPlan(user) ? '/app' : '/pricing');

router.get('/login', (req, res) => {
  if (req.user) return res.redirect(landingFor(req.user));
  res.render('auth/login', { title: 'Log in', variant: 'minimal', error: null, email: '' });
});

router.post('/login', h(async (req, res) => {
  const user = await verify(req.body.email, req.body.password);
  if (!user) return res.status(401).render('auth/login', { title: 'Log in', variant: 'minimal', error: 'Email or password is incorrect.', email: req.body.email || '' });
  login(req, user);
  const dest = req.session.returnTo || landingFor(user);
  delete req.session.returnTo;
  res.redirect(dest);
}));

router.get('/signup', (req, res) => {
  if (req.user) return res.redirect(landingFor(req.user));
  res.render('auth/signup', { title: 'Create your account', variant: 'minimal', error: null, form: {} });
});

// Free account (no plan). Most buyers create their account inside checkout instead.
router.post('/signup', h(async (req, res) => {
  const { name, password } = req.body;
  const addr = normalizeEmail(req.body.email);
  const fail = (error) => res.status(400).render('auth/signup', { title: 'Create your account', variant: 'minimal', error, form: req.body });
  if (!name || !addr || !password) return fail('All fields are required.');
  if (password.length < 8) return fail('Password must be at least 8 characters.');
  if (await db.findOneBy('users', 'email', addr)) return fail('An account with that email already exists. Try logging in.');
  const user = await createUser({ name, email: addr, password, extra: { leadId: req.session.leadId || null, utm: req.session.utm || null } });
  login(req, user);
  res.redirect('/pricing');
}));

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/');
});

router.get('/forgot', (req, res) => res.render('auth/forgot', { title: 'Reset password', variant: 'minimal', sent: false }));
router.post('/forgot', h(async (req, res) => {
  // TODO(auth): generate a signed reset token + /reset/:token page.
  const addr = normalizeEmail(req.body.email);
  if (await db.findOneBy('users', 'email', addr)) await email.send(addr, 'password_reset');
  res.render('auth/forgot', { title: 'Reset password', variant: 'minimal', sent: true });
}));

module.exports = router;
