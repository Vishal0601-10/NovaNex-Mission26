import { addDays, diffDays, toDate } from './dateUtils.js';

export function calculateOutstanding(invoice) {
  const amount = Number(invoice.amount) || 0;
  const collected = Number(invoice.amount_collected) || 0;
  return Math.max(0, amount - collected);
}

export function deriveInvoiceStatus(invoice, today) {
  const outstanding = calculateOutstanding(invoice);
  if (outstanding <= 0) return 'Paid';
  const due = toDate(invoice.due_date);
  const now = toDate(today);
  if (due && now && due < now) return collectedAmount(invoice) > 0 ? 'Partially paid / overdue' : 'Overdue';
  if (collectedAmount(invoice) > 0) return 'Partially paid';
  return 'Open';
}

function collectedAmount(invoice) {
  return Math.max(0, Number(invoice.amount_collected) || 0);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function historicalPaymentDelays(invoices, customer) {
  return invoices
    .filter((invoice) => invoice.customer === customer && invoice.actual_payment_date && invoice.due_date)
    .map((invoice) => diffDays(invoice.actual_payment_date, invoice.due_date))
    .filter((delay) => Number.isFinite(delay));
}

export function estimateExpectedCollection(invoice, allInvoices, config = {}) {
  const outstanding = calculateOutstanding(invoice);
  if (outstanding <= 0) {
    return {
      expected_date: invoice.actual_payment_date || invoice.due_date,
      predicted_delay_days: invoice.actual_payment_date ? diffDays(invoice.actual_payment_date, invoice.due_date) : 0,
      uncertainty_low_date: invoice.actual_payment_date || invoice.due_date,
      uncertainty_high_date: invoice.actual_payment_date || invoice.due_date,
      confidence: 'Actual',
      method: 'actual-payment',
      evidence: 'Invoice is fully collected; the actual payment date is used when available.',
    };
  }

  const fallbackDelay = Number(config.fallbackDelayDays ?? 5);
  const delays = historicalPaymentDelays(allInvoices, invoice.customer);
  const minimumHistory = Number(config.minimumHistory ?? 2);

  if (delays.length >= minimumHistory) {
    const predicted = Math.round(median(delays));
    const q1 = Math.floor(percentile(delays, 0.25));
    const q3 = Math.ceil(percentile(delays, 0.75));
    return {
      expected_date: addDays(invoice.due_date, predicted),
      predicted_delay_days: predicted,
      uncertainty_low_date: addDays(invoice.due_date, Math.min(q1, q3)),
      uncertainty_high_date: addDays(invoice.due_date, Math.max(q1, q3)),
      confidence: delays.length >= 5 ? 'High' : 'Medium',
      method: 'customer-history-median',
      evidence: `${delays.length} paid invoice(s) for ${invoice.customer}; median historical delay is ${predicted} day(s).`,
    };
  }

  const low = Math.max(0, Math.floor(fallbackDelay / 2));
  const high = Math.max(low + 1, Math.ceil(fallbackDelay * 2));
  return {
    expected_date: addDays(invoice.due_date, fallbackDelay),
    predicted_delay_days: fallbackDelay,
    uncertainty_low_date: addDays(invoice.due_date, low),
    uncertainty_high_date: addDays(invoice.due_date, high),
    confidence: 'Low',
    method: 'configurable-fallback',
    evidence: `Insufficient customer history; due date plus the configured ${fallbackDelay}-day fallback is used.`,
  };
}

export function enrichInvoices(invoices, today, config = {}) {
  return invoices.map((invoice) => {
    const estimate = estimateExpectedCollection(invoice, invoices, config);
    return {
      ...invoice,
      outstanding: calculateOutstanding(invoice),
      payment_status: deriveInvoiceStatus(invoice, today),
      ...estimate,
    };
  });
}
