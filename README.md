# Steady Sugar — Blood Sugar Coaching Platform

A working skeleton for a health-coaching business: a sales funnel, onboarding quiz, auth, checkout, member area (courses, meal and workout plans, glucose tracker, call booking), and an admin dashboard. Node + Express + EJS. No build step.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

With no `DATABASE_URL` it uses an in-memory store and seeds demo data:

| Role        | Email                    | Password   |
|-------------|--------------------------|------------|
| Free member | `free@steadysugar.test`  | `free1234` |
| Core member | `demo@steadysugar.test`  | `demo1234` |
| Admin       | `admin@steadysugar.test` | `admin1234`|

## Plans

| Tier | Price | Access |
|------|-------|--------|
| **Free** | $0 | Anyone can sign up. Quiz, tracker, browse everything, 3 preview lessons, sample meal-plan day, workout overview. Locked content shows an upgrade preview. |
| **Core Program** (most popular) | $49/mo | All courses and lessons, full meal and workout plans, 2 × 30-min coaching calls a month. |
| **VIP 1:1** | $999/mo | Everything in Core, plus a kickoff call, weekly 1:1 calls, a custom plan, CGM review, direct messaging and the bonus CGM course. |

Tiers are defined in `src/content.js` (`plans`, each with a `rank`). A course sets the minimum `tier` it needs, and a lesson marked `free: true` is open to everyone. Gating is handled by `tierAllows` / `canOpenLesson` in `src/auth.js`.

## The funnel (business flow)

```
Ads / social / SEO
      │  (UTM captured on first visit)
      ▼
Landing page  /  ──► Free guide /free-guide ──► thank-you page → quiz
      │
      ▼
Quiz /quiz (7 questions + email) ──► lead saved (hot / warm / cold)
      ▼
Results /quiz/results  → persona + recommended plan (Free / Core / VIP)
      ├──► Free account /signup → member area with previews + upgrade prompts
      ├──► Checkout /checkout?plan=core|vip  (account + payment + order bump)
      │         ▼
      │    Welcome /welcome (goals) → book a kickoff call → Dashboard /app
      └──► Free discovery call /book-call (VIP applications: /book-call?plan=vip)
```

**Courses** `/app/courses`: 9 courses in 7 categories (Blood Sugar Education, Frameworks & Habits, Nutrition, Gut Health, Exercise & Movement, Sleep & Stress, Tracking & Tech).
- **Catalog:** a continue-learning row, and filters by category, bundle and tag.
- **Course landing pages:** a trailer (YouTube, Vimeo or .mp4, with a placeholder until one is added), description, outcomes, who it's for, tags, bundles, a sectioned lesson menu with done / free / locked / up-next states, what's included and downloads, the coach, and related courses.
- All course content lives in `src/courses.js`. Keep slugs stable, because member progress is keyed on them.

**Calendar** `/app/schedule`:
- **My Plan:** the courses a member follows (recommended from their quiz answers and plan), lesson days and time, meal reminders (per meal, a daily summary, or off), their weekly workout routine, a fasting-reading reminder, a weekly check-in, and how early alerts fire.
- **Week view** in the app, plus a **private calendar feed** at `/cal/<token>.ics` for Apple, Google or Outlook Calendar. Members subscribe once and get every event with alerts on their phone, no login needed.
- Events include the actual content: the meals, the exercises, the lesson's action step.
- Coaching calls carry the business time zone plus alerts 1 day and 1 hour before.
- The feed only includes content the member's tier unlocks. Members can reset their link; admins can see who has synced.
- "Today" follows the business time zone (`APP_TIMEZONE`, default America/New_York).

**Member area** `/app`: dashboard (next lesson, next call, glucose trend, quick log, daily habits, upgrade prompts) · courses and lessons with progress tracking · nutrition and workout plans · tracker · calls (monthly allowance per plan) · account and billing.

**Marketing** `/admin/marketing`: one lean page for ad and landing-page decisions.
- **Dashboard**:
  - Paid-traffic stats: spend, revenue, ROAS, leads and CPL, customers and CAC, page lead rate, CTR and CPC.
  - The ad funnel, "What's selling" (signups and sales by plan, and how many came from ads), and "Decisions needed" (pause/scale ads, call A/B tests, pages with no traffic).
  - Every landing page with the campaigns and ads sending it traffic nested underneath. Pages in a running A/B test are grouped with the test result, and drafts and retired pages are tucked away.
- **Campaigns & ads**: each campaign's totals with its ads underneath, a copy-link button for each ad's tracking URL, and the daily spend log.
- **A/B tests**: `/go/<slug>` splits traffic evenly and keeps each visitor on the same variant. Results show lift and significance; declaring a winner sends all traffic to it.
- **Attribution**: the last ad clicked (UTMs) and the landing page are saved on every lead, signup and purchase.

**Members** `/admin/members`: every account, with tabs by tier (Free / Core / VIP / Canceled / Complimentary), search, sorting and CSV export. Headline numbers: MRR, ARPU, free accounts, cancellations and weekly engagement. Each member page covers:
- **Subscription management:** change plan, cancel (with a reason), reactivate, mark complimentary (excluded from MRR), and send a password reset.
- **Profile:** engagement (lessons, readings, glucose trend, calls), goals, quiz answers, attribution, tags and billing history.
- **CRM:** notes, follow-up tasks and a full activity timeline.

**CRM** `/admin/crm`: a lead pipeline (New → Contacted → Call booked → Won / Lost, with lost reasons), follow-ups grouped into overdue / today / upcoming, a hot-lead filter and win rate. Leads come from the quiz, the free guide and discovery calls. A lead that becomes a member moves to Won automatically.

**Integrations** `/admin/integrations`: a catalog covering payments, email, SMS, calls and calendar, ad platforms, analytics, content and health data. Connect, change, test or disconnect each one.
- Keys are encrypted at rest with AES-256-GCM, using a key derived from `SESSION_SECRET`. Environment variables take precedence over saved values.
- **Live today:** Slack alerts, and custom outgoing webhooks (Zapier, Make, your own endpoints) that are HMAC-signed and fire on leads, signups, calls, purchases, cancellations and plan changes.
- The other integrations store their credentials now, ready for their adapters to be built.

**Admin** `/admin`: MRR, revenue, members, leads (hot leads to call first), funnel conversion, members by plan, upcoming calls, orders with UTM source.

## Where things live

| What | File |
|------|------|
| Pricing, plans, meal and workout plans, quiz questions, FAQs, testimonials | `src/content.js` |
| Courses, categories, bundles, trailers | `src/courses.js` |
| Quiz scoring (persona, recommended plan, lead temperature) | `src/quiz.js` |
| Availability, call types | `src/scheduling.js` |
| **Payments (Stripe goes here)** | `src/integrations/payments.js` |
| **Email (Postmark/Resend/ConvertKit)** | `src/integrations/email.js` |
| **Video calls (Zoom/Meet)** | `src/integrations/meetings.js` |
| Funnel event tracking + attribution | `src/track.js` |
| CRM helpers (notes, tasks, pipeline, timeline) | `src/crm.js` |
| Integration catalog + encrypted settings | `src/integrations/registry.js` |
| Outgoing webhooks + Slack alerts | `src/integrations/webhooks.js` |
| Marketing schemas, metrics, A/B stats, decision rules | `src/marketing.js` |
| Landing page + A/B split routes | `src/routes/lp.js` |
| Data store (Postgres JSONB, or in-memory) | `src/db.js` |
| Routes | `src/routes/{public,auth,checkout,member,admin}.js` |
| Templates / styles | `views/`, `public/css/styles.css` |

## Deploy (Render)

`render.yaml` is a Blueprint: a free Node web service and a free Postgres database. In Render, go to **New → Blueprint** and pick this repo. Every push to `main` redeploys automatically.

Environment variables:
- `SESSION_SECRET`: generated automatically
- `DATABASE_URL`: wired to the database automatically. If it's missing or can't be reached, the app falls back to in-memory storage.
- `SEED_DEMO`: demo accounts are created unless this is `false`. **Set it to `false` before launch.**
- `ADMIN_EMAILS`: comma-separated list of emails that get admin access

## Before launch checklist

- [ ] Stripe: Checkout/Subscriptions + webhook to confirm orders, customer portal for billing
- [ ] Email provider + nurture sequences (quiz leads, guide leads, abandoned checkout)
- [ ] Zoom/Google Calendar: real availability, meeting links, reminders (email/SMS)
- [ ] Video hosting for lessons (Vimeo/Mux) and the PDF guide
- [ ] Real testimonials, stats and coach bio (placeholders are in `[brackets]`)
- [ ] Terms, privacy and medical disclaimer drafted by a lawyer; confirm refund and guarantee terms
- [ ] Password reset tokens, rate limiting, CSRF protection
- [ ] Analytics pixels / server-side conversions (GA4, Meta CAPI, Google Ads) from `src/track.js`
- [ ] Automatic daily spend import from the Meta and Google Ads APIs into `spend` (manual entry for now)
- [ ] Set `PUBLIC_URL` so ad tracking URLs use your custom domain
- [ ] `SEED_DEMO=false`, and set `ADMIN_EMAILS`
