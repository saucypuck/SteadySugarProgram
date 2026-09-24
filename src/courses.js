// Course catalog: categories, bundles and courses. Edit copy here — pages are generated.
// Keep course/lesson `slug`s stable: member progress is stored as "course/lesson".
//
// Course fields:
//   category   one of CATEGORIES ids          tier     minimum plan to unlock (free lessons are open to all)
//   tags       used for filtering + bundles   weeks    where it sits in the 12-week roadmap (optional)
//   trailer    { url, poster, duration } — url may be a YouTube/Vimeo embed URL or an .mp4; blank shows a placeholder
//   modules    [{ title, lessons: [...] }]   lesson: { slug, title, minutes, type: video|reading|worksheet, free?, action }
//   blueprint  (Blueprints only) { days, daily: [{ id, label }], weeks: [{ title, goal, tasks: [] }], checkin } —
//              turns a course into a dated action program with a daily checklist, streaks and weekly check-ins.

const CATEGORIES = [
  { id: 'education', name: 'Blood Sugar Education', icon: '🩸', blurb: 'Understand what’s happening in your body and what your numbers mean.' },
  { id: 'frameworks', name: 'Blueprints', icon: '🧭', blurb: 'Step-by-step action plans with daily tasks, streaks and weekly check-ins — built to deliver results, not just information.' },
  { id: 'nutrition', name: 'Nutrition', icon: '🥗', blurb: 'What, when and how to eat for steadier blood sugar.' },
  { id: 'gut', name: 'Gut Health', icon: '🦠', blurb: 'How your gut shapes cravings, inflammation and glucose response.' },
  { id: 'exercise', name: 'Exercise & Movement', icon: '🚶', blurb: 'Movement that improves insulin sensitivity — no gym required.' },
  { id: 'lifestyle', name: 'Sleep & Stress', icon: '🌙', blurb: 'The hidden drivers of morning highs and cravings.' },
  { id: 'tracking', name: 'Tracking & Tech', icon: '📈', blurb: 'Glucose meters, CGMs and using your data well.' },
];

// Bundles group courses by tag — useful for program tracks, upsells and future à-la-carte sales.
const BUNDLES = [
  { id: 'core-program', name: 'The 12-Week Steady Sugar Program', tag: 'core-program', blurb: 'The step-by-step roadmap, in order.' },
  { id: 'kitchen', name: 'Kitchen Confidence Pack', tag: 'kitchen', blurb: 'Everything food: plates, swaps, snacks and prep.' },
  { id: 'root-causes', name: 'Root Causes Pack', tag: 'root-causes', blurb: 'Gut, sleep and stress — the drivers behind stubborn numbers.' },
  { id: 'quick-wins', name: 'Quick Wins', tag: 'quick-wins', blurb: 'Short lessons with changes you’ll feel this week.' },
];

const COURSES = [
  {
    slug: 'foundations',
    title: 'Steady Sugar Foundations',
    category: 'education',
    tier: 'core',
    weeks: '1–2',
    level: 'Beginner',
    tags: ['core-program', 'start-here', 'quick-wins', 'a1c'],
    summary: 'How blood sugar works and the three habits that move it most.',
    description: 'Start here. In two weeks you’ll understand what drives your blood sugar up and down, how to read your A1C, fasting and post-meal numbers, and you’ll install the three habits with the biggest payoff: the Steady Plate, food order and the 10-minute walk.',
    outcomes: ['Explain what A1C, fasting and post-meal readings tell you', 'Build a Steady Plate for any meal', 'Use food order to blunt spikes without eating less', 'Take a baseline so you can measure progress'],
    audience: 'Anyone newly diagnosed with prediabetes or type 2, or who has been told to “watch their sugar.”',
    resources: ['Baseline tracking sheet', 'Steady Plate printable', 'Numbers cheat sheet'],
    trailer: { url: '', poster: '', duration: '1:24' },
    modules: [
      { title: 'Understand your body', lessons: [
        { slug: 'how-blood-sugar-works', title: 'How blood sugar really works', minutes: 8, type: 'video', free: true, action: 'Write down three meals from this week that left you tired or hungry within two hours.' },
        { slug: 'know-your-numbers', title: 'Know your numbers: A1C, fasting & post-meal', minutes: 10, type: 'video', free: true, action: 'Log a fasting reading on 3 mornings this week.' },
      ] },
      { title: 'The three core habits', lessons: [
        { slug: 'the-steady-plate', title: 'The Steady Plate', minutes: 9, type: 'video', free: true, action: 'Build one Steady Plate for dinner tonight and snap a photo.' },
        { slug: 'food-order', title: 'Food order: veggies & protein first', minutes: 6, type: 'video', action: 'Eat your vegetables and protein before your carbs at two meals.' },
        { slug: 'ten-minute-walk', title: 'The 10-minute post-meal walk', minutes: 7, type: 'video', action: 'Walk for 10 minutes after your largest meal on 4 days.' },
      ] },
      { title: 'Beyond food', lessons: [
        { slug: 'sleep-and-stress', title: 'Sleep, stress & morning highs', minutes: 11, type: 'video', action: 'Pick a consistent lights-out time and hold it for 5 nights.' },
      ] },
    ],
  },
  {
    slug: 'steady-5',
    title: 'The Steady 5 Blueprint',
    category: 'frameworks',
    tier: 'core',
    level: 'Beginner',
    tags: ['start-here', 'quick-wins', 'habits'],
    summary: 'A 21-day blueprint: five daily non-negotiables that keep your numbers steady on busy days.',
    description: 'When life gets busy, you don’t need a perfect plan — you need a minimum. The Steady 5 is a one-page daily framework (protein, plate, walk, water, wind-down) you can run on autopilot, with a scorecard to keep you honest.',
    outcomes: ['Know your five daily non-negotiables', 'Use the Steady 5 scorecard in under a minute a day', 'Adapt the framework for travel, holidays and sick days'],
    audience: 'Busy people who want a simple rule set instead of a meal plan.',
    resources: ['Steady 5 daily scorecard', 'Travel & holiday version'],
    trailer: { url: '', poster: '', duration: '0:58' },
    blueprint: {
      days: 21,
      daily: [
        { id: 'protein', label: '25g+ protein at breakfast' },
        { id: 'plate', label: 'At least one Steady Plate' },
        { id: 'walk', label: '10-minute walk after your biggest meal' },
        { id: 'water', label: '8 cups of water' },
        { id: 'winddown', label: 'Wind-down and lights out on time' },
      ],
      weeks: [
        { title: 'Learn & baseline', goal: 'Hit at least 3 of 5 every day', tasks: ['Watch the 4 short lessons', 'Print your scorecard', 'Log 3 fasting readings'] },
        { title: 'Consistency', goal: 'All 5 on at least 5 days', tasks: ['Write your busy-day minimum', 'Tell one person your goal'] },
        { title: 'Own it', goal: 'All 5 on 6+ days', tasks: ['Compare week-1 vs week-3 readings', 'Decide which habits stay for good'] },
      ],
      checkin: 'How consistent were you with the Steady 5 this week?',
    },
    modules: [
      { title: 'The framework', lessons: [
        { slug: 'why-a-minimum', title: 'Why a daily minimum beats a perfect plan', minutes: 6, type: 'video', action: 'Rate your last 3 days: how many were “all or nothing”?' },
        { slug: 'the-five', title: 'The Steady 5, one by one', minutes: 12, type: 'video', action: 'Print the scorecard and fill it in tonight.' },
        { slug: 'scorecard', title: 'Using the scorecard', minutes: 5, type: 'worksheet', action: 'Score yourself 5 days in a row.' },
      ] },
      { title: 'Real life', lessons: [
        { slug: 'off-days', title: 'Travel, holidays & sick days', minutes: 8, type: 'video', action: 'Write your “minimum Steady 5” for your next trip or event.' },
      ] },
    ],
  },
  {
    slug: 'craving-reset',
    title: 'Craving Reset',
    category: 'frameworks',
    tier: 'core',
    level: 'Beginner',
    tags: ['cravings', 'quick-wins', 'kitchen', 'root-causes'],
    summary: 'A 14-day blueprint to break the spike–crash–crave cycle.',
    description: 'Two focused weeks of daily actions that cut sugar cravings at the source: protein-first mornings, no liquid sugar, pairing every carb, and closing the kitchen at night — with a craving log so you can see the change.',
    outcomes: ['Cut evening cravings by closing the kitchen', 'Pair every carb so it doesn’t spike', 'Replace liquid sugar for good', 'See your cravings trend in your log'],
    audience: 'Anyone fighting afternoon or late-night sugar cravings.',
    resources: ['Craving log', 'Swap list for sweet drinks'],
    trailer: { url: '', poster: '', duration: '0:50' },
    blueprint: {
      days: 14,
      daily: [
        { id: 'protein', label: 'Protein-first breakfast (25g+)' },
        { id: 'drinks', label: 'No liquid sugar (soda, juice, sweet coffee)' },
        { id: 'pair', label: 'Pair every carb with protein, fat or fiber' },
        { id: 'kitchen', label: 'Kitchen closed 2 hours before bed' },
        { id: 'log', label: 'Rate today’s cravings (1–5) in your log' },
      ],
      weeks: [
        { title: 'Break the cycle', goal: '4 of 5 actions every day', tasks: ['Watch the 3 lessons', 'Clear sweet drinks from the house'] },
        { title: 'Lock it in', goal: 'All 5 actions on 5+ days', tasks: ['Compare craving scores: week 1 vs week 2', 'Pick your 2 forever habits'] },
      ],
      checkin: 'How were your cravings this week compared to before?',
    },
    modules: [
      { title: 'The reset', lessons: [
        { slug: 'why-cravings', title: 'Why cravings happen (it’s not willpower)', minutes: 7, type: 'video', action: 'Notice when cravings hit and what you ate 2–3 hours before.' },
        { slug: 'pairing', title: 'Pairing: the anti-spike move', minutes: 6, type: 'video', action: 'Pair every carb today.' },
        { slug: 'kitchen-close', title: 'Closing the kitchen', minutes: 5, type: 'video', action: 'Set a “kitchen closed” time and a replacement ritual.' },
      ] },
    ],
  },
  {
    slug: 'eat-to-stabilize',
    title: 'Eat to Stabilize',
    category: 'nutrition',
    tier: 'core',
    weeks: '3–6',
    level: 'Beginner',
    tags: ['core-program', 'kitchen', 'a1c', 'cravings'],
    summary: 'Practical nutrition without cutting out every food you love.',
    description: 'Learn how to swap, pair and portion carbs so you can keep the foods you enjoy, build a protein-forward breakfast that ends mid-morning cravings, and handle restaurants and social meals with a simple script.',
    outcomes: ['Make smart carb swaps and pairings', 'Hit 25g+ protein at breakfast', 'Stock snacks that won’t spike', 'Order confidently when eating out', 'Read a nutrition label in 30 seconds'],
    audience: 'Anyone who feels confused by conflicting diet advice.',
    resources: ['Carb swap list', 'Protein breakfast ideas', 'Restaurant script card'],
    trailer: { url: '', poster: '', duration: '1:12' },
    modules: [
      { title: 'Carbs, protein & snacks', lessons: [
        { slug: 'smart-carbs', title: 'Smart carbs: swap, pair, portion', minutes: 12, type: 'video', action: 'Make 2 carb swaps from the swap list.' },
        { slug: 'protein-breakfast', title: 'The protein-forward breakfast', minutes: 8, type: 'video', action: 'Hit 25g+ protein at breakfast 5 days this week.' },
        { slug: 'snacks-that-dont-spike', title: 'Snacks that don’t spike', minutes: 7, type: 'video', action: 'Stock 3 steady snacks at home and at work.' },
      ] },
      { title: 'Eating in the real world', lessons: [
        { slug: 'eating-out', title: 'Eating out & social meals', minutes: 9, type: 'video', action: 'Use the restaurant script at your next meal out.' },
        { slug: 'label-reading', title: 'Reading labels in 30 seconds', minutes: 6, type: 'reading', action: 'Audit 5 items in your pantry.' },
      ] },
    ],
  },
  {
    slug: 'meal-prep-simplified',
    title: 'Meal Prep, Simplified',
    category: 'nutrition',
    tier: 'core',
    level: 'Beginner',
    tags: ['kitchen', 'quick-wins', 'busy-schedule'],
    summary: 'One hour on Sunday, steady meals all week.',
    description: 'A no-fuss system for prepping proteins, veggies and smart carbs in about an hour, then mixing them into different meals all week so you never get bored — or stuck with drive-thru.',
    outcomes: ['Run a 60-minute weekly prep', 'Build 10+ meals from 6 prepped components', 'Keep a “steady pantry” for zero-prep nights'],
    audience: 'Busy professionals and parents short on time.',
    resources: ['Prep day checklist', 'Mix-and-match meal grid', 'Steady pantry list'],
    trailer: { url: '', poster: '', duration: '0:45' },
    modules: [
      { title: 'The system', lessons: [
        { slug: 'prep-hour', title: 'The one-hour prep', minutes: 10, type: 'video', action: 'Block 60 minutes this weekend for your first prep.' },
        { slug: 'mix-and-match', title: 'Mix-and-match meals', minutes: 8, type: 'video', action: 'Plan 5 meals from your prepped components.' },
        { slug: 'steady-pantry', title: 'The steady pantry', minutes: 6, type: 'reading', action: 'Restock 5 items from the pantry list.' },
        { slug: 'prep-checklist', title: 'Prep day checklist', minutes: 3, type: 'worksheet', action: 'Print and use the checklist on prep day.' },
      ] },
    ],
  },
  {
    slug: 'gut-health-reset',
    title: 'Gut Health Reset',
    category: 'gut',
    tier: 'core',
    level: 'Intermediate',
    tags: ['root-causes', 'kitchen', 'cravings', 'inflammation'],
    summary: 'Feed the gut bacteria that help you handle carbs better.',
    description: 'Your gut microbiome influences inflammation, cravings and how sharply your blood sugar rises after meals. This course shows you how to add fiber and fermented foods gradually (without the bloating), and which gut “fixes” are worth your money.',
    outcomes: ['Understand the gut–glucose connection', 'Reach 30g of fiber a day without discomfort', 'Add fermented foods you’ll actually eat', 'Spot gut-health marketing hype'],
    audience: 'Members with stubborn cravings, bloating or post-meal spikes despite eating well.',
    resources: ['30g fiber tracker', 'Fermented foods starter list'],
    trailer: { url: '', poster: '', duration: '1:05' },
    modules: [
      { title: 'The gut–glucose connection', lessons: [
        { slug: 'gut-and-glucose', title: 'How your gut shapes blood sugar', minutes: 9, type: 'video', free: true, action: 'Note any meals that leave you bloated or craving sugar.' },
        { slug: 'fiber-ramp', title: 'The fiber ramp: 30g without the bloat', minutes: 10, type: 'video', action: 'Add 5g of fiber per day this week.' },
      ] },
      { title: 'Feeding your gut', lessons: [
        { slug: 'fermented-foods', title: 'Fermented foods that fit your life', minutes: 7, type: 'video', action: 'Try one fermented food 3 times this week.' },
        { slug: 'supplements-hype', title: 'Probiotics & supplements: what’s worth it', minutes: 8, type: 'reading', action: 'Review any gut supplements you take against the checklist.' },
        { slug: 'fiber-tracker', title: '30g fiber tracker', minutes: 3, type: 'worksheet', action: 'Track fiber for 3 days.' },
      ] },
    ],
  },
  {
    slug: 'move-and-build',
    title: 'Move & Build',
    category: 'exercise',
    tier: 'core',
    weeks: '7–10',
    level: 'Beginner',
    tags: ['core-program', 'insulin-sensitivity', 'at-home'],
    summary: 'Movement that improves insulin sensitivity — no gym required.',
    description: 'Muscle is your biggest glucose sponge. Learn why strength training matters for blood sugar, how to progress safely at home, set a realistic step target, and see the difference movement makes in your own readings.',
    outcomes: ['Complete two 25-minute strength workouts a week', 'Progress safely without injury', 'Set and hit a personal step target', 'Use movement to lower post-meal readings'],
    audience: 'Beginners and returners — every exercise has an easier option.',
    resources: ['Strength A & B cards', 'Step target calculator'],
    trailer: { url: '', poster: '', duration: '1:18' },
    modules: [
      { title: 'Build strength', lessons: [
        { slug: 'why-muscle-matters', title: 'Why muscle is your glucose sponge', minutes: 7, type: 'video', action: 'Complete Strength A this week.' },
        { slug: 'progressing-safely', title: 'Progressing safely', minutes: 8, type: 'video', action: 'Add one rep or one set to each exercise.' },
      ] },
      { title: 'Move more, measure it', lessons: [
        { slug: 'step-targets', title: 'Setting your step target', minutes: 5, type: 'reading', action: 'Average +1,000 steps over last week.' },
        { slug: 'exercise-and-readings', title: 'Exercise & your readings', minutes: 9, type: 'video', action: 'Compare post-meal readings with and without a walk.' },
      ] },
    ],
  },
  {
    slug: 'sleep-stress-reset',
    title: 'Sleep & Stress Reset',
    category: 'lifestyle',
    tier: 'core',
    level: 'Beginner',
    tags: ['root-causes', 'morning-highs', 'quick-wins'],
    summary: 'Fix the hidden drivers of morning highs and late-night cravings.',
    description: 'Poor sleep and chronic stress raise cortisol, which raises blood sugar — even when you eat perfectly. Learn a wind-down routine, a 2-minute stress reset you can use anywhere, and how to tell whether your morning highs are the “dawn phenomenon.”',
    outcomes: ['Build a 20-minute wind-down routine', 'Use a 2-minute breathing reset for stress spikes', 'Understand and respond to morning highs'],
    audience: 'Anyone with high fasting numbers, poor sleep or stress eating.',
    resources: ['Wind-down routine builder', 'Stress reset audio (placeholder)'],
    trailer: { url: '', poster: '', duration: '0:52' },
    modules: [
      { title: 'Sleep', lessons: [
        { slug: 'sleep-and-glucose', title: 'Sleep and your glucose', minutes: 8, type: 'video', action: 'Track bedtime and fasting reading for 5 days.' },
        { slug: 'wind-down', title: 'Your wind-down routine', minutes: 7, type: 'worksheet', action: 'Build and follow your wind-down for 5 nights.' },
      ] },
      { title: 'Stress', lessons: [
        { slug: 'cortisol-and-cravings', title: 'Cortisol, cravings & stress eating', minutes: 9, type: 'video', action: 'Notice one stress-craving moment and pause for 2 minutes.' },
        { slug: 'two-minute-reset', title: 'The 2-minute stress reset', minutes: 4, type: 'video', action: 'Use the reset once a day this week.' },
      ] },
    ],
  },
  {
    slug: 'habits-that-stick',
    title: 'Habits That Stick',
    category: 'frameworks',
    tier: 'core',
    weeks: '11–12',
    level: 'Intermediate',
    tags: ['core-program', 'habits', 'maintenance'],
    summary: 'A 28-day blueprint to make your changes automatic and build your maintenance plan.',
    description: 'The final stretch of the program: turn what’s working into habits that survive busy seasons, learn to track without obsessing, bounce back fast from bad weeks, and leave with a written maintenance plan.',
    outcomes: ['Stack new habits onto existing routines', 'Choose a sustainable long-term tracking cadence', 'Recover from setbacks within 48 hours', 'Write your personal maintenance plan'],
    audience: 'Members finishing the 12-week program — or anyone who keeps restarting.',
    resources: ['Habit stacking planner', '“Bad week” reset plan', 'Maintenance worksheet'],
    trailer: { url: '', poster: '', duration: '1:02' },
    blueprint: {
      days: 28,
      daily: [
        { id: 'stack', label: 'Do your stacked habit (after your anchor routine)' },
        { id: 'track', label: 'Log one reading or quick check-in' },
        { id: 'reflect', label: 'One-line reflection: what worked today?' },
      ],
      weeks: [
        { title: 'Stack it', goal: 'Stacked habit on 5+ days', tasks: ['Pick your anchor routine', 'Watch “Tiny habits, big results”'] },
        { title: 'Track wisely', goal: 'Choose a tracking rhythm you can keep', tasks: ['Watch “Tracking without obsessing”', 'Set your long-term tracking cadence'] },
        { title: 'Bounce back', goal: 'No two missed days in a row', tasks: ['Write your “bad week” reset plan'] },
        { title: 'Maintenance', goal: 'Leave with a written plan', tasks: ['Complete the maintenance worksheet', 'Review it with your coach'] },
      ],
      checkin: 'How automatic did your habits feel this week?',
    },
    modules: [
      { title: 'Make it automatic', lessons: [
        { slug: 'tiny-habits', title: 'Tiny habits, big results', minutes: 8, type: 'video', action: 'Stack one new habit onto an existing routine.' },
        { slug: 'tracking-without-obsessing', title: 'Tracking without obsessing', minutes: 7, type: 'video', action: 'Choose your long-term tracking cadence.' },
      ] },
      { title: 'Make it last', lessons: [
        { slug: 'handling-setbacks', title: 'Handling setbacks', minutes: 9, type: 'video', action: 'Write your "bad week" reset plan.' },
        { slug: 'maintenance-plan', title: 'Your maintenance plan', minutes: 12, type: 'worksheet', action: 'Complete the maintenance worksheet and review it on your final call.' },
      ] },
    ],
  },
  {
    slug: 'cgm-deep-dive',
    title: 'CGM Deep Dive',
    category: 'tracking',
    tier: 'vip',
    level: 'Advanced',
    tags: ['cgm', 'data', 'vip-bonus'],
    summary: 'Read your CGM like a pro and run personal food experiments.',
    description: 'A continuous glucose monitor shows you exactly how your body responds to food, sleep and exercise. Learn to read the graph, run clean food experiments, and set time-in-range goals with your coach.',
    outcomes: ['Read a 24-hour CGM graph', 'Run a food experiment and interpret it', 'Set and track time-in-range goals'],
    audience: 'VIP members using (or starting) a CGM.',
    resources: ['Food experiment template', 'Time-in-range goal sheet'],
    trailer: { url: '', poster: '', duration: '1:30' },
    modules: [
      { title: 'Using your CGM', lessons: [
        { slug: 'reading-your-cgm', title: 'Reading your CGM graph', minutes: 10, type: 'video', action: 'Screenshot your 24h graph and label the spikes.' },
        { slug: 'food-experiments', title: 'Running a food experiment', minutes: 9, type: 'video', action: 'Test one favorite food two different ways.' },
        { slug: 'time-in-range', title: 'Time in range goals', minutes: 8, type: 'video', action: 'Set your personal time-in-range target.' },
      ] },
    ],
  },
];

// Flatten modules → lessons (routes and progress work on a flat list) and add totals.
const courses = COURSES.map((c) => {
  const lessons = c.modules.flatMap((m) => m.lessons.map((l) => ({ type: 'video', ...l, module: m.title })));
  return { ...c, lessons, totalMinutes: lessons.reduce((n, l) => n + l.minutes, 0) };
});

const categoryById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

module.exports = { courses, courseCategories: CATEGORIES, categoryById, bundles: BUNDLES };
