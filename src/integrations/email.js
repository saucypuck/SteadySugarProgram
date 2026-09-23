// Email adapter. Logs to the console until a provider is connected.
// TODO(email): plug in Postmark / Resend / ConvertKit and map these templates
// to real sequences (lead nurture, welcome, call reminders, dunning).

const TEMPLATES = {
  lead_guide: 'Your free 7-Day Steady Sugar Meal Guide',
  lead_quiz: 'Your Steady Sugar quiz results',
  welcome: 'Welcome to Steady Sugar — start here',
  booking_confirmed: 'Your call is booked',
  password_reset: 'Reset your password',
};

async function send(to, template, data = {}) {
  console.log(`[email] -> ${to} :: ${TEMPLATES[template] || template}`, JSON.stringify(data));
  return { queued: true };
}

module.exports = { send, TEMPLATES };
