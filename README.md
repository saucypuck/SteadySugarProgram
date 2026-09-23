# Steady Sugar — Blood Sugar Coaching Platform

A working skeleton for a health-coaching business: a sales funnel, onboarding quiz, auth, checkout, member area (courses, meal and workout plans, glucose tracker, call booking), and an admin dashboard. Node + Express + EJS. No build step.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

With no `DATABASE_URL` it uses an in-memory store and seeds demo data:

| Role   | Email                    | Password   |
|--------|--------------------------|------------|
| Member | `demo@steadysugar.test`  | `demo1234` |
| Admin  | `admin@steadysugar.test` | `admin1234`|

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
Results /quiz/results  → persona + recommended plan
      ├──► Checkout /checkout?plan=…  (account + payment + order bump)
      │         ▼
      │    Welcome /welcome (goals) → book a kickoff call → Dashboard /app
      └──► Free discovery call /book-call (sales call for people who aren't ready to buy)
```

**Member area** `/app`: dashboard (next lesson, next call, glucose trend, quick log, daily habits, upgrade prompts) · courses and lessons with progress tracking · nutrition and workout plans · tracker · calls (monthly allowance per plan) · account and billing.

**Admin** `/admin`: MRR, revenue, members, leads (hot leads to call first), funnel conversion, members by plan, upcoming calls, orders with UTM source.

## Where things live

| What | File |
|------|------|
| Pricing, plans, courses, meal and workout plans, quiz questions, FAQs, testimonials | `src/content.js` |
| Quiz scoring (persona, recommended plan, lead temperature) | `src/quiz.js` |
| Availability, call types | `src/scheduling.js` |
| **Payments (Stripe goes here)** | `src/integrations/payments.js` |
| **Email (Postmark/Resend/ConvertKit)** | `src/integrations/email.js` |
| **Video calls (Zoom/Meet)** | `src/integrations/meetings.js` |
| Funnel event tracking | `src/track.js` |
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
- [ ] Analytics pixels (GA4/Meta) from `src/track.js`
- [ ] `SEED_DEMO=false`, and set `ADMIN_EMAILS`
