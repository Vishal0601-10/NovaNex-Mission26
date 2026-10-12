import { toDate } from './dateUtils.js';

export const REQUIRED_INVOICE_COLUMNS = ['invoice_number', 'customer', 'invoice_date', 'due_date', 'amount', 'amount_collected'];

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

export function parseInvoiceCsv(text) {
  if (typeof text !== 'string' || !text.trim()) return { rows: [], errors: ['CSV file is empty.'] };
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  const headers = splitCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  const missing = REQUIRED_INVOICE_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) return { rows: [], errors: [`Missing required column(s): ${missing.join(', ')}.`] };

  const rows = [];
  const errors = [];
  const seen = new Set();
  lines.slice(1).forEach((line, index) => {
    const values = splitCsvLine(line);
    const raw = Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? '']));
    const rowNo = index + 2;
    if (!raw.invoice_number) errors.push(`Row ${rowNo}: invoice_number is required.`);
    if (seen.has(raw.invoice_number)) errors.push(`Row ${rowNo}: duplicate invoice_number ${raw.invoice_number}.`);
    seen.add(raw.invoice_number);
    if (!toDate(raw.invoice_date)) errors.push(`Row ${rowNo}: invalid invoice_date.`);
    if (!toDate(raw.due_date)) errors.push(`Row ${rowNo}: invalid due_date.`);
    const amount = Number(raw.amount);
    const collected = Number(raw.amount_collected);
    if (!Number.isFinite(amount) || amount < 0) errors.push(`Row ${rowNo}: amount must be a non-negative number.`);
    if (!Number.isFinite(collected) || collected < 0) errors.push(`Row ${rowNo}: amount_collected must be a non-negative number.`);
    if (Number.isFinite(amount) && Number.isFinite(collected) && collected > amount) errors.push(`Row ${rowNo}: amount_collected cannot exceed amount.`);
    if (raw.actual_payment_date && !toDate(raw.actual_payment_date)) errors.push(`Row ${rowNo}: invalid actual_payment_date.`);

    rows.push({
      invoice_number: raw.invoice_number,
      customer: raw.customer || 'Unknown customer',
      invoice_date: raw.invoice_date,
      due_date: raw.due_date,
      amount,
      amount_collected: collected,
      actual_payment_date: raw.actual_payment_date || '',
      collection_certainty: ['confirmed', 'expected', 'uncertain'].includes(raw.collection_certainty) ? raw.collection_certainty : 'expected',
    });
  });

  return errors.length ? { rows: [], errors } : { rows, errors: [] };
}
