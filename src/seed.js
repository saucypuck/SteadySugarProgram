// Demo accounts + sample data so every screen has something to show.
// Enabled unless SEED_DEMO=false. Turn OFF before launch.
const db = require('./db');
const { createUser } = require('./auth');
const sched = require('./scheduling');
const { seedMarketing } = require('./seed-marketing');

// Demo CRM data: pipeline stages, a few notes and follow-ups. Runs once.
async function seedCrm() {
  if ((await db.all('tasks')).length) return;
  const day = (n) => sched.isoDate(new Date(Date.now() + n * 864e5));
  const leads = await db.all('leads');
  const byEmail = Object.fromEntries(leads.map((l) => [l.email, l]));
  const by = 'admin@steadysugar.test';
  if (byEmail['pat@example.com']) {
    const l = byEmail['pat@example.com'];
    await db.update('leads', l.id, { stage: 'contacted' });
    await db.insert('notes', { subjectType: 'lead', subjectId: l.id, body: 'Left a voicemail. Very interested in Core; wants to know if it works with metformin.', by });
    await db.insert('tasks', { subjectType: 'lead', subjectId: l.id, title: 'Call Pat back re: metformin question', due: day(-1), done: false, by });
  }
  if (byEmail['sam@example.com']) {
    const l = byEmail['sam@example.com'];
    await db.insert('tasks', { subjectType: 'lead', subjectId: l.id, title: 'Send VIP 1:1 overview + testimonials', due: day(0), done: false, by });
  }
  if (byEmail['jo@example.com']) await db.update('leads', byEmail['jo@example.com'].id, { stage: 'lost', lostReason: 'Not ready / timing' });
  const member = await db.findOneBy('users', 'email', DEMO_MEMBER.email);
  if (member) {
    await db.update('users', member.id, { tags: ['prediabetes', 'grandparent', 'morning-highs'] });
    await db.insert('notes', { subjectType: 'user', subjectId: member.id, body: 'Kickoff: fasting readings high on weekends. Focus on consistent Sat/Sun breakfast + evening walk.', by });
    await db.insert('tasks', { subjectType: 'user', subjectId: member.id, title: 'Review week 4 readings before next call', due: day(2), done: false, by });
    await db.insert('tasks', { subjectType: 'user', subjectId: member.id, title: 'Send welcome gift', due: day(-10), done: true, by });
  }
}

const DEMO_MEMBER = { email: 'demo@steadysugar.test', password: 'demo1234' };
const DEMO_ADMIN = { email: 'admin@steadysugar.test', password: 'admin1234' };
const DEMO_FREE = { email: 'free@steadysugar.test', password: 'free1234' };

async function seedDemo() {
  await seedMarketing();
  // Each account is ensured independently so a partial seed can't lock anyone out.
  if (!(await db.findOneBy('users', 'email', DEMO_ADMIN.email))) {
    await createUser({ name: 'Admin', ...DEMO_ADMIN, extra: { role: 'admin' } });
  }
  if (!(await db.findOneBy('users', 'email', DEMO_FREE.email))) {
    await createUser({ name: 'Frankie Free', ...DEMO_FREE, extra: { completedLessons: ['foundations/how-blood-sugar-works'] } });
  }
  if (await db.findOneBy('users', 'email', DEMO_MEMBER.email)) {
    await seedCrm();
    console.log('[seed] Demo accounts present.');
    return;
  }

  const started = new Date(Date.now() - 23 * 864e5).toISOString();
  const member = await createUser({
    name: 'Dana Demo',
    ...DEMO_MEMBER,
    extra: {
      plan: 'core',
      status: 'active',
      planStartedAt: started,
      completedLessons: ['foundations/how-blood-sugar-works', 'foundations/know-your-numbers', 'foundations/the-steady-plate', 'foundations/food-order'],
      goals: { target: 'A1C under 5.7 by spring', why: 'Keep up with my grandkids', doctorAware: true },
    },
  });

  await db.insert('orders', { userId: member.id, email: member.email, plan: 'core', amount: 49, status: 'paid', provider: 'demo' });

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
    ['Pat Prospect', 'pat@example.com', 'quiz', 'core', 'hot'],
    ['Sam Sample', 'sam@example.com', 'quiz', 'vip', 'hot'],
    ['Lee Lead', 'lee@example.com', 'guide', null, 'cold'],
    ['Jo Jones', 'jo@example.com', 'quiz', 'free', 'cold'],
  ];
  for (const [name, email, source, plan, temperature] of leads) {
    await db.insert('leads', { name, email, source, recommendedPlan: plan, temperature, utm: { utm_source: 'instagram' } });
  }
  for (const [name, n] of [['quiz_start', 42], ['quiz_complete', 27], ['signup_free', 18], ['checkout_view', 11], ['purchase', 4]]) {
    for (let i = 0; i < n; i++) await db.insert('events', { name, seeded: true });
  }
  await seedCrm();
  console.log(`[seed] Demo member ${DEMO_MEMBER.email} / ${DEMO_MEMBER.password} · free ${DEMO_FREE.email} / ${DEMO_FREE.password} · admin ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
}

module.exports = { seedDemo, DEMO_MEMBER, DEMO_ADMIN, DEMO_FREE };
