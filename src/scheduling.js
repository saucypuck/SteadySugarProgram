// Coach availability + call types. Availability is generated from a simple weekly
// template for now. TODO(calendar): read real availability from Google Calendar/Calendly/Zoom.

const CALL_TYPES = {
  discovery: { id: 'discovery', name: 'Free Discovery Call', minutes: 20, desc: 'See if the program is a fit. No pressure.' },
  kickoff: { id: 'kickoff', name: 'VIP Kickoff Call', minutes: 60, desc: 'Review your quiz, numbers and goals; build your personal plan.' },
  coaching: { id: 'coaching', name: 'Coaching Call', minutes: 30, desc: 'Review your readings, troubleshoot, set next week’s focus.' },
};

const SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '16:00', '18:00'];
const WORKDAYS = [1, 2, 3, 4, 5]; // Mon–Fri

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// "Today" in the business time zone (not the server's UTC clock), so evening
// users in the US don't see tomorrow's plan. Override with APP_TIMEZONE.
const TZ = process.env.APP_TIMEZONE || 'America/New_York';
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function formatDate(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}

// bookings: existing bookings (any user) so taken slots disappear.
function availability(bookings, days = 14) {
  const taken = new Set(bookings.filter((b) => b.status === 'booked').map((b) => `${b.date} ${b.time}`));
  const out = [];
  const start = new Date();
  for (let i = 1; out.length < days && i < days * 2; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    if (!WORKDAYS.includes(d.getUTCDay())) continue;
    const date = isoDate(d);
    out.push({ date, label: formatDate(date), slots: SLOTS.filter((t) => !taken.has(`${date} ${t}`)) });
  }
  return out.slice(0, 10);
}

function isUpcoming(b) {
  return b.status === 'booked' && b.date >= today();
}

module.exports = { CALL_TYPES, availability, formatDate, formatTime, isUpcoming, isoDate, today };
