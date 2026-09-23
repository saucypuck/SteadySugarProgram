// Demo accounts + sample data so every screen has something to show.
// Enabled when SEED_DEMO=true (or outside production). Turn OFF before launch.
const db = require('./db');
const { createUser } = require('./auth');
const sched = require('./scheduling');

const DEMO_MEMBER = { email: 'demo@steadysugar.test', password: 'demo1234' };
const DEMO_ADMIN = { email: 'admin@steadysugar.test', password: 'admin1234' };

async function seedDemo() {
  if (await db.findOneBy('users', 'email', DEMO_MEMBER.email)) return;

  const started = new Date(Date.now() - 23 * 864e5).toISOString();
  const member = await createUser({
    name: 'Dana Demo',
    ...DEMO_MEMBER,
    extra: {
      plan: 'coaching',
      status: 'active',
      planStartedAt: started,
      completedLessons: ['foundations/how-blood-sugar-works', 'foundations/know-your-numbers', 'foundations/the-steady-plate', 'foundations/food-order'],
      goals: { target: 'A1C under 5.7 by spring', why: 'Keep up with my grandkids', doctorAware: true },
    },
  });
  await createUser({ name: 'Admin', ...DEMO_ADMIN, extra: { role: 'admin' } });

  await db.insert('orders', { userId: member.id, email: member.email, plan: 'coaching', amount: 149, status: 'paid', provider: 'demo' });

  const readings = [118, 121, 115, 112, 116, 109, 111, 107, 104, 108, 103, 101];
  for (let i = 0; i < readings.length; i++) {
    const date = sched.isoDate(new Date(Date.now() - (readings.length - i) * 2 * 864e5));
    await db.insert('logs', { userId: member.id, date, fasting: readings[i], postMeal: readings[i] + 32 - i, steps: 5200 + i * 350, notes: '' });
  }

  const kickoffDate = sched.isoDate(new Date(Date.now() - 21 * 864e5));
  await db.insert('bookings', { userId: member.id, name: member.name, email: member.email, type: 'kickoff', date: kickoffDate, time: '11:00', status: 'completed' });
  const soon = sched.availability([])[2];
  await db.insert('bookings', { userId: member.id, name: member.name, email: member.email, type: 'coaching', date: soon.date, time: '10:00', status: 'booked', joinUrl: 'https://example.com/meet/demo' });

  const leads = [
    ['Pat Prospect', 'pat@example.com', 'quiz', 'coaching', 'hot'],
    ['Sam Sample', 'sam@example.com', 'quiz', 'vip', 'hot'],
    ['Lee Lead', 'lee@example.com', 'guide', null, 'cold'],
    ['Jo Jones', 'jo@example.com', 'quiz', 'starter', 'warm'],
  ];
  for (const [name, email, source, plan, temperature] of leads) {
    await db.insert('leads', { name, email, source, recommendedPlan: plan, temperature, utm: { utm_source: 'instagram' } });
  }
  for (const [name, n] of [['quiz_start', 42], ['quiz_complete', 27], ['checkout_view', 11], ['purchase', 4]]) {
    for (let i = 0; i < n; i++) await db.insert('events', { name, seeded: true });
  }
  console.log(`[seed] Demo member ${DEMO_MEMBER.email} / ${DEMO_MEMBER.password} · admin ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
}

module.exports = { seedDemo, DEMO_MEMBER, DEMO_ADMIN };
