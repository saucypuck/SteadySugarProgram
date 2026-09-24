const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');

const db = require('./src/db');
const content = require('./src/content');
const { loadUser } = require('./src/auth');
const { captureUtm } = require('./src/track');
const { seedDemo } = require('./src/seed');
const sched = require('./src/scheduling');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

// Fingerprint CSS/JS so browsers fetch fresh copies after every deploy
// (links become /css/styles.css?v=<hash>; the hash changes when the files do).
const assetVersion = crypto
  .createHash('md5')
  .update(['public/css/styles.css', 'public/js/main.js'].map((f) => fs.readFileSync(path.join(__dirname, f))).join(''))
  .digest('hex')
  .slice(0, 10);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: isProd ? '1h' : 0 }));
app.use(express.urlencoded({ extended: true }));
app.use(
  cookieSession({
    name: 'ss_session',
    keys: [process.env.SESSION_SECRET || 'dev-only-secret-change-me'],
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: isProd,
    httpOnly: true,
  })
);

app.get('/healthz', (req, res) => res.send('ok'));
app.use('/', require('./src/routes/feed')); // calendar feed: no session/user lookup needed

// Shared template locals.
app.use((req, res, next) => {
  res.locals.c = content;
  res.locals.sched = sched;
  res.locals.path = req.path;
  res.locals.variant = 'marketing';
  res.locals.assetVersion = assetVersion;
  res.locals.flash = req.session.flash || null;
  res.locals.demoMode = !process.env.STRIPE_SECRET_KEY;
  res.locals.money = (n) => `$${Number(n).toLocaleString('en-US')}`;
  delete req.session.flash;
  next();
});
app.use(loadUser);
app.use(captureUtm);

app.use('/', require('./src/routes/public'));
app.use('/', require('./src/routes/lp'));
app.use('/', require('./src/routes/auth'));
app.use('/', require('./src/routes/checkout'));
app.use('/app', require('./src/routes/member'));
app.use('/admin', require('./src/routes/admin'));

app.use((req, res) => res.status(404).render('marketing/error', { title: 'Page not found', message: 'We couldn’t find that page.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('marketing/error', { title: 'Something went wrong', message: 'Please try again in a moment.' });
});

db.init()
  // Demo accounts are on unless explicitly disabled (SEED_DEMO=false) — turn off before launch.
  .then(() => (process.env.SEED_DEMO !== 'false' ? seedDemo().catch((err) => console.error('[seed] failed:', err)) : null))
  .then(() => app.listen(PORT, () => console.log(`Steady Sugar running on http://localhost:${PORT}`)));
