// Demo marketing data: campaigns, ads, landing pages, an A/B test, 20 days of
// spend and simulated visitor funnels. Runs once (skips if any campaign exists).
const db = require('./db');
const { isoDate } = require('./scheduling');

// Deterministic PRNG so demo numbers are stable across restarts.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

async function seedMarketing() {
  if ((await db.all('campaigns')).length) return;
  const rand = rng(42);
  const DAYS = 20;

  const P = async (d) => db.insert('pages', { showPricing: true, showTestimonials: true, ...d });
  const energy = await P({
    name: 'Energy angle', slug: 'energy', status: 'live', ctaTarget: 'quiz', ctaLabel: 'Find my blood sugar pattern',
    angle: 'Lead with the symptom (3pm crash) instead of the number (A1C).',
    eyebrow: 'Tired of the 3pm crash?', headline: 'Stop the afternoon crash by steadying your blood sugar',
    subheadline: 'Your slump isn’t a willpower problem — it’s a blood sugar pattern. Find yours in 2 minutes.',
    bullets: 'No extreme diets or cutting out carbs\n10-minute habits that fit a busy day\nCoach-designed for prediabetes & type 2',
  });
  const a1c = await P({
    name: 'A1C angle', slug: 'lower-a1c', status: 'live', ctaTarget: 'quiz', ctaLabel: 'Get my A1C plan',
    angle: 'Lead with the outcome people’s doctors talk about: A1C.',
    eyebrow: 'Prediabetes or type 2?', headline: 'Lower your A1C without extreme diets',
    subheadline: 'A 12-week, coach-led program built on simple food, movement and habit changes.',
    bullets: 'Built around the foods you already eat\nTrack fasting & post-meal readings\nWorks alongside your doctor',
  });
  const free = await P({
    name: 'Start-free offer', slug: 'start-free', status: 'live', ctaTarget: 'signup', ctaLabel: 'Start free',
    angle: 'Remove price friction: free account first, upgrade in-app.',
    eyebrow: 'Free to start', headline: 'Start the Steady Sugar program free today',
    subheadline: 'Get the first lessons, a sample meal plan and the glucose tracker — no credit card.',
    bullets: '3 free lessons\nSample meal plan\nGlucose & habit tracker',
  });
  await P({
    name: 'VIP 1:1 page', slug: 'vip-coaching', status: 'draft', ctaTarget: 'checkout-vip', ctaLabel: 'Start VIP 1:1',
    angle: 'High-ticket page for warm audiences.', eyebrow: 'Fully personalized',
    headline: 'Your own blood sugar coach, every week', subheadline: 'Hands-on 1:1 coaching with a plan built around you.', showTestimonials: true,
  });

  const exp = await db.insert('experiments', {
    name: 'Hook: energy crash vs A1C', slug: 'energy-vs-a1c', status: 'running', primaryMetric: 'lead_rate', minViews: 150,
    hypothesis: 'If we lead with the 3pm crash (a daily felt symptom) instead of A1C, more cold visitors will take the quiz because the pain is more immediate.',
    variantIds: [energy.id, a1c.id], startDate: isoDate(new Date(Date.now() - DAYS * 864e5)),
  });

  const C = (d) => db.insert('campaigns', { status: 'active', startDate: isoDate(new Date(Date.now() - DAYS * 864e5)), ...d });
  const meta = await C({ name: 'Meta — Prediabetes cold', channel: 'meta', objective: 'leads', utmCampaign: 'meta_prediabetes_cold', dailyBudget: 60 });
  const google = await C({ name: 'Google Search — A1C intent', channel: 'google', objective: 'leads', utmCampaign: 'google_a1c_search', dailyBudget: 40 });
  const retarget = await C({ name: 'Meta — Retargeting', channel: 'meta', objective: 'sales', utmCampaign: 'meta_retarget', dailyBudget: 15 });

  // lr = visitor → lead rate multiplier, cr = lead → customer rate
  const adDefs = [
    { camp: meta, name: 'Crash hook — UGC video', utmContent: 'ugc_crash_v1', format: 'ugc', angle: '3pm crash', dest: `exp:${exp.id}`, impr: 3000, ctr: 0.016, cpc: 0.95, lr: 1, cr: 0.06 },
    { camp: meta, name: 'A1C before/after — static', utmContent: 'static_a1c_v1', format: 'image', angle: 'A1C drop', dest: `exp:${exp.id}`, impr: 2500, ctr: 0.012, cpc: 1.1, lr: 1, cr: 0.06 },
    { camp: meta, name: '“Doctor said watch your sugar” — video', utmContent: 'vid_doctor_v1', format: 'video', angle: 'Doctor told me', dest: `exp:${exp.id}`, impr: 2200, ctr: 0.007, cpc: 1.6, lr: 0.3, cr: 0.04 },
    { camp: google, name: 'Search — lower A1C naturally', utmContent: 'srch_lower_a1c', format: 'search', angle: 'Intent: lower A1C', dest: `lp:${a1c.id}`, impr: 420, ctr: 0.06, cpc: 2.4, lr: 1.2, cr: 0.09 },
    { camp: google, name: 'Search — prediabetes program', utmContent: 'srch_prediabetes', format: 'search', angle: 'Intent: program', dest: `lp:${free.id}`, impr: 300, ctr: 0.05, cpc: 2.1, lr: 1, cr: 0.08 },
    { camp: retarget, name: 'Retarget — Core offer', utmContent: 'rt_core_offer', format: 'carousel', angle: 'Unlock the full program', dest: `lp:${free.id}`, impr: 900, ctr: 0.025, cpc: 0.6, lr: 1.4, cr: 0.3 },
  ];
  const LEAD_RATE = { energy: 0.1, 'lower-a1c': 0.135, 'start-free': 0.2 };
  const bySlugId = { [energy.id]: energy, [a1c.id]: a1c, [free.id]: free };

  const spendRows = [];
  const events = [];
  for (const d of adDefs) {
    const ad = await db.insert('ads', {
      name: d.name, campaignId: d.camp.id, destination: d.dest, utmContent: d.utmContent, format: d.format, angle: d.angle,
      status: 'active', headline: '', primaryText: '', platformAdId: '',
    });
    for (let day = DAYS; day >= 1; day--) {
      const date = isoDate(new Date(Date.now() - day * 864e5));
      const impressions = Math.round(d.impr * (0.8 + rand() * 0.4));
      const clicks = Math.round(impressions * d.ctr * (0.8 + rand() * 0.4));
      spendRows.push({ adId: ad.id, campaignId: d.camp.id, date, impressions, clicks, spend: Math.round(clicks * d.cpc * (0.9 + rand() * 0.2) * 100) / 100, source: 'seed' });

      const views = Math.round(clicks * 0.85);
      for (let v = 0; v < views; v++) {
        const page = d.dest.startsWith('exp:') ? (rand() < 0.5 ? energy : a1c) : bySlugId[d.dest.slice(3)];
        const utm = {
          utm_source: d.camp.channel, utm_medium: 'paid', utm_campaign: d.camp.utmCampaign, utm_content: d.utmContent,
          lp: page.slug, exp: d.dest.startsWith('exp:') ? exp.slug : null,
        };
        const at = new Date(`${date}T${String(8 + Math.floor(rand() * 13)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00Z`).toISOString();
        const ev = (name, extra = {}) => events.push({ name, utm, userId: null, seeded: true, createdAt: at, ...extra });
        ev('lp_view');
        const lr = LEAD_RATE[page.slug] * d.lr;
        let lead = false;
        if (page.ctaTarget === 'quiz') {
          if (rand() < lr / 0.65) { ev('quiz_start'); if (rand() < 0.65) { ev('quiz_complete'); lead = true; } }
        } else if (rand() < lr) { ev('signup_free'); lead = true; }
        if (lead && rand() < d.cr / 0.4) {
          ev('checkout_view');
          if (rand() < 0.4) { const vip = rand() < 0.07; ev('purchase', { plan: vip ? 'vip' : 'core', amount: vip ? 999 : 49 }); }
        }
      }
    }
  }
  await db.insertMany('spend', spendRows);
  await db.insertMany('events', events);
  console.log(`[seed] Marketing demo: 3 campaigns, ${adDefs.length} ads, 4 pages, 1 A/B test, ${events.length} events.`);
}

module.exports = { seedMarketing };
