// Video-call adapter. Returns a placeholder link until Zoom/Google Meet is connected.
// TODO(zoom): create a meeting via the Zoom API (or Google Calendar + Meet) and
// push the event to the coach's calendar. Also sync coach availability from there.

async function createMeeting({ booking }) {
  return {
    provider: 'placeholder',
    joinUrl: `https://example.com/meet/${booking.id.slice(0, 8)}`,
  };
}

module.exports = { createMeeting };
