// Private calendar feed: /cal/<token>.ics — subscribed to from Apple/Google/Outlook
// Calendar so members get lessons, meals, workouts, reminders and calls on their phone
// without logging in. The token is the only secret; members can reset it anytime.
const express = require('express');
const db = require('../db');
const ics = require('../ics');
const schedule = require('../schedule');
const sched = require('../scheduling');
const content = require('../content');

const router = express.Router();

router.get('/cal/:token.ics', async (req, res, next) => {
  try {
    const token = String(req.params.token || '');
    if (!/^[a-f0-9]{48}$/.test(token)) return next();
    const user = await db.findOneBy('users', 'calendarToken', token);
    if (!user) return res.status(404).type('text/plain').send('Calendar not found — the link may have been reset.');
    const lead = user.leadId ? await db.get('leads', user.leadId) : null;
    const s = schedule.getSchedule(user, lead);
    const today = sched.today();
    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const events = schedule.buildEvents(user, s, {
      from: schedule.addDays(today, -7),
      to: schedule.addDays(today, 56),
      base,
      bookings: await db.findBy('bookings', 'userId', user.id),
    });
    // Remember when their calendar app last synced (shown in admin), at most hourly.
    if (!user.calendarFetchedAt || Date.now() - new Date(user.calendarFetchedAt) > 36e5) {
      db.update('users', user.id, { calendarFetchedAt: new Date().toISOString() }).catch(() => {});
    }
    res.set('Cache-Control', 'private, max-age=900');
    res.type('text/calendar; charset=utf-8');
    res.send(ics.calendar({ name: `${content.brand.name} — My Plan`, events, domain: req.get('host') || 'steadysugar.app' }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
