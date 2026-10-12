import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateOutstanding, historicalPaymentDelays, estimateExpectedCollection, enrichInvoices } from '../src/lib/invoiceForecasting.js';
import { buildCashflowForecast, forecastWindows } from '../src/lib/cashflowForecasting.js';
import { detectLiquidityGap } from '../src/lib/gapDetection.js';
import { simpleInterest, evaluateFinancingOption, compareFinancingOptions } from '../src/lib/financing.js';
import { buildRecommendation } from '../src/lib/recommendations.js';
import { parseInvoiceCsv } from '../src/lib/dataManager.js';
import { appendAccountTransaction, calculateAccountBalance, normalizeAccountTransaction, reconcileAccountCredits, summarizeAccountLedger } from '../src/lib/accountLedger.js';

const paidHistory = [
  { invoice_number: 'P1', customer: 'A', due_date: '2026-01-10', amount: 100, amount_collected: 100, actual_payment_date: '2026-01-14' },
  { invoice_number: 'P2', customer: 'A', due_date: '2026-02-10', amount: 100, amount_collected: 100, actual_payment_date: '2026-02-16' },
  { invoice_number: 'P3', customer: 'B', due_date: '2026-01-10', amount: 100, amount_collected: 100, actual_payment_date: '2026-01-20' },
];

test('outstanding balance handles partial payment', () => {
  assert.equal(calculateOutstanding({ amount: 100000, amount_collected: 25000 }), 75000);
});

test('historical payment delay is customer-specific', () => {
  assert.deepEqual(historicalPaymentDelays(paidHistory, 'A'), [4, 6]);
});

test('expected collection uses median customer delay when enough history exists', () => {
  const open = { invoice_number: 'O1', customer: 'A', due_date: '2026-03-10', amount: 100, amount_collected: 0 };
  const result = estimateExpectedCollection(open, [...paidHistory, open], { minimumHistory: 2, fallbackDelayDays: 9 });
  assert.equal(result.method, 'customer-history-median');
  assert.equal(result.predicted_delay_days, 5);
  assert.equal(result.expected_date, '2026-03-15');
});

test('expected collection falls back transparently when history is insufficient', () => {
  const open = { invoice_number: 'O1', customer: 'New', due_date: '2026-03-10', amount: 100, amount_collected: 0 };
  const result = estimateExpectedCollection(open, [open], { minimumHistory: 2, fallbackDelayDays: 7 });
  assert.equal(result.method, 'configurable-fallback');
  assert.equal(result.expected_date, '2026-03-17');
  assert.match(result.evidence, /Insufficient customer history/);
});

test('forecast produces exact 7, 14, and 30 day windows', () => {
  const windows = forecastWindows({ startDate: '2026-04-01', openingCash: 1000, invoices: [], transactions: [] });
  assert.equal(windows[7].length, 7);
  assert.equal(windows[14].length, 14);
  assert.equal(windows[30].length, 30);
  assert.equal(windows[30][29].date, '2026-04-30');
});

test('daily cash projection separates inflow certainty and outflows', () => {
  const forecast = buildCashflowForecast({
    startDate: '2026-04-01', horizonDays: 2, openingCash: 1000, scenario: 'Base',
    invoices: [],
    transactions: [
      { date: '2026-04-01', amount: 100, direction: 'inflow', certainty: 'confirmed' },
      { date: '2026-04-01', amount: 100, direction: 'inflow', certainty: 'expected' },
      { date: '2026-04-01', amount: 50, direction: 'outflow' },
    ],
  });
  assert.equal(forecast[0].confirmed_inflows, 100);
  assert.equal(forecast[0].expected_inflows, 100);
  assert.equal(forecast[0].risk_adjusted_inflows, 180);
  assert.equal(forecast[0].closing_cash, 1130);
});

test('liquidity detector calculates first shortage, maximum gap, duration, and recovery', () => {
  const rows = [
    { date: '2026-04-01', closing_cash: 150 },
    { date: '2026-04-02', closing_cash: 80 },
    { date: '2026-04-03', closing_cash: 20 },
    { date: '2026-04-04', closing_cash: 120 },
  ];
  const gap = detectLiquidityGap(rows, 100, { significantGapRatio: 2, prolongedDays: 5 });
  assert.equal(gap.first_shortage_date, '2026-04-02');
  assert.equal(gap.maximum_gap, 80);
  assert.equal(gap.gap_duration_days, 2);
  assert.equal(gap.recovery_date, '2026-04-04');
  assert.equal(gap.status, 'Temporary');
});

test('zero reserve scenario is explicit and can still detect negative cash', () => {
  const gap = detectLiquidityGap([{ date: '2026-04-01', closing_cash: -10 }], 0, { significantAbsoluteGapWhenZeroReserve: 100 });
  assert.equal(gap.reserve, 0);
  assert.equal(gap.maximum_gap, 10);
});

test('simple interest follows principal × annual rate × days / 365', () => {
  assert.ok(Math.abs(simpleInterest(365000, 10, 30) - 3000) < 0.0001);
});

test('credit line distinguishes approved limit from amount available to draw', () => {
  const result = evaluateFinancingOption({
    id: 'line', name: 'Line', type: 'credit_line', eligible: true,
    approved_limit: 500000, current_drawn_amount: 450000, max_available_amount: 500000,
    annual_rate_pct: 12, approval_days: 0, availability_date: '2026-04-01', financing_days: 30,
  }, { requiredAmount: 100000, deadline: '2026-04-03', evaluationDate: '2026-04-01' });
  assert.equal(result.gross_amount, 50000);
  assert.equal(result.remaining_gap, 50000);
});

test('cheaper financing arriving after deadline is infeasible', () => {
  const result = evaluateFinancingOption({
    id: 'slow', name: 'Slow', type: 'term_loan', eligible: true,
    max_available_amount: 200000, annual_rate_pct: 5, approval_days: 10, availability_date: '2026-04-01', financing_days: 30,
  }, { requiredAmount: 100000, deadline: '2026-04-05', evaluationDate: '2026-04-01' });
  assert.equal(result.meets_deadline, false);
  assert.equal(result.feasible, false);
  assert.match(result.rejection_reasons[0], /after/);
});

test('financing net proceeds deduct upfront fees', () => {
  const result = evaluateFinancingOption({
    id: 'loan', name: 'Loan', type: 'term_loan', eligible: true,
    max_available_amount: 120000, annual_rate_pct: 0, processing_fee: 2000, other_fees: 1000,
    approval_days: 0, availability_date: '2026-04-01', financing_days: 30,
  }, { requiredAmount: 100000, deadline: '2026-04-02', evaluationDate: '2026-04-01' });
  assert.equal(result.gross_amount, 103000);
  assert.equal(result.net_proceeds, 100000);
  assert.equal(result.estimated_total_cost, 3000);
});

test('supplier rescheduling requires contractual permission', () => {
  const result = evaluateFinancingOption({
    id: 'supplier', name: 'Supplier', type: 'supplier_reschedule', eligible: true,
    contract_permitted: false, reschedulable_amount: 100000, approval_days: 0, availability_date: '2026-04-01',
  }, { requiredAmount: 80000, deadline: '2026-04-02', evaluationDate: '2026-04-01' });
  assert.equal(result.feasible, false);
  assert.match(result.rejection_reasons.join(' '), /contractually confirmed/);
});

test('no-gap forecast recommends no additional borrowing', () => {
  const gap = detectLiquidityGap([{ date: '2026-04-01', closing_cash: 200000 }], 100000);
  const recommendation = buildRecommendation({ gap, financingOptions: [{ id: 'none', name: 'No finance', type: 'no_financing' }], evaluationDate: '2026-04-01' });
  assert.equal(recommendation.external_financing_necessary, false);
  assert.match(recommendation.action, /Do not add borrowing/);
});

test('recommendation enforces feasibility before cost', () => {
  const gap = detectLiquidityGap([
    { date: '2026-04-01', closing_cash: 120000 },
    { date: '2026-04-02', closing_cash: 20000 },
  ], 100000);
  const options = [
    { id: 'cheap', name: 'Cheap slow', type: 'term_loan', eligible: true, max_available_amount: 200000, annual_rate_pct: 1, approval_days: 10, availability_date: '2026-04-01', financing_days: 30 },
    { id: 'fast', name: 'Fast line', type: 'credit_line', eligible: true, approved_limit: 200000, current_drawn_amount: 0, max_available_amount: 200000, annual_rate_pct: 20, approval_days: 0, availability_date: '2026-04-01', financing_days: 30 },
  ];
  const rec = buildRecommendation({ gap, financingOptions: options, evaluationDate: '2026-04-01' });
  assert.match(rec.action, /Fast line/);
});

test('CSV import validates required columns and duplicates', () => {
  const missing = parseInvoiceCsv('invoice_number,customer\nA,Test');
  assert.match(missing.errors[0], /Missing required/);

  const duplicate = parseInvoiceCsv('invoice_number,customer,invoice_date,due_date,amount,amount_collected\nA,Test,2026-01-01,2026-01-31,100,0\nA,Test,2026-01-02,2026-02-01,100,0');
  assert.match(duplicate.errors.join(' '), /duplicate invoice_number/);
});

test('CSV import rejects invalid amounts and dates', () => {
  const result = parseInvoiceCsv('invoice_number,customer,invoice_date,due_date,amount,amount_collected\nA,Test,nope,2026-01-31,-10,20');
  assert.ok(result.errors.some((e) => e.includes('invalid invoice_date')));
  assert.ok(result.errors.some((e) => e.includes('non-negative')));
  assert.ok(result.errors.some((e) => e.includes('cannot exceed')));
});

test('financed receivables can be excluded to prevent double counting', () => {
  const invoices = enrichInvoices([
    { invoice_number: 'A', customer: 'X', invoice_date: '2026-03-01', due_date: '2026-04-02', amount: 100000, amount_collected: 0, collection_certainty: 'confirmed' },
  ], '2026-04-01', { fallbackDelayDays: 0 });
  const included = buildCashflowForecast({ startDate: '2026-04-01', horizonDays: 3, openingCash: 0, invoices, transactions: [], scenario: 'Base' });
  const excluded = buildCashflowForecast({ startDate: '2026-04-01', horizonDays: 3, openingCash: 0, invoices, transactions: [], scenario: 'Base', excludedInvoiceIds: ['A'] });
  assert.equal(included[1].risk_adjusted_inflows, 100000);
  assert.equal(excluded[1].risk_adjusted_inflows, 0);
});

test('financing proceeds are not automatically injected into base forecast', () => {
  const forecast = buildCashflowForecast({
    startDate: '2026-04-01', horizonDays: 1, openingCash: 100,
    invoices: [], transactions: [], scenario: 'Base',
  });
  assert.equal(forecast[0].closing_cash, 100);
});

test('financing comparison lists ineligible options behind feasible ones', () => {
  const results = compareFinancingOptions([
    { id: 'bad', name: 'Bad', type: 'term_loan', eligible: false, max_available_amount: 100000, approval_days: 0, availability_date: '2026-04-01' },
    { id: 'good', name: 'Good', type: 'term_loan', eligible: true, max_available_amount: 100000, approval_days: 0, availability_date: '2026-04-01' },
  ], { requiredAmount: 50000, deadline: '2026-04-02', evaluationDate: '2026-04-01' });
  assert.equal(results[0].id, 'good');
  assert.equal(results[1].id, 'bad');
});

test('account transaction normalization requires a positive amount and transaction id', () => {
  const tx = normalizeAccountTransaction({ transaction_id: 'UTR-1', amount: '50000', direction: 'credit', posted_at: '2026-04-01T10:00:00Z' });
  assert.equal(tx.amount, 50000);
  assert.equal(tx.direction, 'credit');
  assert.equal(tx.date, '2026-04-01');
  assert.throws(() => normalizeAccountTransaction({ amount: 100 }), /transaction_id/);
  assert.throws(() => normalizeAccountTransaction({ transaction_id: 'X', amount: 0 }), /greater than zero/);
});

test('account ledger rejects duplicate bank transaction ids', () => {
  const first = appendAccountTransaction([], { transaction_id: 'UTR-1', amount: 1000, direction: 'credit' });
  assert.throws(() => appendAccountTransaction(first, { transaction_id: 'UTR-1', amount: 1000, direction: 'credit' }), /Duplicate account transaction/);
});

test('tracked account balance applies posted credits and debits', () => {
  const transactions = [
    { transaction_id: 'C1', amount: 50000, direction: 'credit', status: 'posted' },
    { transaction_id: 'D1', amount: 12000, direction: 'debit', status: 'posted' },
    { transaction_id: 'P1', amount: 99999, direction: 'credit', status: 'pending' },
  ];
  assert.equal(calculateAccountBalance(200000, transactions), 238000);
});

test('account summary reports actual credited and debited amounts for the day', () => {
  const summary = summarizeAccountLedger({
    baseBalance: 100000,
    today: '2026-04-01',
    transactions: [
      { transaction_id: 'C1', amount: 20000, direction: 'credit', status: 'posted', date: '2026-04-01', posted_at: '2026-04-01T09:00:00Z' },
      { transaction_id: 'D1', amount: 5000, direction: 'debit', status: 'posted', date: '2026-04-01', posted_at: '2026-04-01T10:00:00Z' },
    ],
  });
  assert.equal(summary.current_balance, 115000);
  assert.equal(summary.credited_today, 20000);
  assert.equal(summary.debited_today, 5000);
});

test('credited payment reconciles to invoice and reduces outstanding amount', () => {
  const invoices = [{ invoice_number: 'INV-1', customer: 'A', amount: 100000, amount_collected: 10000, due_date: '2026-04-02' }];
  const result = reconcileAccountCredits(invoices, [
    { transaction_id: 'C1', amount: 40000, direction: 'credit', status: 'posted', invoice_number: 'INV-1', posted_at: '2026-04-01T09:00:00Z' },
  ]);
  assert.equal(result.invoices[0].amount_collected, 50000);
  assert.equal(result.invoices[0].ledger_collected_amount, 40000);
  assert.equal(result.matched_credit_amount, 40000);
});

test('unmatched account credit still increases bank cash without changing invoice collection', () => {
  const invoices = [{ invoice_number: 'INV-1', customer: 'A', amount: 100000, amount_collected: 0, due_date: '2026-04-02' }];
  const tx = { transaction_id: 'C1', amount: 25000, direction: 'credit', status: 'posted', invoice_number: '', posted_at: '2026-04-01T09:00:00Z' };
  const result = reconcileAccountCredits(invoices, [tx]);
  assert.equal(result.invoices[0].amount_collected, 0);
  assert.equal(result.unmatched_credit_amount, 25000);
  assert.equal(calculateAccountBalance(100000, [tx]), 125000);
});

test('invoice reconciliation caps applied credit at remaining invoice balance', () => {
  const invoices = [{ invoice_number: 'INV-1', customer: 'A', amount: 100000, amount_collected: 90000, due_date: '2026-04-02' }];
  const result = reconcileAccountCredits(invoices, [
    { transaction_id: 'C1', amount: 25000, direction: 'credit', status: 'posted', invoice_number: 'INV-1', posted_at: '2026-04-01T09:00:00Z' },
  ]);
  assert.equal(result.invoices[0].amount_collected, 100000);
  assert.equal(result.matched_credit_amount, 10000);
  assert.equal(result.unmatched_credit_amount, 15000);
});

test('actual credited cash and remaining receivable are counted exactly once', () => {
  const baseInvoices = [{
    invoice_number: 'INV-1', customer: 'A', invoice_date: '2026-03-01', due_date: '2026-04-02',
    amount: 100000, amount_collected: 0, collection_certainty: 'confirmed',
  }];
  const credits = [{ transaction_id: 'C1', amount: 40000, direction: 'credit', status: 'posted', invoice_number: 'INV-1', posted_at: '2026-04-01T09:00:00Z' }];
  const reconciled = reconcileAccountCredits(baseInvoices, credits);
  const enriched = enrichInvoices(reconciled.invoices, '2026-04-01', { fallbackDelayDays: 0 });
  const trackedBalance = calculateAccountBalance(0, credits);
  const forecast = buildCashflowForecast({
    startDate: '2026-04-01', horizonDays: 2, openingCash: trackedBalance,
    invoices: enriched, transactions: [], scenario: 'Base',
  });
  assert.equal(trackedBalance, 40000);
  assert.equal(enriched[0].outstanding, 60000);
  assert.equal(forecast[1].risk_adjusted_inflows, 60000);
  assert.equal(forecast[1].closing_cash, 100000);
});
