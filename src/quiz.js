// Turns quiz answers into a persona, recommended plan, and lead temperature
// (used by admin to prioritize sales follow-up).

const PROFILES = {
  cravings: { name: 'Craving-driven pattern', body: 'Blood sugar spikes are often followed by dips that trigger cravings. Breaking the cycle starts with protein-forward meals and smarter carb pairing.' },
  energy: { name: 'Afternoon energy-dip pattern', body: 'An afternoon slump is often a rise and fall in blood sugar after lunch. Food order and a 10-minute walk can flatten it fast.' },
  food: { name: 'Information-overload pattern', body: 'Conflicting advice makes it hard to know what to eat. You need a simple plate template and a meal plan you can repeat.' },
  time: { name: 'Time-pressed pattern', body: 'The answer isn’t more time — it’s habits that fit into the time you already have.' },
  consistency: { name: 'Stop-start pattern', body: 'Motivation isn’t the problem; structure and accountability are. That’s exactly what coaching fixes.' },
};

const FOCUS = {
  cravings: 'Protein-forward breakfast to cut cravings',
  energy: 'Post-meal walks to flatten afternoon spikes',
  food: 'The Steady Plate template for every meal',
  time: '15-minute meals and 10-minute movement snacks',
  consistency: 'Weekly check-ins to keep momentum',
  low: 'Start with 10-minute walks after meals',
  some: 'Turn walks into post-meal glucose tools',
  regular: 'Add 2×/week strength to boost insulin sensitivity',
  high: 'Time workouts around meals for better readings',
};

function scoreQuiz(a) {
  // Hands-on → VIP. Self-starters who are just exploring → Free (nurture). Everyone else → Core.
  const plan = a.support === 'handson' ? 'vip' : a.support === 'self' && a.timing === 'exploring' ? 'free' : 'core';

  let temperature = a.timing === 'now' ? 'hot' : a.timing === 'month' ? 'warm' : 'cold';
  if (temperature === 'warm' && (a.a1c === 'high' || a.support === 'handson')) temperature = 'hot';

  const profile = PROFILES[a.challenge] || PROFILES.consistency;
  const focus = [FOCUS[a.challenge], FOCUS[a.activity], 'Track fasting + post-meal readings 3×/week'].filter(Boolean);
  const medicalNote = a.a1c === 'high' || a.status === 't2' || a.goal === 'meds';

  return { plan, temperature, profile, focus, medicalNote };
}

module.exports = { scoreQuiz };
