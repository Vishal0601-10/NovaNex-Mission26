import { addDays, enumerateDates, isWithin } from './dateUtils.js';
import { calculateOutstanding } from './invoiceForecasting.js';

export const DEFAULT_CERTAINTY_WEIGHTS = {
  confirmed: 1,
  expected: 0.8,
  uncertain: 0.45,
};

export const SCENARIOS = {
  Conservative: { confirmed: 1, expected: 0.55, uncertain: 0.2, outflowFactor: 1.05 },
  Base: { confirmed: 1, expected: 0.8, uncertain: 0.45, outflowFactor: 1 },
  Optimistic: { confirmed: 1, expected: 1, uncertain: 0.8, outflowFactor: 1 },
};

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function invoiceInflows(invoices, options = {}) {
  const excluded = new Set(options.excludedInvoiceIds || []);
  return invoices
    .filter((invoice) => calculateOutstanding(invoice) > 0 && !excluded.has(invoice.invoice_number))
    .filter((invoice) => invoice.expected_date)
    .map((invoice) => ({
      id: `invoice:${invoice.invoice_number}`,
      sourceId: invoice.invoice_number,
      date: invoice.expected_date,
      amount: calculateOutstanding(invoice),
      direction: 'inflow',
      category: 'Invoice collection',
      certainty: invoice.collection_certainty || (invoice.confidence === 'High' ? 'expected' : 'uncertain'),
      label: `${invoice.customer} · ${invoice.invoice_number}`,
    }));
}

export function buildCashflowForecast({
  startDate,
  horizonDays,
  openingCash,
  invoices = [],
  transactions = [],
  scenario = 'Base',
  certaintyWeights,
  excludedInvoiceIds = [],
}) {
  const profile = typeof scenario === 'string' ? (SCENARIOS[scenario] || SCENARIOS.Base) : scenario;
  const weights = { ...DEFAULT_CERTAINTY_WEIGHTS, ...profile, ...(certaintyWeights || {}) };
  const outflowFactor = number(profile.outflowFactor || 1);
  const endDate = addDays(startDate, Math.max(0, horizonDays - 1));
  const invoiceEvents = invoiceInflows(invoices, { excludedInvoiceIds });
  const normalizedTransactions = transactions.map((tx, index) => ({
    id: tx.id || `tx:${index}`,
    date: tx.date,
    amount: Math.max(0, number(tx.amount)),
    direction: tx.direction === 'inflow' ? 'inflow' : 'outflow',
    category: tx.category || 'Other',
    certainty: tx.certainty || 'confirmed',
    label: tx.label || tx.category || 'Transaction',
    sourceId: tx.sourceId,
  }));
  const events = [...invoiceEvents, ...normalizedTransactions]
    .filter((event) => isWithin(event.date, startDate, endDate));

  let closing = number(openingCash);
  let cumulativeInflows = 0;
  let cumulativeOutflows = 0;

  return enumerateDates(startDate, horizonDays).map((date) => {
    const todays = events.filter((event) => event.date === date);
    const inflowsByCertainty = { confirmed: 0, expected: 0, uncertain: 0 };
    let rawInflows = 0;
    let riskAdjustedInflows = 0;
    let outflows = 0;

    todays.forEach((event) => {
      if (event.direction === 'inflow') {
        const certainty = ['confirmed', 'expected', 'uncertain'].includes(event.certainty) ? event.certainty : 'uncertain';
        rawInflows += event.amount;
        inflowsByCertainty[certainty] += event.amount;
        riskAdjustedInflows += event.amount * number(weights[certainty]);
      } else {
        outflows += event.amount * outflowFactor;
      }
    });

    cumulativeInflows += riskAdjustedInflows;
    cumulativeOutflows += outflows;
    const opening = closing;
    closing = opening + riskAdjustedInflows - outflows;

    return {
      date,
      opening_cash: opening,
      confirmed_inflows: inflowsByCertainty.confirmed,
      expected_inflows: inflowsByCertainty.expected,
      uncertain_inflows: inflowsByCertainty.uncertain,
      raw_inflows: rawInflows,
      risk_adjusted_inflows: riskAdjustedInflows,
      outflows,
      net_cashflow: riskAdjustedInflows - outflows,
      cumulative_inflows: cumulativeInflows,
      cumulative_outflows: cumulativeOutflows,
      closing_cash: closing,
      events: todays,
    };
  });
}

export function forecastWindows(input) {
  return {
    7: buildCashflowForecast({ ...input, horizonDays: 7 }),
    14: buildCashflowForecast({ ...input, horizonDays: 14 }),
    30: buildCashflowForecast({ ...input, horizonDays: 30 }),
  };
}
