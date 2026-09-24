// Minimal iCalendar (RFC 5545) writer for member calendar feeds and single-event downloads.
// Event: { uid, date: 'YYYY-MM-DD', time?: 'HH:MM', minutes?, allDay?, tzid?, summary, description?, url?, alarms?: [minutesBefore] }
// Times without tzid are "floating" (shown at that local time wherever the member is) —
// right for personal routines. Coaching calls pass the business tzid.

const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Lines longer than 75 octets must be folded (CRLF + space).
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let chunk = '';
  for (const ch of line) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > (out.length ? 74 : 75)) { out.push(chunk); chunk = ''; }
    chunk += ch;
  }
  out.push(chunk);
  return out.join('\r\n ');
}

const compact = (d) => d.replace(/-/g, '');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function addMinutes(date, time, minutes) {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi + minutes));
  const p = (n) => String(n).padStart(2, '0');
  return { date: `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`, time: `${p(t.getUTCHours())}:${p(t.getUTCMinutes())}` };
}

function eventLines(e, domain) {
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}@${domain}`, `DTSTAMP:${stamp()}`];
  if (e.allDay || !e.time) {
    const next = addMinutes(e.date, '00:00', 24 * 60).date;
    lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(next)}`);
  } else {
    const end = addMinutes(e.date, e.time, e.minutes || 30);
    const tz = e.tzid ? `;TZID=${e.tzid}` : '';
    lines.push(`DTSTART${tz}:${compact(e.date)}T${e.time.replace(':', '')}00`, `DTEND${tz}:${compact(end.date)}T${end.time.replace(':', '')}00`);
  }
  lines.push(`SUMMARY:${esc(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  if (e.category) lines.push(`CATEGORIES:${esc(e.category)}`);
  lines.push('TRANSP:' + (e.busy ? 'OPAQUE' : 'TRANSPARENT'));
  for (const m of e.alarms || []) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.summary)}`, `TRIGGER:-PT${Math.max(0, m)}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

function calendar({ name, events, domain = 'steadysugar.app', refreshHours = 4 }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Steady Sugar//Member Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H`,
    `X-PUBLISHED-TTL:PT${refreshHours}H`,
  ];
  for (const e of events) lines.push(...eventLines(e, domain));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { calendar, addMinutes };
