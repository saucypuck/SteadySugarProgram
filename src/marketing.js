// Marketing command center: campaigns → ads → landing pages → A/B experiments,
// plus spend and the funnel events they drive. Everything joins on attribution:
//   ad       = utm_campaign + utm_content
//   campaign = utm_campaign
//   page     = lp (landing page slug)
//   variant  = exp + lp
// Spend is entered manually for now. TODO(ads-api): import daily spend/impressions/
// clicks from Meta Marketing API + Google Ads API into the `spend` collection.
const db = require('./db');
const { isoDate } = require('./scheduling');

const CHANNELS = ['meta', 'google', 'tiktok', 'youtube', 'email', 'influencer', 'organic', 'other'];
const CTA_TARGETS = {
  quiz: { label: 'Take the quiz', href: '/quiz' },
  signup: { label: 'Create free account', href: '/signup' },
  'checkout-core': { label: 'Checkout — Core', href: '/checkout?plan=core' },
  'checkout-vip': { label: 'Checkout — VIP', href: '/checkout?plan=vip' },
  'book-call': { label: 'Book discovery call', href: '/book-call' },
  'free-guide': { label: 'Free meal guide', href: '/free-guide' },
};
const METRICS = {
  lead_rate: { label: 'Lead rate', key: 'leads' },
  purchase_rate: { label: 'Purchase rate', key: 'customers' },
};

// Form schemas — the admin CRUD screens are generated from these.
const ENTITIES = {
  campaigns: {
    label: 'Campaign',
    plural: 'Campaigns',
    list: '/admin/marketing/ads',
    fields: [
      { name: 'name', label: 'Campaign name', required: true },
      { name: 'channel', type: 'select', options: CHANNELS },
      { name: 'objective', type: 'select', options: ['leads', 'sales', 'traffic', 'awareness', 'retargeting'] },
      { name: 'utmCampaign', label: 'utm_campaign', required: true, slug: true, help: 'Used in every ad URL in this campaign. Lowercase, no spaces.' },
      { name: 'dailyBudget', label: 'Daily budget ($)', type: 'number' },
      { name: 'startDate', label: 'Start date', type: 'date' },
      { name: 'endDate', label: 'End date', type: 'date' },
      { name: 'status', type: 'select', options: ['draft', 'active', 'paused', 'ended'] },
      { name: 'notes', type: 'textarea' },
    ],
  },
  ads: {
    label: 'Ad',
    plural: 'Ads',
    list: '/admin/marketing/ads',
    fields: [
      { name: 'name', label: 'Ad name', required: true },
      { name: 'campaignId', label: 'Campaign', type: 'select', optionsFrom: 'campaigns', required: true },
      { name: 'destination', label: 'Sends traffic to', type: 'select', optionsFrom: 'destinations', required: true, help: 'A landing page, or an A/B test that splits traffic between pages.' },
      { name: 'utmContent', label: 'utm_content', required: true, slug: true, help: 'Unique per ad — this is how leads and sales get tied back to it.' },
      { name: 'format', type: 'select', options: ['video', 'image', 'carousel', 'ugc', 'search', 'email', 'other'] },
      { name: 'angle', label: 'Hook / angle', help: 'e.g. "3pm energy crash", "Lower A1C without meds"' },
      { name: 'headline' },
      { name: 'primaryText', label: 'Primary text / copy', type: 'textarea' },
      { name: 'creativeUrl', label: 'Creative URL (video/image)', type: 'url' },
      { name: 'platformAdId', label: 'Platform ad ID', help: 'Meta/Google ad ID, for matching spend imports.' },
      { name: 'status', type: 'select', options: ['draft', 'active', 'paused', 'ended'] },
      { name: 'notes', type: 'textarea' },
    ],
  },
  pages: {
    label: 'Landing page',
    plural: 'Landing pages',
    list: '/admin/marketing/pages',
    fields: [
      { name: 'name', label: 'Internal name', required: true },
      { name: 'slug', label: 'URL slug', required: true, slug: true, help: 'Page lives at /lp/<slug>' },
      { name: 'angle', label: 'Angle / hypothesis', help: 'What is this page testing?' },
      { name: 'eyebrow', label: 'Eyebrow text' },
      { name: 'headline', required: true },
      { name: 'subheadline', type: 'textarea' },
      { name: 'bullets', label: 'Bullets (one per line)', type: 'textarea' },
      { name: 'ctaLabel', label: 'Button text' },
      { name: 'ctaTarget', label: 'Button goes to', type: 'select', options: Object.keys(CTA_TARGETS) },
      { name: 'showPricing', label: 'Show pricing section', type: 'checkbox' },
      { name: 'showTestimonials', label: 'Show testimonials', type: 'checkbox' },
      { name: 'status', type: 'select', options: ['draft', 'live', 'paused', 'winner', 'retired'] },
      { name: 'notes', type: 'textarea' },
    ],
  },
  experiments: {
    label: 'A/B test',
    plural: 'A/B tests',
    list: '/admin/marketing/experiments',
    fields: [
      { name: 'name', label: 'Test name', required: true },
      { name: 'slug', label: 'Split URL slug', required: true, slug: true, help: 'Ads point to /go/<slug>, which splits traffic evenly.' },
      { name: 'hypothesis', type: 'textarea', help: 'If we change X, Y will improve because Z.' },
      { name: 'variantIds', label: 'Variants (landing pages)', type: 'multiselect', optionsFrom: 'pages', help: 'First selected = control.' },
      { name: 'primaryMetric', label: 'Primary metric', type: 'select', options: Object.keys(METRICS) },
      { name: 'minViews', label: 'Min. views per variant before deciding', type: 'number' },
      { name: 'status', type: 'select', options: ['draft', 'running', 'concluded'] },
      { name: 'startDate', label: 'Start date', type: 'date' },
      { name: 'notes', type: 'textarea' },
    ],
  },
};

const slugify = (v) => String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

function parseForm(entity, body) {
  const out = {};
  for (const f of ENTITIES[entity].fields) {
    const v = body[f.name];
    if (f.type === 'checkbox') out[f.name] = v === 'on';
    else if (f.type === 'number') out[f.name] = v === '' || v == null ? null : Number(v);
    else if (f.type === 'multiselect') out[f.name] = [].concat(v || []).filter(Boolean);
    else out[f.name] = f.slug ? slugify(v).replace(/_/g, entity === 'pages' || entity === 'experiments' ? '-' : '_') : String(v || '').trim();
  }
  const missing = ENTITIES[entity].fields.filter((f) => f.required && !out[f.name]).map((f) => f.label || f.name);
  return { data: out, error: missing.length ? `Required: ${missing.join(', ')}` : null };
}

// ---- Metrics -----------------------------------------------------------------
const blank = () => ({ views: 0, leads: 0, signups: 0, checkouts: 0, customers: 0, revenue: 0, spend: 0, impressions: 0, clicks: 0 });

function addEvent(m, e) {
  switch (e.name) {
    case 'lp_view': m.views++; break;
    case 'quiz_complete': case 'lead_guide': case 'discovery_booked': m.leads++; break;
    case 'signup_free': m.leads++; m.signups++; break;
    case 'checkout_view': m.checkouts++; break;
    case 'purchase': m.customers++; m.revenue += Number(e.amount || 0); break;
  }
}

const rate = (a, b) => (b ? a / b : null);
function derive(m) {
  return {
    ...m,
    leadRate: rate(m.leads, m.views),
    purchaseRate: rate(m.customers, m.views),
    leadToCustomer: rate(m.customers, m.leads),
    ctr: rate(m.clicks, m.impressions),
    cpc: rate(m.spend, m.clicks),
    cpl: m.spend && m.leads ? m.spend / m.leads : null,
    cac: m.spend && m.customers ? m.spend / m.customers : null,
    roas: m.spend ? m.revenue / m.spend : null,
  };
}
const sum = (list) => derive(list.reduce((acc, m) => { for (const k of Object.keys(blank())) acc[k] += m[k] || 0; return acc; }, blank()));

// Two-proportion z-test: is the variant's conversion rate really different from control?
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
function compare(control, variant, key) {
  const n1 = control.views, n2 = variant.views, c1 = control[key], c2 = variant[key];
  if (!n1 || !n2) return { lift: null, confidence: null };
  const p1 = c1 / n1, p2 = c2 / n2, p = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  const z = se ? (p2 - p1) / se : 0;
  return { lift: p1 ? (p2 - p1) / p1 : null, confidence: erf(Math.abs(z) / Math.SQRT2) };
}

const RANGES = { 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days', all: 'All time' };

async function report(range = '30') {
  const [campaigns, ads, pages, experiments, spend, events] = await Promise.all(
    ['campaigns', 'ads', 'pages', 'experiments', 'spend', 'events'].map((c) => db.all(c))
  );
  const since = range === 'all' ? '' : isoDate(new Date(Date.now() - Number(range) * 864e5));
  const inRange = events.filter((e) => e.createdAt.slice(0, 10) >= since);
  const spendIn = spend.filter((s) => s.date >= since);

  const bucket = new Map();
  const get = (k) => { if (!bucket.has(k)) bucket.set(k, blank()); return bucket.get(k); };
  for (const e of inRange) {
    const a = e.utm;
    if (!a) { addEvent(get('site:direct'), e); continue; }
    if (a.lp) addEvent(get(`lp:${a.lp}`), e);
    if (a.exp && a.lp) addEvent(get(`var:${a.exp}|${a.lp}`), e);
    if (a.utm_campaign) {
      addEvent(get(`camp:${a.utm_campaign}`), e);
      addEvent(get(`ad:${a.utm_campaign}|${a.utm_content || ''}`), e);
    }
  }

  const pageById = Object.fromEntries(pages.map((p) => [p.id, p]));
  const expById = Object.fromEntries(experiments.map((x) => [x.id, x]));
  const campById = Object.fromEntries(campaigns.map((c) => [c.id, c]));

  const adRows = ads.map((ad) => {
    const camp = campById[ad.campaignId] || {};
    const m = { ...(bucket.get(`ad:${camp.utmCampaign}|${ad.utmContent}`) || blank()) };
    for (const s of spendIn.filter((x) => x.adId === ad.id)) {
      m.spend += Number(s.spend || 0); m.impressions += Number(s.impressions || 0); m.clicks += Number(s.clicks || 0);
    }
    const [kind, destId] = String(ad.destination || '').split(':');
    const dest = kind === 'exp' ? { type: 'A/B test', item: expById[destId] } : { type: 'Page', item: pageById[destId] };
    return { ...ad, campaign: camp, dest, m: derive(m) };
  });

  const campaignRows = campaigns.map((c) => {
    const campAds = adRows.filter((a) => a.campaignId === c.id);
    const fromAds = sum(campAds.map((a) => a.m));
    return { ...c, ads: campAds, m: fromAds };
  });

  const adsForPage = (p) => adRows.filter((a) => {
    const [kind, id] = String(a.destination || '').split(':');
    return (kind === 'lp' && id === p.id) || (kind === 'exp' && (expById[id]?.variantIds || []).includes(p.id));
  });
  const pageRows = pages.map((p) => ({ ...p, m: derive(bucket.get(`lp:${p.slug}`) || blank()), ads: adsForPage(p) }));

  const experimentRows = experiments.map((x) => {
    const metric = METRICS[x.primaryMetric] || METRICS.lead_rate;
    const minViews = x.minViews || 100;
    const variants = (x.variantIds || []).map((id) => pageById[id]).filter(Boolean)
      .map((p) => ({ page: p, m: derive(bucket.get(`var:${x.slug}|${p.slug}`) || blank()) }));
    const control = variants[0];
    variants.forEach((v, i) => { v.cmp = i === 0 ? null : compare(control.m, v.m, metric.key); });
    const enough = variants.length > 1 && variants.every((v) => v.m.views >= minViews);
    const best = variants.slice(1).filter((v) => v.cmp && v.cmp.confidence >= 0.95).sort((a, b) => b.cmp.lift - a.cmp.lift)[0];
    let verdict = { tone: 'muted', text: 'Collecting data' };
    if (x.status === 'concluded') verdict = { tone: 'good', text: `Concluded — winner: ${(pageById[x.winnerId] || {}).name || '—'}` };
    else if (variants.length < 2) verdict = { tone: 'warn', text: 'Needs 2+ variants' };
    else if (enough && best) verdict = best.cmp.lift > 0
      ? { tone: 'good', text: `${best.page.name} is winning (+${Math.round(best.cmp.lift * 100)}%, ${Math.round(best.cmp.confidence * 100)}% confidence)` }
      : { tone: 'good', text: `Control is winning (${Math.round(best.cmp.confidence * 100)}% confidence)` };
    else if (enough) verdict = { tone: 'muted', text: 'No significant difference yet' };
    return { ...x, metric, minViews, variants, verdict, ready: enough && !!best && x.status !== 'concluded', ads: adRows.filter((a) => a.destination === `exp:${x.id}`) };
  });

  const paid = sum(campaignRows.map((c) => c.m));
  const site = sum([...bucket.entries()].filter(([k]) => k.startsWith('lp:') || k === 'site:direct').map(([, m]) => m));

  return { range, rangeLabel: RANGES[range] || RANGES[30], campaigns: campaignRows, ads: adRows, pages: pageRows, experiments: experimentRows, paid, site, decisions: decisions({ adRows, pageRows, experimentRows, paid }) };
}

// Rules-of-thumb that turn the numbers into a to-do list.
function decisions({ adRows, pageRows, experimentRows, paid }) {
  const out = [];
  for (const x of experimentRows) {
    if (x.ready) out.push({ tone: 'good', text: `A/B test "${x.name}" has a significant result — review and declare a winner.`, href: `/admin/marketing/experiments/${x.id}` });
  }
  const avgCpl = paid.cpl;
  for (const a of adRows.filter((r) => r.status === 'active')) {
    if (a.m.spend >= 100 && !a.m.leads) out.push({ tone: 'bad', text: `"${a.name}" spent $${Math.round(a.m.spend)} with no leads — consider pausing.`, href: `/admin/marketing/ads/${a.id}/edit` });
    else if (avgCpl && a.m.cpl && a.m.cpl > avgCpl * 1.75 && a.m.spend >= 50) out.push({ tone: 'warn', text: `"${a.name}" CPL $${a.m.cpl.toFixed(0)} is ${(a.m.cpl / avgCpl).toFixed(1)}× the average — test a new hook or cut budget.`, href: `/admin/marketing/ads/${a.id}/edit` });
    else if (a.m.roas && a.m.roas >= 2 && a.m.customers >= 2) out.push({ tone: 'good', text: `"${a.name}" is returning ${a.m.roas.toFixed(1)}× ad spend — consider scaling budget.`, href: `/admin/marketing/ads/${a.id}/edit` });
    if (!a.m.spend && !a.m.impressions) out.push({ tone: 'muted', text: `"${a.name}" is active but has no spend logged in this range.`, href: '/admin/marketing/ads#spend' });
  }
  for (const p of pageRows.filter((r) => r.status === 'live' && !r.ads.length)) {
    out.push({ tone: 'muted', text: `Landing page "${p.name}" is live but no ads point to it.`, href: '/admin/marketing/pages' });
  }
  return out;
}

// Full ad URL with UTMs. Paste this into Meta/Google as the destination URL.
function trackingUrl(base, ad) {
  const camp = ad.campaign || {};
  const [kind] = String(ad.destination || '').split(':');
  const path = !ad.dest.item ? '/' : kind === 'exp' ? `/go/${ad.dest.item.slug}` : `/lp/${ad.dest.item.slug}`;
  const params = new URLSearchParams({
    utm_source: camp.channel || 'other',
    utm_medium: camp.channel === 'email' ? 'email' : camp.channel === 'organic' ? 'social' : 'paid',
    utm_campaign: camp.utmCampaign || '',
    utm_content: ad.utmContent || '',
  });
  return `${base}${path}?${params}`;
}

module.exports = { ENTITIES, CHANNELS, CTA_TARGETS, METRICS, RANGES, parseForm, report, trackingUrl, compare };
