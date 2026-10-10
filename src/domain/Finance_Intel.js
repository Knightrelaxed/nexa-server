'use strict';
// =====================================================================
// Finance_Intel.js - Pure mathematical & heuristic finance intelligence
// Pure functions, zero LLM, zero network I/O, <1ms execution.
//   detectRecurring    find subscriptions / routine bills in history
//   upcomingBills      expand ACTIVE rules into due dates in a window
//   safeToSpendToday   "aman dibelanjakan hari ini" for Morning Briefing
//   projectMonthEnd    pace-based month-end projection
// Dates are handled in WIB (UTC+7).
// =====================================================================

const DAY = 86400000;
const WIB = 7 * 3600 * 1000;

const CADENCES = [
  { name: 'WEEKLY',    days: 7,    tol: 1.5, step: { days: 7 } },
  { name: 'BIWEEKLY',  days: 14,   tol: 2.5, step: { days: 14 } },
  { name: 'MONTHLY',   days: 30.4, tol: 4,   step: { months: 1 } },
  { name: 'QUARTERLY', days: 91,   tol: 8,   step: { months: 3 } },
  { name: 'YEARLY',    days: 365,  tol: 15,  step: { months: 12 } }
];

const median = a => {
  const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mostCommon = a => {
  const c = {}; a.forEach(x => { c[x] = (c[x] || 0) + 1; });
  return Object.entries(c).sort((x, y) => y[1] - x[1])[0][0];
};

function normalizeMerchant(raw) {
  return String(raw || '').toLowerCase()
    .replace(/\b(pt|cv|tbk)\b/g, ' ')
    .replace(/[0-9]{3,}/g, ' ')        // reference / id numbers
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function addStep(ts, step) {
  if (step.days) return ts + step.days * DAY;
  const d = new Date(ts + WIB);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step.months, 1, d.getUTCHours(), d.getUTCMinutes()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.getTime() - WIB;
}

function clusterByAmount(items, tol) {
  const sorted = [...items].sort((a, b) => a.nominal - b.nominal);
  const clusters = [];
  for (const it of sorted) {
    const c = clusters[clusters.length - 1];
    if (c && Math.abs(it.nominal - c.mean) / c.mean <= tol) {
      c.items.push(it); c.sum += it.nominal; c.mean = c.sum / c.items.length;
    } else clusters.push({ items: [it], sum: it.nominal, mean: it.nominal });
  }
  return clusters;
}

/** txs: [{ merchant, nominal, date, type }] -> candidate rules sorted by confidence */
function detectRecurring(txs, { minOccurrences = 3, amountTol = 0.1, now = Date.now(), type = 'EXPENSE' } = {}) {
  const byMerchant = new Map();
  for (const t of txs) {
    if (type && String(t.type || '').toUpperCase() !== type) continue;
    const ts = new Date(t.date).getTime();
    const nominal = Math.abs(Number(t.nominal));
    const key = normalizeMerchant(t.merchant);
    if (!key || !isFinite(ts) || !(nominal > 0)) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push({ ts, nominal, raw: t.merchant });
  }
  const out = [];
  for (const [merchantKey, list] of byMerchant) {
    for (const c of clusterByAmount(list, amountTol)) {
      const dayIdx = [...new Set(c.items.map(i => Math.floor((i.ts + WIB) / DAY)))].sort((a, b) => a - b);
      if (dayIdx.length < minOccurrences) continue;       // same-day repeats count once
      const gaps = dayIdx.slice(1).map((d, i) => d - dayIdx[i]);
      const med = median(gaps);
      const cad = CADENCES.find(x => Math.abs(med - x.days) <= x.tol);
      if (!cad) continue;
      const regular = gaps.filter(g => Math.abs(g - cad.days) <= cad.tol).length / gaps.length;
      if (regular < 0.6) continue;
      const amounts = c.items.map(i => i.nominal);
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const cv = Math.sqrt(amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length) / mean;
      const confidence = Math.round((0.4 * regular + 0.3 * Math.min(1, (dayIdx.length - 2) / 4) + 0.3 * (1 - Math.min(1, cv / amountTol))) * 100) / 100;
      const lastTs = Math.max(...c.items.map(i => i.ts));
      const nextExpected = addStep(lastTs, cad.step);
      out.push({
        merchantKey,
        displayName: mostCommon(c.items.map(i => i.raw)),
        cadence: cad.name,
        amountMedian: Math.round(median(amounts)),
        occurrences: dayIdx.length,
        lastSeen: new Date(lastTs).toISOString(),
        nextExpected: new Date(nextExpected).toISOString(),
        confidence,
        health: now > nextExpected + Math.max(2, cad.tol) * DAY ? 'MISSED' : 'ON_TRACK'
      });
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** price-change check for an ACTIVE rule against its newest charge */
function detectPriceChange(rule, latestAmount, tol = 0.1) {
  const pct = (latestAmount - rule.amountMedian) / rule.amountMedian;
  return { changed: Math.abs(pct) > tol, pct: Math.round(pct * 1000) / 10 };
}

/** rules: DB rows with status 'ACTIVE' only (CANDIDATE / REJECTED are ignored) */
function upcomingBills(rules, fromTs, toTs) {
  const out = [];
  for (const r of rules) {
    if (r.status !== 'ACTIVE') continue;
    const cad = CADENCES.find(c => c.name === r.cadence);
    if (!cad) continue;
    let due = new Date(r.nextExpected).getTime();
    for (let i = 0; i < 60 && due <= toTs; i++) {
      if (due >= fromTs) out.push({ name: r.displayName, due: new Date(due).toISOString(), amount: r.amountMedian });
      due = addStep(due, cad.step);
    }
  }
  return out.sort((a, b) => (a.due < b.due ? -1 : 1));
}

const floorTo = (x, step = 1000) => Math.floor(x / step) * step;

/**
 * budgetRemainingBeforeToday = monthly budget - spent through YESTERDAY
 * daysLeftInclusive          = days from today to the budget period end, inclusive
 */
function safeToSpendToday({ budgetRemainingBeforeToday, upcomingBillsTotal = 0, daysLeftInclusive, spentToday = 0 }) {
  const discretionary = budgetRemainingBeforeToday - upcomingBillsTotal;
  const perDay = discretionary / Math.max(1, daysLeftInclusive);
  const remainingToday = perDay - spentToday;
  let status = 'OK';
  if (discretionary <= 0 || remainingToday < 0) status = 'OVER';
  else if (remainingToday < 0.25 * perDay) status = 'TIGHT';
  return { discretionary, perDay: floorTo(Math.max(0, perDay)), remainingToday: floorTo(remainingToday), status };
}

function projectMonthEnd({ spentSoFar, recurringPaidSoFar = 0, recurringStillDue = 0, dayOfMonth, daysInMonth }) {
  const variableSoFar = Math.max(0, spentSoFar - recurringPaidSoFar);
  const runRate = variableSoFar / Math.max(1, dayOfMonth);
  return {
    variableRunRate: Math.round(runRate),
    projected: Math.round(spentSoFar + recurringStillDue + runRate * Math.max(0, daysInMonth - dayOfMonth))
  };
}

module.exports = {
  normalizeMerchant,
  detectRecurring,
  detectPriceChange,
  upcomingBills,
  safeToSpendToday,
  projectMonthEnd,
  addStep,
  CADENCES
};
