import { todayISO } from './dateUtils.js';

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  if (typeof value !== 'string' || !value) return todayISO();
  return value.slice(0, 10);
}

export function normalizeAccountTransaction(input = {}) {
  const direction = String(input.direction || 'credit').toLowerCase();
  const normalizedDirection = direction === 'debit' ? 'debit' : 'credit';
  const normalizedAmount = Math.abs(amount(input.amount));
  const transactionId = String(input.transaction_id || input.id || '').trim();

  if (!transactionId) throw new Error('transaction_id is required.');
  if (!(normalizedAmount > 0)) throw new Error('amount must be greater than zero.');

  return {
    transaction_id: transactionId,
    posted_at: String(input.posted_at || new Date().toISOString()),
    date: dateOnly(input.posted_at || input.date || todayISO()),
    amount: normalizedAmount,
    direction: normalizedDirection,
    status: String(input.status || 'posted').toLowerCase(),
    payer: String(input.payer || '').trim(),
    payee: String(input.payee || '').trim(),
    reference: String(input.reference || '').trim(),
    invoice_number: String(input.invoice_number || '').trim(),
    source: String(input.source || 'bank_webhook').trim(),
  };
}

export function hasDuplicateTransaction(transactions = [], transactionId) {
  return transactions.some((item) => String(item.transaction_id) === String(transactionId));
}

export function appendAccountTransaction(transactions = [], input) {
  const normalized = normalizeAccountTransaction(input);
  if (hasDuplicateTransaction(transactions, normalized.transaction_id)) {
    throw new Error(`Duplicate account transaction: ${normalized.transaction_id}.`);
  }
  return [...transactions, normalized];
}

export function postedTransactions(transactions = []) {
  return transactions.filter((item) => String(item.status || 'posted').toLowerCase() === 'posted');
}

export function calculateAccountBalance(baseBalance, transactions = []) {
  return postedTransactions(transactions).reduce((balance, item) => {
    const signed = item.direction === 'debit' ? -amount(item.amount) : amount(item.amount);
    return balance + signed;
  }, amount(baseBalance));
}

export function summarizeAccountLedger({ baseBalance = 0, transactions = [], today = todayISO() } = {}) {
  const posted = postedTransactions(transactions);
  const credits = posted.filter((item) => item.direction === 'credit');
  const debits = posted.filter((item) => item.direction === 'debit');
  const creditedToday = credits.filter((item) => item.date === today).reduce((sum, item) => sum + amount(item.amount), 0);
  const debitedToday = debits.filter((item) => item.date === today).reduce((sum, item) => sum + amount(item.amount), 0);
  const lastPosted = [...posted].sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)))[0] || null;

  return {
    base_balance: amount(baseBalance),
    current_balance: calculateAccountBalance(baseBalance, posted),
    total_credits: credits.reduce((sum, item) => sum + amount(item.amount), 0),
    total_debits: debits.reduce((sum, item) => sum + amount(item.amount), 0),
    credited_today: creditedToday,
    debited_today: debitedToday,
    posted_count: posted.length,
    last_posted_at: lastPosted?.posted_at || null,
  };
}

export function reconcileAccountCredits(invoices = [], transactions = []) {
  const credits = postedTransactions(transactions).filter((item) => item.direction === 'credit');
  const invoiceMap = new Map(invoices.map((invoice) => [String(invoice.invoice_number), invoice]));
  const appliedByInvoice = new Map();
  const reconciliations = [];
  const unmatchedCredits = [];

  credits.forEach((credit) => {
    const invoiceNumber = String(credit.invoice_number || '').trim();
    if (!invoiceNumber || !invoiceMap.has(invoiceNumber)) {
      unmatchedCredits.push({ ...credit, reason: invoiceNumber ? 'invoice_not_found' : 'invoice_reference_missing' });
      return;
    }

    const invoice = invoiceMap.get(invoiceNumber);
    const alreadyApplied = appliedByInvoice.get(invoiceNumber) || 0;
    const baselineCollected = Math.max(0, amount(invoice.amount_collected));
    const invoiceAmount = Math.max(0, amount(invoice.amount));
    const remainingBeforeCredit = Math.max(0, invoiceAmount - baselineCollected - alreadyApplied);
    const appliedAmount = Math.min(remainingBeforeCredit, amount(credit.amount));
    const excessAmount = Math.max(0, amount(credit.amount) - appliedAmount);
    appliedByInvoice.set(invoiceNumber, alreadyApplied + appliedAmount);

    reconciliations.push({
      transaction_id: credit.transaction_id,
      invoice_number: invoiceNumber,
      credited_amount: amount(credit.amount),
      applied_amount: appliedAmount,
      excess_amount: excessAmount,
      payer: credit.payer,
      posted_at: credit.posted_at,
    });

    if (excessAmount > 0) {
      unmatchedCredits.push({ ...credit, amount: excessAmount, reason: 'credit_exceeds_invoice_outstanding' });
    }
  });

  const reconciledInvoices = invoices.map((invoice) => {
    const applied = appliedByInvoice.get(String(invoice.invoice_number)) || 0;
    if (!applied) return { ...invoice };
    const newCollected = Math.min(Math.max(0, amount(invoice.amount)), Math.max(0, amount(invoice.amount_collected)) + applied);
    const latest = reconciliations
      .filter((item) => item.invoice_number === String(invoice.invoice_number) && item.applied_amount > 0)
      .sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)))[0];
    return {
      ...invoice,
      amount_collected: newCollected,
      actual_payment_date: newCollected >= amount(invoice.amount) && latest ? latest.posted_at.slice(0, 10) : invoice.actual_payment_date,
      ledger_collected_amount: applied,
    };
  });

  return {
    invoices: reconciledInvoices,
    reconciliations,
    unmatched_credits: unmatchedCredits,
    matched_credit_amount: reconciliations.reduce((sum, item) => sum + item.applied_amount, 0),
    unmatched_credit_amount: unmatchedCredits.reduce((sum, item) => sum + amount(item.amount), 0),
  };
}
