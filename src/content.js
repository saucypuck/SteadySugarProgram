// All offer, program and curriculum content lives here so copy/pricing can be
// edited without touching routes or templates. Bracketed text = placeholder.

const brand = {
  name: 'Steady Sugar',
  tagline: 'Blood sugar coaching for real life',
  coach: '[Coach Name]',
  coachTitle: '[Credentials — e.g. RDN, CDCES, NBC-HWC]',
  supportEmail: 'support@steadysugar.example',
  programWeeks: 12,
  timezoneLabel: 'ET',
};

// Tiers, lowest to highest. `rank` drives content gating (see tierAllows).
const plans = {
  free: {
    id: 'free',
    rank: 0,
    name: 'Free',
    price: 0,
    interval: 'mo',
    tagline: 'Explore the program and start building habits.',
    callsPerMonth: 0,
    features: [
      'Blood Sugar Profile quiz + results',
      '4 free preview lessons (Foundations + Gut Health)',
      'Sample day from the meal plan',
      'Glucose & habit tracker',
      'Browse the full program',
    ],
  },
  core: {
    id: 'core',
    rank: 1,
    name: 'Core Program',
    price: 49,
    interval: 'mo',
    popular: true,
    tagline: 'The complete self-guided program, plus coaching calls.',
    callsPerMonth: 2,
    features: [
      'Everything in Free',
      'All 8 courses unlocked (nutrition, gut health, exercise & more)',
      'Full weekly meal plans + grocery lists',
      'Full walk & strength workout plans',
      '2 × 30-min coaching calls / month',
    ],
  },
  vip: {
    id: 'vip',
    rank: 2,
    name: 'VIP 1:1',
    price: 999,
    interval: 'mo',
    tagline: 'Hands-on, fully personalized 1:1 coaching.',
    callsPerMonth: 4,
    kickoff: true,
    features: [
      'Everything in Core Program',
      '60-min kickoff + weekly 1:1 calls',
      'Custom nutrition & training plan built with you',
      'Weekly CGM / glucose data review',
      'Direct messaging access to your coach',
      'Bonus: CGM Deep Dive course',
    ],
  },
};

// Plan ids from earlier versions, mapped to current tiers.
const legacyPlans = { starter: 'core', coaching: 'core' };

const guarantee = {
  title: '30-Day Steady Start Guarantee',
  body: 'Follow the first 30 days of the program. If you don’t feel more in control of your energy and cravings, email us for a full refund. [Confirm terms before launch.]',
};

// Sample social proof. MUST be replaced with real, consented client results before launch.
const testimonials = [
  { name: '[Client A.]', meta: 'Prediabetes · Week 12', quote: '[Sample] My afternoon crashes are gone and my A1C moved from 6.1 to 5.7. I never felt like I was on a diet.' },
  { name: '[Client B.]', meta: 'Type 2 · Week 8', quote: '[Sample] Having a coach to check my numbers with every other week kept me consistent for the first time.' },
  { name: '[Client C.]', meta: 'Prediabetes · Week 6', quote: '[Sample] The walking-after-meals habit alone changed my post-dinner readings.' },
];

const faqs = [
  { q: 'Is this a replacement for my doctor or medication?', a: 'No. Steady Sugar is lifestyle coaching that works alongside your healthcare team. Never change medication without talking to your doctor.' },
  { q: 'Who is this for?', a: 'Adults with prediabetes, type 2 diabetes, or a family history who want practical food, movement and habit changes. It is not designed for type 1 diabetes or pregnancy.' },
  { q: 'Do I need a continuous glucose monitor (CGM)?', a: 'No. A basic finger-stick meter works great. If you have a CGM, VIP members get weekly data reviews.' },
  { q: 'How much time does it take?', a: 'About 20 minutes of lessons per week plus small daily habits. Coaching calls are 30 minutes.' },
  { q: 'Is there really a free plan?', a: 'Yes. Create a free account to take the quiz, use the tracker, try 4 preview lessons and a sample meal plan day. No credit card needed.' },
  { q: 'Can I switch or cancel my plan?', a: 'Yes — upgrade, downgrade or cancel anytime from your account page.' },
];

const roadmap = [
  { weeks: '1–2', title: 'Foundations', body: 'Understand your numbers, set your baseline, and install the 3 core habits.' },
  { weeks: '3–6', title: 'Eat to Stabilize', body: 'Plate method, food order, smart carbs and snacks that don’t spike.' },
  { weeks: '7–10', title: 'Move & Build', body: 'Post-meal walks and 2×/week strength training to improve insulin sensitivity.' },
  { weeks: '11–12', title: 'Habits That Stick', body: 'Handle setbacks, eat out with confidence, and lock in your maintenance plan.' },
];

// Courses, categories and bundles live in ./courses.js
const { courses, courseCategories, categoryById, bundles } = require('./courses');

const nutritionPlan = {
  targets: [
    { label: 'Protein', value: '25–35g per meal' },
    { label: 'Fiber', value: '30g+ per day' },
    { label: 'Carbs', value: '30–45g per meal, paired' },
    { label: 'Water', value: '8+ cups per day' },
  ],
  week: [
    { day: 'Mon', breakfast: 'Greek yogurt, berries, walnuts, chia', lunch: 'Chicken & chickpea salad bowl', dinner: 'Salmon, roasted broccoli, ½ cup quinoa', snack: 'Apple + 2 tbsp peanut butter' },
    { day: 'Tue', breakfast: 'Veggie egg scramble + 1 slice sprouted toast', lunch: 'Turkey & hummus lettuce wraps, lentil soup', dinner: 'Turkey chili with beans, side salad', snack: 'Cottage cheese + cucumber' },
    { day: 'Wed', breakfast: 'Protein oats (oats, egg whites, cinnamon)', lunch: 'Leftover turkey chili', dinner: 'Sheet-pan chicken fajitas, black beans', snack: 'Handful almonds + cheese stick' },
    { day: 'Thu', breakfast: 'Greek yogurt, berries, walnuts, chia', lunch: 'Tuna & white bean salad', dinner: 'Shrimp stir-fry, cauliflower + ½ cup brown rice', snack: 'Veggies + hummus' },
    { day: 'Fri', breakfast: 'Veggie egg scramble + avocado', lunch: 'Leftover stir-fry', dinner: 'Eating-out night — use the restaurant script', snack: 'Pear + string cheese' },
    { day: 'Sat', breakfast: 'Protein pancakes (cottage cheese, egg, oats)', lunch: 'Big salad with grilled chicken', dinner: 'Lean burger (lettuce or half bun), roasted veg', snack: 'Dark chocolate square + almonds' },
    { day: 'Sun', breakfast: 'Smoked salmon, eggs, tomatoes', lunch: 'Prep day: grain bowls', dinner: 'Roast chicken, green beans, sweet potato (½)', snack: 'Greek yogurt + cinnamon' },
  ],
  grocery: {
    Protein: ['Chicken breast/thighs', 'Salmon', 'Shrimp', 'Ground turkey', 'Eggs', 'Greek yogurt', 'Cottage cheese', 'Canned tuna'],
    Produce: ['Broccoli', 'Cauliflower', 'Bell peppers', 'Leafy greens', 'Cucumber', 'Tomatoes', 'Berries', 'Apples', 'Pears', 'Avocado'],
    Pantry: ['Quinoa', 'Brown rice', 'Rolled oats', 'Chickpeas', 'Black beans', 'Lentils', 'Chia seeds', 'Walnuts', 'Almonds', 'Peanut butter'],
  },
};

const workoutPlan = {
  phases: [
    { weeks: '1–4', title: 'Build the base', body: '10-min walk after 2 meals daily + Strength A twice/week.' },
    { weeks: '5–8', title: 'Add intensity', body: '10-min walks after every meal + alternate Strength A/B, 3×/week.' },
    { weeks: '9–12', title: 'Progress & own it', body: 'Add 1 brisk 30-min walk/week + progress weights or reps.' },
  ],
  week: [
    { day: 'Mon', focus: 'Strength A', detail: '25 min + post-dinner walk' },
    { day: 'Tue', focus: 'Walk', detail: '10 min after lunch & dinner' },
    { day: 'Wed', focus: 'Strength B', detail: '25 min + post-dinner walk' },
    { day: 'Thu', focus: 'Walk', detail: '10 min after lunch & dinner' },
    { day: 'Fri', focus: 'Strength A', detail: '25 min + post-dinner walk' },
    { day: 'Sat', focus: 'Long walk', detail: '30–45 min, easy pace' },
    { day: 'Sun', focus: 'Rest', detail: 'Gentle stretching' },
  ],
  workouts: {
    'Strength A': [
      { name: 'Sit-to-stand squats', sets: '3', reps: '10–12' },
      { name: 'Wall or incline push-ups', sets: '3', reps: '8–12' },
      { name: 'Band or dumbbell rows', sets: '3', reps: '10–12' },
      { name: 'Glute bridges', sets: '3', reps: '12–15' },
      { name: 'Dead bug', sets: '2', reps: '8/side' },
    ],
    'Strength B': [
      { name: 'Reverse lunges (supported)', sets: '3', reps: '8/side' },
      { name: 'Dumbbell overhead press', sets: '3', reps: '8–10' },
      { name: 'Romanian deadlift', sets: '3', reps: '10–12' },
      { name: 'Step-ups', sets: '3', reps: '8/side' },
      { name: 'Plank', sets: '3', reps: '20–40 sec' },
    ],
  },
};

const quiz = [
  {
    id: 'goal',
    question: 'What’s your #1 goal right now?',
    options: [
      { value: 'a1c', label: 'Lower my A1C / blood sugar numbers' },
      { value: 'prevent', label: 'Keep prediabetes from becoming diabetes' },
      { value: 'weight', label: 'Lose weight without extreme dieting' },
      { value: 'energy', label: 'Stop energy crashes & cravings' },
      { value: 'meds', label: 'Rely less on medication (with my doctor)' },
    ],
  },
  {
    id: 'status',
    question: 'Which best describes you?',
    options: [
      { value: 'prediabetes', label: 'I’ve been told I have prediabetes' },
      { value: 't2', label: 'I have type 2 diabetes' },
      { value: 'risk', label: 'No diagnosis, but I’m at risk / concerned' },
      { value: 'unsure', label: 'I’m not sure' },
    ],
  },
  {
    id: 'a1c',
    question: 'What was your most recent A1C?',
    options: [
      { value: 'normal', label: 'Under 5.7%' },
      { value: 'pre', label: '5.7% – 6.4%' },
      { value: 'high', label: '6.5% or higher' },
      { value: 'unknown', label: 'I don’t know' },
    ],
  },
  {
    id: 'challenge',
    question: 'What gets in your way the most?',
    options: [
      { value: 'cravings', label: 'Sugar & carb cravings' },
      { value: 'energy', label: 'Afternoon energy crashes' },
      { value: 'food', label: 'Not knowing what to eat' },
      { value: 'time', label: 'No time to cook or exercise' },
      { value: 'consistency', label: 'I start strong, then fall off' },
    ],
  },
  {
    id: 'activity',
    question: 'How active are you on a typical week?',
    options: [
      { value: 'low', label: 'Mostly sitting' },
      { value: 'some', label: 'Some walking' },
      { value: 'regular', label: 'I exercise 2–3× a week' },
      { value: 'high', label: 'I exercise 4+ times a week' },
    ],
  },
  {
    id: 'support',
    question: 'How much support would help you most?',
    options: [
      { value: 'self', label: 'Give me the plan — I’ll run with it' },
      { value: 'accountability', label: 'A plan plus regular check-ins with a coach' },
      { value: 'handson', label: 'Hands-on, weekly 1:1 coaching' },
    ],
  },
  {
    id: 'timing',
    question: 'When do you want to start?',
    options: [
      { value: 'now', label: 'Right away — I’m ready' },
      { value: 'month', label: 'Within the next month' },
      { value: 'exploring', label: 'Just exploring for now' },
    ],
  },
];

module.exports = { brand, plans, legacyPlans, guarantee, testimonials, faqs, roadmap, courses, courseCategories, categoryById, bundles, nutritionPlan, workoutPlan, quiz };
