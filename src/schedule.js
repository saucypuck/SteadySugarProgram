// "My Plan" — what a member is following (courses, meal plan, workouts, habits) and
// the dated events it produces. Used by the in-app calendar, the dashboard "Today"
// card and the private calendar feed (/cal/<token>.ics).
const content = require('./content');
const sched = require('./scheduling');
const { planOf, tierAllows, canOpenLesson } = require('./auth');

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };
const ALARMS = [0, 5, 10, 15, 30, 60, 120];
// Quiz "biggest challenge" → extra course to recommend alongside the core program.
const CHALLENGE_COURSE = { cravings: 'gut-health-reset', energy: 'sleep-stress-reset', food: 'meal-prep-simplified', time: 'steady-5', consistency: 'steady-5' };

const courseBySlug = Object.fromEntries(content.courses.map((c) => [c.slug, c]));
const inLibrary = (user, c) => c.tier !== 'vip' || tierAllows(user, 'vip');

function recommendedCourses(user, lead) {
  const tier = planOf(user);
  if (tier === 'free' && !tierAllows(user, 'core')) return content.courses.filter((c) => c.lessons.some((l) => l.free)).map((c) => c.slug);
  const list = content.courses.filter((c) => c.tags.includes('core-program')).map((c) => c.slug);
  const extra = lead && lead.answers && CHALLENGE_COURSE[lead.answers.challenge];
  if (extra) list.splice(1, 0, extra);
  if (tierAllows(user, 'vip')) list.push('cgm-deep-dive');
  return [...new Set(list)];
}

function defaults(user, lead) {
  return {
    courses: recommendedCourses(user, lead),
    lessonDays: ['mon', 'wed', 'fri'],
    lessonTime: '07:00',
    meals: 'each', // off | daily | each
    mealTimes: { breakfast: '07:30', lunch: '12:30', dinner: '18:30' },
    workouts: true,
    workoutTime: '17:30',
    readings: true,
    readingTime: '06:45',
    weeklyReview: true,
    reviewDay: 'sun',
    reviewTime: '18:00',
    alarm: 10,
    emailDigest: false,
  };
}

function getSchedule(user, lead) {
  const d = defaults(user, lead);
  const s = user.schedule || {};
  return { ...d, ...s, mealTimes: { ...d.mealTimes, ...(s.mealTimes || {}) }, recommended: d.courses, isSetUp: !!s.updatedAt };
}

const validTime = (t, fallback) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : fallback);

function parse(body, current) {
  const days = [].concat(body.lessonDays || []).filter((d) => WEEKDAYS.includes(d));
  const courses = [].concat(body.courses || []).filter((s) => courseBySlug[s]);
  return {
    courses,
    lessonDays: days.length ? days : current.lessonDays,
    lessonTime: validTime(body.lessonTime, current.lessonTime),
    meals: ['off', 'daily', 'each'].includes(body.meals) ? body.meals : current.meals,
    mealTimes: {
      breakfast: validTime(body.breakfast, current.mealTimes.breakfast),
      lunch: validTime(body.lunch, current.mealTimes.lunch),
      dinner: validTime(body.dinner, current.mealTimes.dinner),
    },
    workouts: body.workouts === 'on',
    workoutTime: validTime(body.workoutTime, current.workoutTime),
    readings: body.readings === 'on',
    readingTime: validTime(body.readingTime, current.readingTime),
    weeklyReview: body.weeklyReview === 'on',
    reviewDay: WEEKDAYS.includes(body.reviewDay) ? body.reviewDay : current.reviewDay,
    reviewTime: validTime(body.reviewTime, current.reviewTime),
    alarm: ALARMS.includes(Number(body.alarm)) ? Number(body.alarm) : current.alarm,
    emailDigest: body.emailDigest === 'on',
    updatedAt: new Date().toISOString(),
  };
}

const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return sched.isoDate(new Date(Date.UTC(y, m - 1, d + n)));
};
const weekday = (iso) => WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const shiftTime = (t, mins) => {
  const [h, m] = t.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + mins);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// Lessons still to do, in the member's chosen course order (only ones they can open).
function lessonQueue(user, s) {
  const done = new Set(user.completedLessons || []);
  const queue = [];
  for (const slug of s.courses) {
    const c = courseBySlug[slug];
    if (!c || !inLibrary(user, c)) continue;
    for (const l of c.lessons) {
      if (!done.has(`${c.slug}/${l.slug}`) && canOpenLesson(user, c, l)) queue.push({ course: c, lesson: l });
    }
  }
  return queue;
}

// Concrete events between `from` and `to` (inclusive ISO dates).
function buildEvents(user, s, { from, to, base = '', bookings = [] }) {
  const full = tierAllows(user, 'core');
  const events = [];
  const today = sched.today();
  const alarm = [s.alarm];
  const link = (p) => `${base}${p}`;

  // Lessons: one per chosen lesson day, starting today, in order.
  const queue = lessonQueue(user, s);
  if (s.lessonDays.length && queue.length) {
    let day = today;
    let guard = 0;
    while (queue.length && day <= to && guard++ < 400) {
      if (s.lessonDays.includes(weekday(day))) {
        const { course, lesson } = queue.shift();
        if (day >= from) {
          events.push({
            uid: `lesson-${course.slug}-${lesson.slug}`, type: 'lesson', icon: '🎓', date: day, time: s.lessonTime, minutes: lesson.minutes,
            summary: `Lesson: ${lesson.title}`,
            description: `${course.title} · ${lesson.minutes} min\n\nThis week’s action: ${lesson.action}\n\nOpen the lesson: ${link(`/app/courses/${course.slug}/${lesson.slug}`)}`,
            url: link(`/app/courses/${course.slug}/${lesson.slug}`), alarms: alarm,
          });
        }
      }
      day = addDays(day, 1);
    }
  }

  for (let day = from; day <= to; day = addDays(day, 1)) {
    const wd = weekday(day);
    const label = DAY_NAMES[wd];

    if (s.readings) {
      events.push({ uid: `reading-${day}`, type: 'habit', icon: '🩸', date: day, time: s.readingTime, minutes: 5,
        summary: 'Log your fasting reading', description: `Before breakfast. Log it here: ${link('/app/log')}`, url: link('/app/log'), alarms: [0] });
    }

    const menu = content.nutritionPlan.week.find((d) => d.day === label);
    if (full && menu && s.meals !== 'off') {
      if (s.meals === 'daily') {
        events.push({ uid: `meals-${day}`, type: 'meal', icon: '🥗', date: day, time: s.mealTimes.breakfast, minutes: 15, summary: 'Today’s Steady Sugar meals',
          description: `Breakfast: ${menu.breakfast}\nLunch: ${menu.lunch}\nDinner: ${menu.dinner}\nSnack: ${menu.snack}\n\nFull plan + grocery list: ${link('/app/plans/nutrition')}`,
          url: link('/app/plans/nutrition'), alarms: [0] });
      } else {
        const m = [['breakfast', 'Breakfast', menu.breakfast, ''], ['lunch', 'Lunch', menu.lunch, `\nSnack idea: ${menu.snack}`], ['dinner', 'Dinner', menu.dinner, '\n\nTake a 10-minute walk after dinner.']];
        for (const [key, name, food, extra] of m) {
          events.push({ uid: `meal-${key}-${day}`, type: 'meal', icon: '🥗', date: day, time: s.mealTimes[key], minutes: 30, summary: `${name}: ${food}`,
            description: `${name}: ${food}${extra}\n\nSteady Plate: ½ veggies · ¼ protein · ¼ smart carbs.\nMeal plan: ${link('/app/plans/nutrition')}`,
            url: link('/app/plans/nutrition'), alarms: [Math.min(s.alarm, 15)] });
        }
      }
    }

    const w = content.workoutPlan.week.find((d) => d.day === label);
    if (full && s.workouts && w && w.focus !== 'Rest') {
      const moves = content.workoutPlan.workouts[w.focus];
      const isWalk = /walk/i.test(w.focus);
      events.push({
        uid: `workout-${day}`, type: 'workout', icon: isWalk ? '🚶' : '💪', date: day,
        time: w.focus === 'Walk' ? shiftTime(s.mealTimes.lunch, 30) : s.workoutTime,
        minutes: w.focus === 'Walk' ? 10 : w.focus === 'Long walk' ? 40 : 30,
        summary: `${isWalk ? '' : 'Workout: '}${w.focus}`,
        description: `${w.detail}${moves ? `\n\n${moves.map((x) => `• ${x.name} — ${x.sets} × ${x.reps}`).join('\n')}` : ''}\n\nWorkout plan: ${link('/app/plans/workout')}`,
        url: link('/app/plans/workout'), alarms: alarm,
      });
    }

    if (s.weeklyReview && wd === s.reviewDay) {
      events.push({ uid: `review-${day}`, type: 'habit', icon: '📋', date: day, time: s.reviewTime, minutes: 15, summary: 'Weekly check-in',
        description: `Review your readings, log your weight and pick one focus for next week.\n\nTracker: ${link('/app/log')}`, url: link('/app/log'), alarms: alarm });
    }
  }

  for (const b of bookings.filter((x) => x.status === 'booked' && x.date >= from && x.date <= to)) {
    const t = sched.CALL_TYPES[b.type] || sched.CALL_TYPES.coaching;
    events.push({ uid: `call-${b.id}`, type: 'call', icon: '📞', date: b.date, time: b.time, minutes: t.minutes, tzid: content.brand.timezone, busy: true,
      summary: `${t.name} with ${content.brand.coach}`, description: `${t.desc}\n\nJoin: ${b.joinUrl || link('/app/calendar')}\nReschedule or cancel: ${link('/app/calendar')}`,
      url: b.joinUrl || link('/app/calendar'), alarms: [60, 24 * 60] });
  }

  return events.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
}

module.exports = { WEEKDAYS, DAY_NAMES, ALARMS, getSchedule, parse, buildEvents, addDays, weekday, recommendedCourses };
