// Meal & Movement Plans: each plan pairs a weekly menu with a matching workout routine,
// runs for a fixed number of weeks, and a member follows one at a time.
// Meals and the workout schedule repeat weekly (keyed by weekday); phases describe the
// progression across the plan. The plan finder quiz scores every plan against answers.
const content = require('./content');

// Shared workout library, referenced by name from each plan's weekly schedule.
const WORKOUTS = {
  'Gentle Strength': { minutes: 20, moves: [['Chair sit-to-stand', '2–3', '8–10'], ['Wall push-ups', '2–3', '8–10'], ['Band seated row', '2–3', '10–12'], ['Glute bridge', '2–3', '10–12'], ['Standing march', '2', '30 sec']] },
  'Strength A': { minutes: 25, moves: content.workoutPlan.workouts['Strength A'].map((e) => [e.name, e.sets, e.reps]) },
  'Strength B': { minutes: 25, moves: content.workoutPlan.workouts['Strength B'].map((e) => [e.name, e.sets, e.reps]) },
  'Express 20': { minutes: 20, moves: [['Bodyweight squat', '3 rounds', '40s on / 20s off'], ['Incline push-up', '3 rounds', '40s / 20s'], ['Reverse lunge', '3 rounds', '40s / 20s'], ['Backpack row', '3 rounds', '40s / 20s'], ['Plank', '3 rounds', '30s']] },
  'Lower Power': { minutes: 45, moves: [['Goblet squat', '4', '8–10'], ['Romanian deadlift', '3', '8–10'], ['Split squat', '3', '8/side'], ['Hip thrust', '3', '10–12'], ['Calf raise', '3', '15']] },
  'Upper Power': { minutes: 45, moves: [['Dumbbell bench or floor press', '4', '8–10'], ['One-arm row', '3', '10/side'], ['Overhead press', '3', '8–10'], ['Lat pulldown or band pull-apart', '3', '12'], ['Farmer carry', '3', '40 m']] },
  'Full Body': { minutes: 40, moves: [['Trap-bar or dumbbell deadlift', '4', '6–8'], ['Push-up', '3', 'max −2'], ['Goblet squat', '3', '10'], ['Cable or band row', '3', '12'], ['Suitcase carry', '3', '30 m/side']] },
  Mobility: { minutes: 12, moves: [['Cat–cow', '1', '60 sec'], ['Hip flexor stretch', '1', '45 sec/side'], ['Thoracic rotation', '1', '8/side'], ['Hamstring stretch', '1', '45 sec/side']] },
};
const walk = (focus, detail, minutes) => ({ focus, detail, minutes });

const PLANS = [
  {
    id: 'steady-start',
    name: 'Steady Start',
    weeks: 4,
    level: 'Beginner',
    tagline: 'A gentle on-ramp: simple meals, daily walks, two short strength sessions.',
    description: 'For people starting from zero or coming back after a break. Meals repeat on purpose so there’s less to think about, and movement starts with walking and 20-minute low-impact strength you can do at home.',
    diet: 'omnivore', cookTime: 20, workoutMinutes: 20, intensity: 'low', equipment: 'none', lowImpact: true,
    goals: ['a1c', 'energy'],
    targets: [{ label: 'Protein', value: '20–30g per meal' }, { label: 'Carbs', value: '30–40g per meal, paired' }, { label: 'Steps', value: '+1,000/day vs baseline' }, { label: 'Strength', value: '2× per week' }],
    phases: [{ weeks: [1, 2], title: 'Build the routine', focus: 'One Steady Plate a day + a 10-minute walk after dinner.' }, { weeks: [3, 4], title: 'Make it twice', focus: 'Two Steady Plates a day, walks after two meals.' }],
    meals: [
      { day: 'Mon', breakfast: 'Greek yogurt, berries, walnuts', lunch: 'Turkey & veggie wrap (whole-grain tortilla)', dinner: 'Baked chicken, green beans, ½ cup brown rice', snack: 'Apple + peanut butter' },
      { day: 'Tue', breakfast: '2 eggs, spinach, 1 slice whole-grain toast', lunch: 'Leftover chicken & rice bowl', dinner: 'Salmon, roasted broccoli, small sweet potato', snack: 'String cheese + cucumber' },
      { day: 'Wed', breakfast: 'Greek yogurt, berries, walnuts', lunch: 'Tuna salad lettuce cups, lentil soup', dinner: 'Turkey chili with beans', snack: 'Almonds' },
      { day: 'Thu', breakfast: '2 eggs, spinach, 1 slice whole-grain toast', lunch: 'Leftover turkey chili', dinner: 'Sheet-pan chicken & veggies', snack: 'Hummus + carrots' },
      { day: 'Fri', breakfast: 'Overnight oats with chia & protein', lunch: 'Chicken salad bowl', dinner: 'Eating out — use the restaurant script', snack: 'Pear + cheese' },
      { day: 'Sat', breakfast: 'Veggie omelet', lunch: 'Big salad + grilled protein', dinner: 'Burger on half bun, side salad', snack: 'Cottage cheese + berries' },
      { day: 'Sun', breakfast: 'Greek yogurt, berries, walnuts', lunch: 'Prep day: grain bowls', dinner: 'Roast chicken, veggies, ½ cup quinoa', snack: 'Dark chocolate square + almonds' },
    ],
    schedule: { Mon: 'Gentle Strength', Tue: walk('Walk', '10 min after lunch & dinner', 10), Wed: 'Mobility', Thu: 'Gentle Strength', Fri: walk('Walk', '10 min after lunch & dinner', 10), Sat: walk('Long walk', '20–30 min, easy pace', 30), Sun: 'Rest' },
    grocery: { Protein: ['Chicken', 'Salmon', 'Ground turkey', 'Eggs', 'Greek yogurt', 'Canned tuna'], Produce: ['Spinach', 'Broccoli', 'Green beans', 'Berries', 'Apples', 'Carrots'], Pantry: ['Brown rice', 'Quinoa', 'Oats', 'Beans', 'Walnuts', 'Peanut butter'] },
  },
  {
    id: 'steady-core-12',
    name: 'Steady Core 12',
    weeks: 12,
    level: 'Beginner → Intermediate',
    tagline: 'The full 12-week program: the Steady Plate menu plus progressive home strength.',
    description: 'Our flagship plan. A varied weekly menu built on the Steady Plate, post-meal walks, and home strength that progresses every four weeks. Pairs with the 12-week course roadmap.',
    diet: 'omnivore', cookTime: 30, workoutMinutes: 25, intensity: 'moderate', equipment: 'basic', lowImpact: false,
    goals: ['a1c', 'weight', 'energy'],
    targets: content.nutritionPlan.targets,
    phases: content.workoutPlan.phases.map((p) => { const [a, b] = p.weeks.split('–').map(Number); return { weeks: [a, b], title: p.title, focus: p.body }; }),
    meals: content.nutritionPlan.week,
    schedule: Object.fromEntries(content.workoutPlan.week.map((d) => [d.day, WORKOUTS[d.focus] ? d.focus : d.focus === 'Rest' ? 'Rest' : walk(d.focus, d.detail, /Long/.test(d.focus) ? 40 : 10)])),
    grocery: content.nutritionPlan.grocery,
  },
  {
    id: 'plant-forward',
    name: 'Plant-Forward Steady',
    weeks: 8,
    level: 'Beginner',
    tagline: 'Vegetarian meals built for steady blood sugar, plus 30-minute strength.',
    description: 'Lacto-ovo vegetarian: beans, lentils, tofu, tempeh, eggs and dairy do the heavy lifting on protein, and fiber comes built in. Movement mixes home strength with brisk walks.',
    diet: 'plant', cookTime: 30, workoutMinutes: 30, intensity: 'moderate', equipment: 'basic', lowImpact: false,
    goals: ['a1c', 'weight', 'energy'],
    targets: [{ label: 'Protein', value: '25g+ per meal (plants + dairy/eggs)' }, { label: 'Fiber', value: '35g+ per day' }, { label: 'Carbs', value: '35–45g per meal, paired' }, { label: 'Strength', value: '3× per week' }],
    phases: [{ weeks: [1, 4], title: 'Protein first', focus: 'Hit 25g protein at every meal with plant sources.' }, { weeks: [5, 8], title: 'Fiber & strength', focus: '35g fiber daily and add a set to each strength move.' }],
    meals: [
      { day: 'Mon', breakfast: 'Tofu scramble, peppers, ½ whole-grain wrap', lunch: 'Lentil & quinoa salad with feta', dinner: 'Tempeh stir-fry, broccoli, ½ cup brown rice', snack: 'Edamame' },
      { day: 'Tue', breakfast: 'Greek yogurt, chia, berries', lunch: 'Leftover tempeh stir-fry', dinner: 'Black bean chili, side salad', snack: 'Roasted chickpeas' },
      { day: 'Wed', breakfast: 'Veggie egg muffins ×3', lunch: 'Hummus power bowl (chickpeas, greens, quinoa)', dinner: 'Tofu curry with cauliflower rice', snack: 'Cottage cheese + cucumber' },
      { day: 'Thu', breakfast: 'Protein oats with pumpkin seeds', lunch: 'Leftover tofu curry', dinner: 'Lentil bolognese over zucchini + ½ cup pasta', snack: 'Apple + almond butter' },
      { day: 'Fri', breakfast: 'Tofu scramble, peppers, ½ whole-grain wrap', lunch: 'Black bean & corn salad', dinner: 'Eating out — veggie-forward, beans or tofu for protein', snack: 'Greek yogurt' },
      { day: 'Sat', breakfast: 'Cottage cheese pancakes', lunch: 'Big salad + marinated tofu', dinner: 'Bean & veggie fajitas', snack: 'Dark chocolate + walnuts' },
      { day: 'Sun', breakfast: 'Greek yogurt, chia, berries', lunch: 'Prep day: lentils, quinoa, roasted veg', dinner: 'Chickpea & spinach stew', snack: 'Edamame' },
    ],
    schedule: { Mon: 'Strength A', Tue: walk('Brisk walk', '25 min, conversational pace', 25), Wed: 'Strength B', Thu: walk('Walk', '10 min after lunch & dinner', 10), Fri: 'Strength A', Sat: walk('Long walk', '40 min', 40), Sun: 'Mobility' },
    grocery: { Protein: ['Firm tofu', 'Tempeh', 'Lentils', 'Chickpeas', 'Black beans', 'Eggs', 'Greek yogurt', 'Cottage cheese'], Produce: ['Broccoli', 'Cauliflower', 'Peppers', 'Spinach', 'Zucchini', 'Berries'], Pantry: ['Quinoa', 'Brown rice', 'Chia', 'Pumpkin seeds', 'Oats', 'Almond butter'] },
  },
  {
    id: 'busy-fast-track',
    name: 'Busy Fast-Track',
    weeks: 6,
    level: 'Beginner',
    tagline: '15-minute meals and 20-minute bodyweight workouts for packed schedules.',
    description: 'Assembly-style meals from store-bought shortcuts (rotisserie chicken, bagged salads, frozen veg) and a 20-minute circuit you can do in a hotel room. Built for busy professionals and parents.',
    diet: 'omnivore', cookTime: 15, workoutMinutes: 20, intensity: 'moderate', equipment: 'none', lowImpact: false,
    goals: ['weight', 'energy'],
    targets: [{ label: 'Protein', value: '25–30g per meal' }, { label: 'Prep', value: '≤15 min per meal' }, { label: 'Workouts', value: '3 × 20 min' }, { label: 'Steps', value: '7,000+/day' }],
    phases: [{ weeks: [1, 3], title: 'Shortcuts & circuits', focus: 'Master 5 go-to assembly meals and the Express 20.' }, { weeks: [4, 6], title: 'Turn it up', focus: 'Shorten rest to 15 sec and add walking meetings.' }],
    meals: [
      { day: 'Mon', breakfast: 'Protein shake + banana half + nuts', lunch: 'Rotisserie chicken salad kit', dinner: 'Frozen stir-fry veg + shrimp, ½ cup microwave rice', snack: 'Jerky + apple' },
      { day: 'Tue', breakfast: 'Greek yogurt cup + granola sprinkle', lunch: 'Deli turkey & hummus wrap', dinner: 'Rotisserie chicken, bagged slaw, black beans', snack: 'Cheese stick + almonds' },
      { day: 'Wed', breakfast: 'Hard-boiled eggs ×2 + fruit', lunch: 'Leftover chicken & beans bowl', dinner: 'Salmon pouch, microwave veg, quinoa cup', snack: 'Protein bar (≤10g sugar)' },
      { day: 'Thu', breakfast: 'Protein shake + banana half + nuts', lunch: 'Chicken salad kit', dinner: 'Egg & veggie scramble, whole-grain toast', snack: 'Hummus cup + snap peas' },
      { day: 'Fri', breakfast: 'Greek yogurt cup + granola sprinkle', lunch: 'Burrito bowl (no tortilla, extra fajita veg)', dinner: 'Eating out — grilled protein + two veg sides', snack: 'Pistachios' },
      { day: 'Sat', breakfast: 'Eggs, avocado, toast', lunch: 'Soup + side salad + protein', dinner: 'Turkey burgers, bagged salad', snack: 'Cottage cheese' },
      { day: 'Sun', breakfast: 'Hard-boiled eggs ×2 + fruit', lunch: '15-min prep: boil eggs, portion snacks', dinner: 'Sheet-pan sausage & peppers', snack: 'Dark chocolate + almonds' },
    ],
    schedule: { Mon: 'Express 20', Tue: walk('Walk', '10 min after lunch (walking call?)', 10), Wed: 'Express 20', Thu: walk('Walk', '10 min after lunch & dinner', 10), Fri: 'Express 20', Sat: walk('Long walk', '30 min', 30), Sun: 'Rest' },
    grocery: { Protein: ['Rotisserie chicken', 'Shrimp (frozen)', 'Salmon pouches', 'Deli turkey', 'Eggs', 'Greek yogurt cups', 'Protein powder'], Produce: ['Salad kits', 'Bagged slaw', 'Frozen stir-fry veg', 'Snap peas', 'Apples'], Pantry: ['Microwave rice/quinoa cups', 'Black beans', 'Hummus cups', 'Nuts', 'Jerky'] },
  },
  {
    id: 'strength-steady',
    name: 'Strength & Steady',
    weeks: 8,
    level: 'Intermediate',
    tagline: 'Higher-protein meals and three 45-minute gym sessions to build muscle.',
    description: 'For members already active who want to build muscle — the most powerful long-term tool for insulin sensitivity. Upper/lower/full-body split with progressive overload and 30g+ protein meals.',
    diet: 'omnivore', cookTime: 30, workoutMinutes: 45, intensity: 'high', equipment: 'gym', lowImpact: false,
    goals: ['strength', 'a1c', 'weight'],
    targets: [{ label: 'Protein', value: '30–40g per meal' }, { label: 'Carbs', value: 'Most around workouts' }, { label: 'Strength', value: '3 × 45 min' }, { label: 'Progression', value: '+1 rep or +5 lb weekly' }],
    phases: [{ weeks: [1, 4], title: 'Build the base', focus: 'Learn the lifts, leave 2 reps in reserve.' }, { weeks: [5, 8], title: 'Progressive overload', focus: 'Add weight or reps every week; deload week 8.' }],
    meals: [
      { day: 'Mon', breakfast: '3-egg omelet, cottage cheese, berries', lunch: 'Chicken, quinoa & roasted veg', dinner: 'Steak, potatoes (½ cup), asparagus', snack: 'Protein shake post-workout' },
      { day: 'Tue', breakfast: 'Greek yogurt parfait with protein powder', lunch: 'Leftover steak salad', dinner: 'Salmon, brown rice, green beans', snack: 'Jerky + apple' },
      { day: 'Wed', breakfast: '3-egg omelet, cottage cheese, berries', lunch: 'Turkey & bean chili', dinner: 'Chicken thighs, sweet potato, broccoli', snack: 'Protein shake post-workout' },
      { day: 'Thu', breakfast: 'Protein oats', lunch: 'Leftover chicken & sweet potato', dinner: 'Shrimp tacos on corn tortillas, slaw', snack: 'Cottage cheese + walnuts' },
      { day: 'Fri', breakfast: 'Greek yogurt parfait with protein powder', lunch: 'Tuna & white bean salad', dinner: 'Lean beef burrito bowl', snack: 'Protein shake post-workout' },
      { day: 'Sat', breakfast: 'Protein pancakes', lunch: 'Big salad + double chicken', dinner: 'Pork tenderloin, roasted veg, farro', snack: 'Greek yogurt' },
      { day: 'Sun', breakfast: 'Eggs, turkey sausage, fruit', lunch: 'Prep: proteins ×3, grains ×2', dinner: 'Roast chicken, veg, potatoes', snack: 'Almonds' },
    ],
    schedule: { Mon: 'Lower Power', Tue: walk('Walk', '10 min after lunch & dinner', 10), Wed: 'Upper Power', Thu: 'Mobility', Fri: 'Full Body', Sat: walk('Long walk', '45 min', 45), Sun: 'Rest' },
    grocery: { Protein: ['Chicken breast & thighs', 'Lean steak', 'Salmon', 'Shrimp', 'Eggs', 'Cottage cheese', 'Protein powder', 'Turkey sausage'], Produce: ['Asparagus', 'Broccoli', 'Green beans', 'Sweet potatoes', 'Berries'], Pantry: ['Quinoa', 'Farro', 'Brown rice', 'Corn tortillas', 'Beans', 'Walnuts'] },
  },
];

// ---- Plan finder quiz ----------------------------------------------------------------
const PLAN_QUIZ = [
  { id: 'goal', question: 'What matters most right now?', options: [['a1c', 'Lower my A1C / blood sugar'], ['weight', 'Lose weight'], ['energy', 'More steady energy'], ['strength', 'Build strength & muscle']] },
  { id: 'diet', question: 'How do you like to eat?', options: [['omnivore', 'Meat, fish & everything'], ['plant', 'Vegetarian / mostly plants'], ['flexible', 'No preference']] },
  { id: 'cook', question: 'Time you’ll spend on a typical meal?', options: [['15', '15 minutes or less'], ['30', 'About 30 minutes'], ['45', 'I enjoy cooking']] },
  { id: 'activity', question: 'How active are you today?', options: [['new', 'Mostly sitting'], ['some', 'Some walking'], ['regular', 'I work out 2–3× a week'], ['very', 'I train 4+ times a week']] },
  { id: 'time', question: 'Time for a workout, most days?', options: [['20', '20 minutes'], ['30', '30 minutes'], ['45', '45+ minutes']] },
  { id: 'equipment', question: 'What equipment do you have?', options: [['none', 'Nothing — bodyweight only'], ['basic', 'Bands or dumbbells at home'], ['gym', 'A gym']] },
  { id: 'joints', question: 'Any joint pain or need for low impact?', options: [['yes', 'Yes, keep it low impact'], ['no', 'No']] },
];

const EQUIP = { none: 0, basic: 1, gym: 2 };
const LEVEL = { new: 0, some: 1, regular: 2, very: 3 };

function scorePlans(a) {
  const scored = PLANS.map((p) => {
    let score = 0;
    const why = [];
    if (a.diet === 'plant') { if (p.diet === 'plant') { score += 6; why.push('Vegetarian menu'); } else score -= 4; }
    else if (a.diet === 'omnivore' && p.diet === 'plant') score -= 1;
    if (p.cookTime <= Number(a.cook)) { score += 2; if (Number(a.cook) === 15) why.push('15-minute meals'); } else score -= 3;
    if (p.workoutMinutes <= Number(a.time)) { score += 2; why.push(`${p.workoutMinutes}-minute workouts fit your time`); } else score -= 3;
    if (EQUIP[p.equipment] <= EQUIP[a.equipment]) score += 1; else score -= 4;
    const lvl = LEVEL[a.activity];
    if (p.intensity === 'low') score += lvl === 0 ? 3 : lvl === 1 ? 0 : -2;
    if (p.intensity === 'moderate') score += lvl >= 1 && lvl <= 2 ? 2 : 0;
    if (p.intensity === 'high') score += lvl >= 2 ? 3 : -4;
    if (a.joints === 'yes') { if (p.lowImpact) { score += 3; why.push('Low impact on joints'); } else if (p.intensity === 'high') score -= 3; }
    if (p.goals.includes(a.goal)) { score += 2; why.push(`Built for ${{ a1c: 'lowering A1C', weight: 'weight loss', energy: 'steady energy', strength: 'building strength' }[a.goal]}`); }
    if (p.id === 'steady-core-12') score += 1; // flagship tie-breaker
    return { plan: p, score, why: [...new Set(why)].slice(0, 3) };
  });
  return scored.sort((x, y) => y.score - x.score);
}

// Suggested pairings for the recommendation screen.
function suggestPairing(a) {
  const course = { a1c: 'foundations', weight: 'eat-to-stabilize', energy: 'sleep-stress-reset', strength: 'move-and-build' }[a.goal] || 'foundations';
  const blueprint = a.goal === 'weight' || a.goal === 'energy' ? 'craving-reset' : 'steady-5';
  return { course, blueprint };
}

// ---- Dates ---------------------------------------------------------------------------
const planById = Object.fromEntries(PLANS.map((p) => [p.id, p]));
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayOf(plan, startDate, date) {
  const diff = Math.round((new Date(`${date}T12:00:00Z`) - new Date(`${startDate}T12:00:00Z`)) / 864e5);
  if (diff < 0 || diff >= plan.weeks * 7) return null;
  const week = Math.floor(diff / 7) + 1;
  const dow = DOW[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const raw = plan.schedule[dow];
  const workout = raw === 'Rest' || !raw ? { focus: 'Rest', detail: 'Rest day — gentle stretching if you like', minutes: 0, rest: true }
    : typeof raw === 'string' ? { focus: raw, detail: `${WORKOUTS[raw].minutes} min · ${WORKOUTS[raw].moves.length} moves`, minutes: WORKOUTS[raw].minutes, moves: WORKOUTS[raw].moves, strength: raw !== 'Mobility' }
      : { ...raw, walk: true };
  return {
    dayNumber: diff + 1,
    week,
    phase: plan.phases.find((ph) => week >= ph.weeks[0] && week <= ph.weeks[1]) || plan.phases[plan.phases.length - 1],
    meals: plan.meals.find((m) => m.day === dow),
    workout,
    dow,
  };
}

function endDate(plan, startDate) {
  const [y, m, d] = startDate.split('-').map(Number);
  const e = new Date(Date.UTC(y, m - 1, d + plan.weeks * 7 - 1));
  return e.toISOString().slice(0, 10);
}

module.exports = { PLANS, planById, WORKOUTS, PLAN_QUIZ, scorePlans, suggestPairing, dayOf, endDate };
