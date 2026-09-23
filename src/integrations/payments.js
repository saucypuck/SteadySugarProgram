// Payments adapter. Everything that touches money goes through here so swapping
// the demo provider for Stripe is a one-file change.
//
// TODO(stripe): when STRIPE_SECRET_KEY is set, create a Checkout Session or
// Subscription here, return its URL, and confirm the order from a webhook
// (POST /webhooks/stripe) instead of marking it paid immediately.

const provider = process.env.STRIPE_SECRET_KEY ? 'stripe' : 'demo';

async function charge({ user, plan }) {
  const amount = plan.price;
  if (provider === 'stripe') {
    throw new Error('Stripe not wired yet — see src/integrations/payments.js');
  }
  return { provider, status: 'paid', amount, reference: `demo_${Date.now()}`, customer: user.email };
}

async function cancelSubscription(user) {
  return { provider, status: 'canceled', customer: user.email };
}

module.exports = { provider, charge, cancelSubscription };
