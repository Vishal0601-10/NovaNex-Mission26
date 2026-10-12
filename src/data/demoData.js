import { addDays, todayISO } from '../lib/dateUtils.js';

const today = todayISO();
const d = (days) => addDays(today, days);

export const demoInvoices = [
  { invoice_number: 'HIST-001', customer: 'Arun Retail', invoice_date: d(-95), due_date: d(-65), amount: 120000, amount_collected: 120000, actual_payment_date: d(-61), collection_certainty: 'confirmed' },
  { invoice_number: 'HIST-002', customer: 'Arun Retail', invoice_date: d(-70), due_date: d(-40), amount: 90000, amount_collected: 90000, actual_payment_date: d(-34), collection_certainty: 'confirmed' },
  { invoice_number: 'HIST-003', customer: 'Arun Retail', invoice_date: d(-45), due_date: d(-15), amount: 110000, amount_collected: 110000, actual_payment_date: d(-10), collection_certainty: 'confirmed' },
  { invoice_number: 'HIST-004', customer: 'BluePeak Stores', invoice_date: d(-100), due_date: d(-70), amount: 150000, amount_collected: 150000, actual_payment_date: d(-61), collection_certainty: 'confirmed' },
  { invoice_number: 'HIST-005', customer: 'BluePeak Stores', invoice_date: d(-75), due_date: d(-45), amount: 135000, amount_collected: 135000, actual_payment_date: d(-35), collection_certainty: 'confirmed' },
  { invoice_number: 'HIST-006', customer: 'BluePeak Stores', invoice_date: d(-50), due_date: d(-20), amount: 175000, amount_collected: 175000, actual_payment_date: d(-12), collection_certainty: 'confirmed' },
  { invoice_number: 'INV-101', customer: 'Arun Retail', invoice_date: d(-25), due_date: d(2), amount: 180000, amount_collected: 30000, actual_payment_date: '', collection_certainty: 'expected' },
  { invoice_number: 'INV-102', customer: 'BluePeak Stores', invoice_date: d(-35), due_date: d(-5), amount: 220000, amount_collected: 0, actual_payment_date: '', collection_certainty: 'uncertain' },
  { invoice_number: 'INV-103', customer: 'Cedar Hospitality', invoice_date: d(-20), due_date: d(4), amount: 160000, amount_collected: 0, actual_payment_date: '', collection_certainty: 'confirmed' },
  { invoice_number: 'INV-104', customer: 'Delta Medicals', invoice_date: d(-10), due_date: d(12), amount: 125000, amount_collected: 25000, actual_payment_date: '', collection_certainty: 'expected' },
  { invoice_number: 'INV-105', customer: 'Echo Engineering', invoice_date: d(-8), due_date: d(18), amount: 200000, amount_collected: 0, actual_payment_date: '', collection_certainty: 'uncertain' },
];

export const demoTransactions = [
  { id: 'AP-001', date: d(1), amount: 135000, direction: 'outflow', category: 'Supplier payment', certainty: 'confirmed', label: 'Steel supplier' },
  { id: 'AP-002', date: d(3), amount: 85000, direction: 'outflow', category: 'Supplier payment', certainty: 'confirmed', label: 'Packaging supplier' },
  { id: 'PAY-001', date: d(4), amount: 190000, direction: 'outflow', category: 'Payroll', certainty: 'confirmed', label: 'Monthly payroll' },
  { id: 'OPEX-001', date: d(7), amount: 55000, direction: 'outflow', category: 'Operating expense', certainty: 'confirmed', label: 'Utilities and logistics' },
  { id: 'LOAN-001', date: d(10), amount: 45000, direction: 'outflow', category: 'Loan repayment', certainty: 'confirmed', label: 'Existing equipment loan EMI' },
  { id: 'INFLOW-001', date: d(2), amount: 25000, direction: 'inflow', category: 'Other inflow', certainty: 'confirmed', label: 'Confirmed service advance' },
];

export const demoFinancingOptions = [
  {
    id: 'supplier-reschedule',
    name: 'Supplier payment rescheduling',
    type: 'supplier_reschedule',
    eligible: true,
    contract_permitted: true,
    reschedulable_amount: 140000,
    late_fee: 2500,
    other_fees: 0,
    approval_days: 0,
    availability_date: today,
    repayment_implication: `₹140,000 supplier payment moves by 14 days after written consent.`,
    assumptions: 'Hypothetical operational alternative; requires explicit supplier consent.',
    risks: 'Supplier may refuse or commercial relationship may be affected.',
  },
  {
    id: 'credit-line',
    name: 'Existing working-capital credit line',
    type: 'credit_line',
    eligible: true,
    approved_limit: 500000,
    current_drawn_amount: 120000,
    max_available_amount: 380000,
    annual_rate_pct: 16,
    processing_fee: 1000,
    other_fees: 0,
    approval_days: 0,
    availability_date: today,
    financing_days: 30,
    repayment_implication: 'Repay drawn principal plus accrued interest; assumed 30-day use for comparison.',
    assumptions: 'Hypothetical existing facility, not a real lender offer.',
    risks: 'Floating pricing, covenants, and actual bank charges may differ.',
  },
  {
    id: 'invoice-finance',
    name: 'Invoice financing',
    type: 'invoice_financing',
    eligible: true,
    max_available_amount: 260000,
    eligible_receivable_amount: 325000,
    advance_rate_pct: 80,
    financing_fee_pct: 1.8,
    processing_fee: 1500,
    other_fees: 500,
    approval_days: 1,
    availability_date: today,
    financing_days: 30,
    interest_deducted_upfront: true,
    financed_invoice_ids: ['INV-101', 'INV-103'],
    repayment_implication: 'Financed receivables are assigned/encumbered and must not also be counted as future free cash.',
    assumptions: 'Hypothetical receivable financing terms for demonstration.',
    risks: 'Advance rate and acceptance depend on invoice eligibility and debtor quality.',
  },
  {
    id: 'slow-term-loan',
    name: 'Low-rate term loan (slow approval)',
    type: 'term_loan',
    eligible: true,
    max_available_amount: 500000,
    annual_rate_pct: 10,
    processing_fee: 1500,
    other_fees: 0,
    approval_days: 10,
    availability_date: today,
    financing_days: 90,
    repayment_implication: 'Assumed 90-day financing period for cost illustration.',
    assumptions: 'Hypothetical lower-cost facility intentionally modeled with slow disbursement.',
    risks: 'Cheaper nominal rate does not help if funds arrive after the shortage date.',
  },
  {
    id: 'no-financing',
    name: 'No additional financing',
    type: 'no_financing',
    eligible: true,
    assumptions: 'Valid only when projected liquidity is sufficient.',
    risks: 'Requires forecast assumptions to remain valid.',
  },
];

export const healthyTransactions = demoTransactions.map((tx) => tx.direction === 'outflow' ? { ...tx, amount: Math.round(tx.amount * 0.6) } : tx);

export const demoConfig = {
  today,
  openingCash: 235000,
  minimumReserve: 100000,
  forecastHorizon: 30,
  fallbackDelayDays: 5,
  significantGapRatio: 1,
  prolongedDays: 5,
};
