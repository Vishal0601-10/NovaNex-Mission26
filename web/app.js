import { demoConfig, demoFinancingOptions, demoInvoices, demoTransactions, healthyTransactions } from '/src/data/demoData.js';
import { enrichInvoices, calculateOutstanding } from '/src/lib/invoiceForecasting.js';
import { buildCashflowForecast } from '/src/lib/cashflowForecasting.js';
import { detectLiquidityGap } from '/src/lib/gapDetection.js';
import { compareFinancingOptions } from '/src/lib/financing.js';
import { buildRecommendation } from '/src/lib/recommendations.js';
import { parseInvoiceCsv } from '/src/lib/dataManager.js';
import { reconcileAccountCredits } from '/src/lib/accountLedger.js';
import { todayISO } from '/src/lib/dateUtils.js';

const PAGES = [
  ['dashboard', 'Executive Dashboard'],
  ['account', 'Live Account Feed'],
  ['invoices', 'Invoice Management'],
  ['forecast', 'Cash-Flow Forecast'],
  ['warning', 'Liquidity Early Warning'],
  ['financing', 'Financing Comparison'],
  ['recommendation', 'Explainable Recommendations'],
  ['data', 'Data & Scenarios'],
];
const STORAGE_KEY = 'novanex-msme-production-v1';
const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const app = document.querySelector('#app');

const freshState = () => ({
  page: 'dashboard',
  invoices: structuredClone(demoInvoices),
  transactions: structuredClone(demoTransactions),
  financingOptions: structuredClone(demoFinancingOptions),
  minimumReserve: demoConfig.minimumReserve,
  horizon: 30,
  scenario: 'Base',
  fallbackDelayDays: demoConfig.fallbackDelayDays,
  manualOpeningCash: demoConfig.openingCash,
  account: null,
  accountStatus: 'checking',
  accountError: '',
  invoiceEdit: null,
  transactionEdit: null,
});

function loadState() {
  const base = freshState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const key of ['invoices', 'transactions', 'financingOptions']) if (Array.isArray(saved[key])) base[key] = saved[key];
    for (const key of ['minimumReserve', 'horizon', 'scenario', 'fallbackDelayDays', 'manualOpeningCash']) if (saved[key] !== undefined) base[key] = saved[key];
  } catch { /* use demo defaults */ }
  return base;
}

let state = loadState();
let pollTimer = null;

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    invoices: state.invoices,
    transactions: state.transactions,
    financingOptions: state.financingOptions,
    minimumReserve: state.minimumReserve,
    horizon: state.horizon,
    scenario: state.scenario,
    fallbackDelayDays: state.fallbackDelayDays,
    manualOpeningCash: state.manualOpeningCash,
  }));
}

const money = (value) => INR.format(Number(value) || 0);
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const n = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const pct = (value) => `${n(value).toFixed(2)}%`;
const tone = (status) => status === 'No gap' ? 'good' : status === 'Temporary' ? 'warn' : status === 'Significant' ? 'danger' : '';
const accountWriteKey = () => sessionStorage.getItem('novanex-write-key') || '';

function toast(message, error = false) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = `toast${error ? ' error' : ''}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (options.method && options.method !== 'GET' && accountWriteKey()) headers['X-API-Key'] = accountWriteKey();
  const response = await fetch(path, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed with HTTP ${response.status}.`);
  return body;
}

async function refreshAccount({ rerender = true } = {}) {
  try {
    state.account = await api('/api/account/snapshot');
    state.accountStatus = 'connected';
    state.accountError = '';
  } catch (error) {
    state.accountStatus = 'offline';
    state.accountError = error.message;
  }
  if (rerender) render();
}

function derive() {
  const today = todayISO();
  const accountTransactions = state.account?.transactions || [];
  const reconciliation = reconcileAccountCredits(state.invoices, accountTransactions);
  const invoices = enrichInvoices(reconciliation.invoices, today, { fallbackDelayDays: state.fallbackDelayDays });
  const openingCash = state.accountStatus === 'connected' ? n(state.account.current_balance) : n(state.manualOpeningCash);
  const forecast = buildCashflowForecast({
    startDate: today,
    horizonDays: Number(state.horizon),
    openingCash,
    invoices,
    transactions: state.transactions,
    scenario: state.scenario,
  });
  const gap = detectLiquidityGap(forecast, state.minimumReserve, {
    significantGapRatio: demoConfig.significantGapRatio,
    prolongedDays: demoConfig.prolongedDays,
  });
  const evaluations = compareFinancingOptions(state.financingOptions, {
    requiredAmount: gap.maximum_gap,
    deadline: gap.first_shortage_date,
    evaluationDate: today,
  });
  const recommendation = buildRecommendation({ gap, financingOptions: state.financingOptions, evaluationDate: today });
  return { today, reconciliation, invoices, openingCash, forecast, gap, evaluations, recommendation };
}

function metric(label, value, hint = '', t = '') {
  return `<article class="metric ${t}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="hint">${esc(hint)}</div></article>`;
}
function badge(text, t = '') { return `<span class="badge ${t}">${esc(text)}</span>`; }

function navMarkup(mobile = false) {
  return `<nav class="${mobile ? 'mobile-nav' : 'nav'}">${PAGES.map(([id, label]) => `<button data-nav="${id}" class="${state.page === id ? 'active' : ''}">${esc(label.replace('Explainable ', '').replace('Executive ', ''))}</button>`).join('')}</nav>`;
}

function chartSvg(forecast, reserve) {
  if (!forecast.length) return '<div class="empty">No forecast data.</div>';
  const width = 900, height = 270, pad = 34;
  const values = forecast.map((r) => n(r.closing_cash));
  const min = Math.min(...values, n(reserve), 0);
  const max = Math.max(...values, n(reserve), 1);
  const span = max - min || 1;
  const x = (i) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
  const y = (v) => pad + ((max - v) / span) * (height - pad * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const reserveY = y(n(reserve)).toFixed(1);
  const zeroY = y(0).toFixed(1);
  return `<div class="chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected closing cash chart">
    <line x1="${pad}" y1="${zeroY}" x2="${width-pad}" y2="${zeroY}" stroke="#e4e9f2" />
    <line x1="${pad}" y1="${reserveY}" x2="${width-pad}" y2="${reserveY}" stroke="#b42318" stroke-dasharray="7 6" />
    <polyline points="${points}" fill="none" stroke="#2658d8" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
    ${values.map((v,i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="#2658d8"><title>${esc(forecast[i].date)}: ${esc(money(v))}</title></circle>`).join('')}
    <text x="${pad}" y="18" font-size="11" fill="#667085">High ${esc(money(max))}</text>
    <text x="${pad}" y="${height-8}" font-size="11" fill="#667085">Low ${esc(money(min))}</text>
  </svg></div><div class="legend"><span><i></i>Projected closing cash</span><span><i class="reserve"></i>Minimum reserve ${esc(money(reserve))}</span></div>`;
}

function accountRows(rows, reconciliations) {
  const matched = new Map(reconciliations.map((r) => [r.transaction_id, r]));
  if (!rows.length) return '<div class="empty">No posted account events yet.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Posted</th><th>Transaction ID</th><th>Direction</th><th>Counterparty / Reference</th><th>Invoice</th><th class="num">Amount</th><th>Reconciliation</th></tr></thead><tbody>${[...rows].sort((a,b)=>String(b.posted_at).localeCompare(String(a.posted_at))).map((r) => {
    const match = matched.get(r.transaction_id);
    return `<tr><td>${esc(new Date(r.posted_at).toLocaleString())}</td><td>${esc(r.transaction_id)}</td><td>${badge(r.direction, r.direction === 'credit' ? 'good' : 'warn')}</td><td><strong>${esc(r.payer || r.payee || 'Unspecified')}</strong><div class="muted small">${esc(r.reference || r.source || '')}</div></td><td>${esc(r.invoice_number || '—')}</td><td class="num">${esc(money(r.amount))}</td><td>${match ? `${badge('Matched','good')} <span class="small muted">${esc(money(match.applied_amount))}</span>` : (r.direction === 'credit' ? badge('Unmatched','warn') : '—')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function invoiceTable(invoices) {
  const open = invoices.filter((i) => calculateOutstanding(i) > 0);
  if (!invoices.length) return '<div class="empty">No invoices.</div>';
  return `<div class="table-wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Status</th><th class="num">Amount</th><th class="num">Collected</th><th class="num">Outstanding</th><th>Expected collection</th><th>Evidence</th><th></th></tr></thead><tbody>${invoices.map((i) => `<tr><td><strong>${esc(i.invoice_number)}</strong></td><td>${esc(i.customer)}</td><td>${esc(i.due_date)}</td><td>${badge(i.status, i.status === 'Paid' ? 'good' : i.status.includes('overdue') || i.status === 'Overdue' ? 'danger' : 'warn')}</td><td class="num">${esc(money(i.amount))}</td><td class="num">${esc(money(i.amount_collected))}</td><td class="num"><strong>${esc(money(i.outstanding))}</strong></td><td>${esc(i.expected_date || '—')}<div class="muted small">${esc(i.confidence || '')}</div></td><td class="small muted">${esc(i.evidence || '')}</td><td><div class="actions"><button class="secondary" data-edit-invoice="${esc(i.invoice_number)}">Edit</button>${open.some((x)=>x.invoice_number===i.invoice_number) ? '' : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
}

function forecastTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Opening</th><th class="num">Confirmed inflow</th><th class="num">Expected</th><th class="num">Uncertain</th><th class="num">Risk-adjusted inflow</th><th class="num">Outflow</th><th class="num">Closing</th><th class="num">Gap</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.date)}</td><td class="num">${esc(money(r.opening_cash))}</td><td class="num">${esc(money(r.confirmed_inflows))}</td><td class="num">${esc(money(r.expected_inflows))}</td><td class="num">${esc(money(r.uncertain_inflows))}</td><td class="num">${esc(money(r.risk_adjusted_inflows))}</td><td class="num">${esc(money(r.outflows))}</td><td class="num"><strong>${esc(money(r.closing_cash))}</strong></td><td class="num">${r.required_liquidity_gap ? `<strong>${esc(money(r.required_liquidity_gap))}</strong>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}

function financingTable(evals) {
  return `<div class="table-wrap"><table><thead><tr><th>Option</th><th>Feasible</th><th>Funds available</th><th class="num">Liquidity improvement</th><th class="num">Cost</th><th class="num">Effective cost</th><th class="num">Remaining gap</th><th>Reason / risk</th></tr></thead><tbody>${evals.map((e) => `<tr><td><strong>${esc(e.name)}</strong><div class="muted small">${esc(e.type)}</div></td><td>${badge(e.feasible ? 'Feasible' : 'Excluded', e.feasible ? 'good' : 'danger')}</td><td>${esc(e.funds_available_date || '—')}${e.meets_deadline ? '' : '<div class="small muted">after deadline</div>'}</td><td class="num">${esc(money(e.liquidity_improvement))}</td><td class="num">${esc(money(e.estimated_total_cost))}</td><td class="num">${esc(pct(e.effective_cost_pct))}</td><td class="num">${esc(money(e.remaining_gap))}</td><td class="small">${esc((e.rejection_reasons || []).join(' ') || e.risks || e.assumptions || '—')}</td></tr>`).join('')}</tbody></table></div>`;
}

function dashboardPage(d) {
  const openReceivables = d.invoices.reduce((sum, i) => sum + n(i.outstanding), 0);
  const upcoming = d.forecast.reduce((sum, r) => sum + n(r.outflows), 0);
  const futureInflows = d.forecast.reduce((sum, r) => sum + n(r.risk_adjusted_inflows), 0);
  return `<div class="page-head"><div><div class="eyebrow">Actual cash + forecast</div><h1>Executive liquidity dashboard</h1><p>Current account cash is reconciled with receivables before the rolling working-capital forecast is calculated.</p></div>${badge(d.gap.severity, tone(d.gap.status))}</div>
  <div class="metric-grid">
    ${metric('Tracked available cash', money(d.openingCash), state.accountStatus === 'connected' ? 'From persistent account ledger' : 'Manual fallback balance', state.accountStatus === 'connected' ? 'good' : 'warn')}
    ${metric('Open receivables', money(openReceivables), 'After credited payments are reconciled')}
    ${metric(`${state.horizon}-day risk-adjusted inflows`, money(futureInflows), `${state.scenario} scenario`)}
    ${metric(`${state.horizon}-day obligations`, money(upcoming), 'Confirmed/modelled outflows')}
    ${metric('Minimum projected cash', money(d.gap.minimum_projected_cash), `Reserve ${money(state.minimumReserve)}`, d.gap.maximum_gap > 0 ? 'danger' : 'good')}
    ${metric('Maximum funding gap', money(d.gap.maximum_gap), d.gap.first_shortage_date ? `Starts ${d.gap.first_shortage_date}` : 'No shortage date', tone(d.gap.status))}
  </div>
  <div class="grid-2"><section class="panel"><div class="panel-head"><div><h2>Rolling liquidity trajectory</h2><p>Uses actual tracked bank cash today, then future receivables and obligations.</p></div>${badge(state.scenario)}</div>${chartSvg(d.gap.rows, state.minimumReserve)}</section>
  <section class="panel recommendation"><div class="eyebrow">Decision engine</div><div class="action">${esc(d.recommendation.action)}</div><div class="kv"><span>Amount required</span><strong>${esc(money(d.recommendation.amount_required))}</strong></div><div class="kv"><span>Funding deadline</span><strong>${esc(d.recommendation.funding_needed_date || 'Not required')}</strong></div><div class="kv"><span>Estimated modeled cost</span><strong>${esc(money(d.recommendation.estimated_cost))}</strong></div><div class="kv"><span>Remaining gap</span><strong>${esc(money(d.recommendation.remaining_gap))}</strong></div><p>${esc(d.recommendation.next_action)}</p><button class="primary" data-nav="recommendation">View full explanation</button></section></div>
  <div class="grid-2 equal"><section class="panel"><div class="panel-head"><div><h2>Latest account activity</h2><p>Polled every five seconds from the persistent ledger.</p></div><button class="secondary" data-nav="account">Open feed</button></div>${accountRows((state.account?.transactions || []).slice(-5), d.reconciliation.reconciliations)}</section>
  <section class="panel"><h2>Reconciliation status</h2><div class="kv"><span>Credits matched to invoices</span><strong>${esc(money(d.reconciliation.matched_credit_amount))}</strong></div><div class="kv"><span>Unmatched credits</span><strong>${esc(money(d.reconciliation.unmatched_credit_amount))}</strong></div><div class="kv"><span>Open invoices</span><strong>${d.invoices.filter(i=>i.outstanding>0).length}</strong></div><div class="kv"><span>Shortage duration</span><strong>${esc(String(d.gap.gap_duration_days || 0))} day(s)</strong></div></section></div>`;
}

function accountPage(d) {
  const auth = state.account?.write_auth_required;
  return `<div class="page-head"><div><div class="eyebrow">Bank/account ingestion</div><h1>Live account feed</h1><p>Incoming credits change the available balance immediately. Invoice-linked credits also reduce the corresponding outstanding receivable.</p></div>${badge(state.accountStatus, state.accountStatus === 'connected' ? 'good' : 'danger')}</div>
  ${state.accountError ? `<div class="callout danger">${esc(state.accountError)}</div>` : ''}
  <div class="metric-grid">${metric('Current available balance', money(d.openingCash), 'Base balance + posted credits − posted debits', 'good')}${metric('Credits today', money(state.account?.credited_today || 0))}${metric('Debits today', money(state.account?.debited_today || 0))}${metric('Matched invoice credits', money(d.reconciliation.matched_credit_amount))}${metric('Unmatched credits', money(d.reconciliation.unmatched_credit_amount), 'Counts as cash, not as invoice settlement', d.reconciliation.unmatched_credit_amount ? 'warn' : 'good')}${metric('Posted events', String(state.account?.posted_count || 0), state.account?.last_posted_at ? new Date(state.account.last_posted_at).toLocaleString() : 'None')}</div>
  <div class="grid-2 equal"><section class="panel"><h2>Post credited/debited account event</h2><p>This is the same ledger path a verified bank adapter or account-aggregator webhook can call.</p>
  <form id="account-form" class="stack-form"><div class="field-pair"><label>Transaction ID<input name="transaction_id" value="BANK-${Date.now()}" required /></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label></div><div class="field-pair"><label>Direction<select name="direction"><option value="credit">Credit received</option><option value="debit">Debit posted</option></select></label><label>Invoice reference<select name="invoice_number"><option value="">Unmatched / not invoice-specific</option>${d.invoices.filter(i=>i.outstanding>0).map(i=>`<option value="${esc(i.invoice_number)}">${esc(i.invoice_number)} · ${esc(i.customer)} · ${esc(money(i.outstanding))}</option>`).join('')}</select></label></div><label>Counterparty<input name="payer" placeholder="Customer / supplier / counterparty" /></label><label>Reference / UTR<input name="reference" placeholder="Bank narration or UTR" /></label><button class="primary">Post account event</button></form></section>
  <section class="panel"><h2>Connection & write protection</h2><p>${auth ? 'This server requires X-API-Key for account writes.' : 'Write-key protection is currently disabled. Enable it before exposing the server publicly.'}</p><form id="key-form" class="stack-form"><label>Write API key<input name="key" type="password" autocomplete="off" value="${esc(accountWriteKey())}" placeholder="Required only when configured on server" /></label><button class="secondary">Store for this browser session</button></form><h3>Base account balance</h3><form id="balance-form" class="stack-form"><label>Known base balance<input name="base_balance" type="number" min="0" step="0.01" value="${esc(state.account?.base_balance ?? state.manualOpeningCash)}" /></label><button class="secondary">Update base balance</button></form><h3>Webhook endpoint</h3><div class="code">POST /api/account/webhook\nX-API-Key: &lt;configured key&gt;\nContent-Type: application/json</div><p class="small">Use a unique bank transaction ID. Duplicate IDs are rejected with HTTP 409.</p></section></div>
  <section class="panel"><div class="panel-head"><div><h2>Persistent account ledger</h2><p>Runtime ledger is stored in <code>data/account_ledger.local.json</code>, which is excluded from Git.</p></div><button id="refresh-account" class="secondary">Refresh now</button></div>${accountRows(state.account?.transactions || [], d.reconciliation.reconciliations)}</section>`;
}

function invoicesPage(d) {
  const edit = state.invoiceEdit ? state.invoices.find(i=>i.invoice_number===state.invoiceEdit) : null;
  const v = edit || { invoice_number:'', customer:'', invoice_date:d.today, due_date:d.today, amount:'', amount_collected:0, actual_payment_date:'', collection_certainty:'expected' };
  return `<div class="page-head"><div><div class="eyebrow">Receivables</div><h1>Invoice management</h1><p>Add/import invoices and track predicted collection dates using customer payment history or a transparent fallback delay.</p></div><a class="secondary" href="/data/invoices_template.csv" download>Download CSV template</a></div>
  <div class="grid-2 equal"><section class="panel"><h2>${edit ? `Edit ${esc(edit.invoice_number)}` : 'Add invoice'}</h2><form id="invoice-form" class="stack-form"><div class="field-pair"><label>Invoice number<input name="invoice_number" value="${esc(v.invoice_number)}" ${edit ? 'readonly' : ''} required /></label><label>Customer<input name="customer" value="${esc(v.customer)}" required /></label></div><div class="field-pair"><label>Invoice date<input name="invoice_date" type="date" value="${esc(v.invoice_date)}" required /></label><label>Due date<input name="due_date" type="date" value="${esc(v.due_date)}" required /></label></div><div class="field-pair"><label>Amount<input name="amount" type="number" min="0" step="0.01" value="${esc(v.amount)}" required /></label><label>Amount already collected<input name="amount_collected" type="number" min="0" step="0.01" value="${esc(v.amount_collected)}" required /></label></div><div class="field-pair"><label>Actual payment date<input name="actual_payment_date" type="date" value="${esc(v.actual_payment_date || '')}" /></label><label>Collection certainty<select name="collection_certainty">${['confirmed','expected','uncertain'].map(x=>`<option ${v.collection_certainty===x?'selected':''}>${x}</option>`).join('')}</select></label></div><div class="actions"><button class="primary">${edit ? 'Save changes' : 'Add invoice'}</button>${edit ? '<button type="button" id="cancel-invoice" class="secondary">Cancel</button>' : ''}</div></form></section>
  <section class="panel"><h2>Import invoice CSV</h2><p>Validated for required columns, dates, amounts, duplicate invoice numbers and over-collected invoices.</p><form id="csv-form" class="stack-form"><label>CSV file<input name="csv" type="file" accept=".csv,text/csv" required /></label><button class="secondary">Validate and import</button></form><h3>Forecast assumption</h3><label>Fallback customer delay (days)<input id="fallback-delay" type="number" min="0" max="90" value="${esc(state.fallbackDelayDays)}" /></label><div class="callout">Historical customer delay is used when enough paid invoices exist. Otherwise this configurable fallback is clearly identified in the evidence column.</div></section></div>
  <section class="panel"><div class="panel-head"><div><h2>Invoice register</h2><p>Ledger-linked credits are reflected before outstanding balances are displayed.</p></div>${badge(`${d.invoices.length} records`)}</div>${invoiceTable(d.invoices)}</section>`;
}

function forecastPage(d) {
  return `<div class="page-head"><div><div class="eyebrow">Rolling forecast</div><h1>Cash-flow forecast</h1><p>Switch between 7, 14 and 30 days and adjust the collection-risk scenario. The opening position comes from the tracked account balance when available.</p></div></div>
  <section class="panel"><div class="toolbar"><label>Horizon<select id="horizon">${[7,14,30].map(x=>`<option value="${x}" ${Number(state.horizon)===x?'selected':''}>${x} days</option>`).join('')}</select></label><label>Scenario<select id="scenario">${['Conservative','Base','Optimistic'].map(x=>`<option ${state.scenario===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Minimum reserve<input id="reserve" type="number" min="0" step="1000" value="${esc(state.minimumReserve)}" /></label>${state.accountStatus !== 'connected' ? `<label>Manual opening cash<input id="opening-cash" type="number" min="0" step="1000" value="${esc(state.manualOpeningCash)}" /></label>` : ''}</div>${chartSvg(d.gap.rows, state.minimumReserve)}</section>
  <section class="panel"><div class="panel-head"><div><h2>Daily cash-flow audit trail</h2><p>Risk-adjusted collections remain separately visible from contractual amounts.</p></div>${badge(`${state.horizon} days`)}</div>${forecastTable(d.gap.rows)}</section>`;
}

function warningPage(d) {
  const thresholdText = d.gap.thresholds ? `Significant if maximum gap reaches ${d.gap.thresholds.significantGapRatio}× reserve or first shortage episode lasts at least ${d.gap.thresholds.prolongedDays} days.` : '';
  return `<div class="page-head"><div><div class="eyebrow">Early warning</div><h1>Liquidity risk detection</h1><p>The shortage is measured against the configured operating reserve, not simply against zero cash.</p></div>${badge(d.gap.severity, tone(d.gap.status))}</div>
  <div class="metric-grid">${metric('First shortage date', d.gap.first_shortage_date || 'None')}${metric('Maximum funding gap', money(d.gap.maximum_gap),'',tone(d.gap.status))}${metric('First episode duration', `${d.gap.gap_duration_days || 0} day(s)`)}${metric('Total gap days', `${d.gap.total_gap_days || 0}`)}${metric('Recovery date', d.gap.recovery_date || 'Not within horizon')}${metric('Minimum projected cash', money(d.gap.minimum_projected_cash))}</div>
  <div class="grid-2 equal"><section class="panel"><h2>Severity logic</h2><p>${esc(thresholdText)}</p><div class="callout ${tone(d.gap.status)}">Status: <strong>${esc(d.gap.status)}</strong>. ${esc(d.gap.severity)}</div><h3>Formula</h3><div class="code">Projected closing cash = tracked current cash + cumulative risk-adjusted future inflows − cumulative future outflows\nRequired liquidity gap = max(0, minimum cash reserve − projected closing cash)</div></section><section class="panel"><h2>Current evidence</h2><div class="kv"><span>Tracked opening cash</span><strong>${esc(money(d.openingCash))}</strong></div><div class="kv"><span>Minimum reserve</span><strong>${esc(money(state.minimumReserve))}</strong></div><div class="kv"><span>Account feed</span><strong>${esc(state.accountStatus)}</strong></div><div class="kv"><span>Forecast scenario</span><strong>${esc(state.scenario)}</strong></div><div class="kv"><span>Forecast horizon</span><strong>${esc(String(state.horizon))} days</strong></div></section></div>${chartSvg(d.gap.rows, state.minimumReserve)}`;
}

function financingPage(d) {
  return `<div class="page-head"><div><div class="eyebrow">Feasibility before cost</div><h1>Financing & operational alternatives</h1><p>Eligibility, timing and usable amount are enforced before pricing. A cheap option that arrives too late is excluded.</p></div></div>
  <div class="metric-grid">${metric('Required amount', money(d.gap.maximum_gap))}${metric('Funding deadline', d.gap.first_shortage_date || 'Not required')}${metric('Feasible options', String(d.evaluations.filter(e=>e.feasible).length))}${metric('Options covering gap', String(d.evaluations.filter(e=>e.feasible&&e.covers_required_amount).length))}${metric('Cheapest feasible cost', money((d.evaluations.filter(e=>e.feasible && e.estimated_total_cost>=0).map(e=>e.estimated_total_cost).sort((a,b)=>a-b)[0]) ?? 0))}${metric('Current risk', d.gap.status,'',tone(d.gap.status))}</div>
  <section class="panel"><h2>Comparison table</h2>${financingTable(d.evaluations)}<div class="callout">All offers in the bundled demo are hypothetical. Replace their terms with actual approved facilities before relying on the recommendation.</div></section>`;
}

function recommendationPage(d) {
  const r = d.recommendation;
  return `<div class="page-head"><div><div class="eyebrow">Explainable decision</div><h1>Recommendation</h1><p>The engine first establishes whether a gap exists, then applies hard feasibility constraints, then compares feasible cost and operational impact.</p></div>${badge(r.external_financing_necessary === false ? 'No borrowing required' : d.gap.status, r.external_financing_necessary === false ? 'good' : tone(d.gap.status))}</div>
  <section class="panel recommendation"><div class="eyebrow">Recommended action</div><div class="action">${esc(r.action)}</div><div class="grid-2 equal"><div><div class="kv"><span>Amount required</span><strong>${esc(money(r.amount_required))}</strong></div><div class="kv"><span>Funding needed by</span><strong>${esc(r.funding_needed_date || 'Not required')}</strong></div><div class="kv"><span>Expected shortage duration</span><strong>${esc(String(r.expected_duration_days || 0))} day(s)</strong></div></div><div><div class="kv"><span>Estimated modeled cost</span><strong>${esc(money(r.estimated_cost))}</strong></div><div class="kv"><span>Liquidity improvement</span><strong>${esc(money(r.liquidity_improvement))}</strong></div><div class="kv"><span>Remaining gap</span><strong>${esc(money(r.remaining_gap))}</strong></div></div></div></section>
  <div class="grid-2 equal"><section class="panel"><h2>Why this action</h2><ul class="evidence-list">${(r.rationale || []).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h3>Next action</h3><div class="callout good">${esc(r.next_action)}</div></section><section class="panel"><h2>Rejected alternatives</h2>${(r.rejected || []).length ? `<ul class="evidence-list">${r.rejected.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>` : '<div class="empty">No rejected alternatives.</div>'}<h3>Residual risk</h3><div class="callout warn">${esc(r.residual_risk)}</div></section></div>`;
}

function dataPage(d) {
  return `<div class="page-head"><div><div class="eyebrow">Scenario management</div><h1>Data & scenarios</h1><p>Add future obligations or inflows, switch to a healthy demonstration case, or reset all browser-side scenario data.</p></div></div>
  <div class="grid-2 equal"><section class="panel"><h2>Add future cash-flow event</h2><form id="event-form" class="stack-form"><div class="field-pair"><label>Date<input name="date" type="date" value="${esc(d.today)}" required /></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required /></label></div><div class="field-pair"><label>Direction<select name="direction"><option value="outflow">Outflow</option><option value="inflow">Inflow</option></select></label><label>Certainty<select name="certainty"><option value="confirmed">confirmed</option><option value="expected">expected</option><option value="uncertain">uncertain</option></select></label></div><label>Category<input name="category" value="Other" /></label><label>Label<input name="label" placeholder="What is this cash event?" /></label><button class="primary">Add future event</button></form></section>
  <section class="panel"><h2>Demonstration scenarios</h2><p>The base case is deliberately constructed to show a shortage. The healthy case reduces modeled outflows and should support a no-borrowing decision.</p><div class="actions"><button id="base-scenario" class="secondary">Load base shortage case</button><button id="healthy-scenario" class="secondary">Load healthy no-borrowing case</button><button id="reset-browser" class="danger-btn">Reset browser data</button></div><h3>Account ledger reset</h3><p>Separate from browser scenario data because actual posted account events are server-side.</p><button id="reset-ledger" class="danger-btn">Reset account ledger to ${esc(money(demoConfig.openingCash))}</button></section></div>
  <section class="panel"><h2>Future cash events</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th>Direction</th><th>Category</th><th>Label</th><th>Certainty</th><th class="num">Amount</th><th></th></tr></thead><tbody>${state.transactions.map(tx=>`<tr><td>${esc(tx.date)}</td><td>${badge(tx.direction,tx.direction==='inflow'?'good':'warn')}</td><td>${esc(tx.category)}</td><td>${esc(tx.label)}</td><td>${esc(tx.certainty)}</td><td class="num">${esc(money(tx.amount))}</td><td><button class="danger-btn" data-delete-event="${esc(tx.id)}">Delete</button></td></tr>`).join('')}</tbody></table></div></section>`;
}

function render() {
  const d = derive();
  const pageContent = ({
    dashboard: dashboardPage,
    account: accountPage,
    invoices: invoicesPage,
    forecast: forecastPage,
    warning: warningPage,
    financing: financingPage,
    recommendation: recommendationPage,
    data: dataPage,
  }[state.page] || dashboardPage)(d);

  const pageLabel = PAGES.find(([id]) => id === state.page)?.[1] || 'Dashboard';
  app.innerHTML = `<aside class="sidebar"><div class="brand"><div class="brand-mark">N</div><div><h1>NovaNex</h1><p>MSME Liquidity Engine</p></div></div>${navMarkup()}<div class="side-note"><strong>Decision-support tool</strong><br/>Forecasts are scenario-based and financing terms are illustrative until replaced with verified business/lender data.</div></aside><main class="main"><header class="topbar"><h2>${esc(pageLabel)}</h2><div class="topbar-right"><span class="status-line"><i class="dot ${state.accountStatus==='connected'?'good':state.accountStatus==='offline'?'danger':'warn'}"></i><span class="keep">Account ${esc(state.accountStatus)}</span></span><span>${esc(d.today)}</span></div></header><div class="content">${pageContent}</div></main>${navMarkup(true)}`;
  bind(d);
}

function formObject(form) { return Object.fromEntries(new FormData(form).entries()); }

function bind(d) {
  document.querySelectorAll('[data-nav]').forEach((el) => el.addEventListener('click', () => { state.page = el.dataset.nav; render(); window.scrollTo(0,0); }));

  document.querySelector('#refresh-account')?.addEventListener('click', () => refreshAccount());
  document.querySelector('#key-form')?.addEventListener('submit', (e) => { e.preventDefault(); const key = formObject(e.currentTarget).key.trim(); if (key) sessionStorage.setItem('novanex-write-key', key); else sessionStorage.removeItem('novanex-write-key'); toast('Write key stored for this browser session.'); });
  document.querySelector('#account-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = formObject(e.currentTarget);
    try {
      await api('/api/account/transactions', { method: 'POST', body: JSON.stringify({ ...f, amount: Number(f.amount), source: 'dashboard' }) });
      toast('Account event posted. Liquidity forecast recalculated.');
      await refreshAccount();
    } catch (error) { toast(error.message, true); }
  });
  document.querySelector('#balance-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const f=formObject(e.currentTarget); await api('/api/account/base-balance',{method:'POST',body:JSON.stringify({base_balance:Number(f.base_balance)})}); toast('Base balance updated.'); await refreshAccount(); } catch(error){toast(error.message,true);}
  });

  document.querySelector('#invoice-form')?.addEventListener('submit', (e) => {
    e.preventDefault(); const f=formObject(e.currentTarget); const amount=Number(f.amount), collected=Number(f.amount_collected);
    if (!f.invoice_number.trim() || !f.customer.trim()) return toast('Invoice number and customer are required.', true);
    if (!(amount >= 0) || !(collected >= 0) || collected > amount) return toast('Check invoice and collected amounts.', true);
    const invoice = { ...f, amount, amount_collected: collected };
    const idx = state.invoices.findIndex(i=>i.invoice_number===invoice.invoice_number);
    if (idx >= 0 && !state.invoiceEdit) return toast('Invoice number already exists.', true);
    if (idx >= 0) state.invoices[idx] = invoice; else state.invoices.push(invoice);
    state.invoiceEdit = null; persist(); render(); toast('Invoice saved.');
  });
  document.querySelector('#cancel-invoice')?.addEventListener('click', () => { state.invoiceEdit=null; render(); });
  document.querySelectorAll('[data-edit-invoice]').forEach(el=>el.addEventListener('click',()=>{ state.invoiceEdit=el.dataset.editInvoice; render(); window.scrollTo(0,0); }));
  document.querySelector('#fallback-delay')?.addEventListener('change',(e)=>{state.fallbackDelayDays=Math.max(0,Number(e.target.value)||0);persist();render();});
  document.querySelector('#csv-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const file=e.currentTarget.elements.csv.files[0]; if(!file) return;
    const result=parseInvoiceCsv(await file.text()); if(result.errors.length) return toast(result.errors.join(' '),true);
    const existing=new Set(state.invoices.map(i=>i.invoice_number)); const conflicts=result.rows.filter(r=>existing.has(r.invoice_number)); if(conflicts.length) return toast(`Existing invoice conflict: ${conflicts.map(x=>x.invoice_number).join(', ')}`,true);
    state.invoices.push(...result.rows); persist(); render(); toast(`${result.rows.length} invoice(s) imported.`);
  });

  document.querySelector('#horizon')?.addEventListener('change',(e)=>{state.horizon=Number(e.target.value);persist();render();});
  document.querySelector('#scenario')?.addEventListener('change',(e)=>{state.scenario=e.target.value;persist();render();});
  document.querySelector('#reserve')?.addEventListener('change',(e)=>{state.minimumReserve=Math.max(0,Number(e.target.value)||0);persist();render();});
  document.querySelector('#opening-cash')?.addEventListener('change',(e)=>{state.manualOpeningCash=Math.max(0,Number(e.target.value)||0);persist();render();});

  document.querySelector('#event-form')?.addEventListener('submit',(e)=>{e.preventDefault();const f=formObject(e.currentTarget);state.transactions.push({id:`USER-${Date.now()}`,...f,amount:Number(f.amount)});persist();render();toast('Future cash event added.');});
  document.querySelectorAll('[data-delete-event]').forEach(el=>el.addEventListener('click',()=>{state.transactions=state.transactions.filter(tx=>tx.id!==el.dataset.deleteEvent);persist();render();}));
  document.querySelector('#base-scenario')?.addEventListener('click',()=>{state.transactions=structuredClone(demoTransactions);state.scenario='Base';persist();render();toast('Base shortage scenario loaded.');});
  document.querySelector('#healthy-scenario')?.addEventListener('click',()=>{state.transactions=structuredClone(healthyTransactions);state.scenario='Base';persist();render();toast('Healthy scenario loaded.');});
  document.querySelector('#reset-browser')?.addEventListener('click',()=>{localStorage.removeItem(STORAGE_KEY);state=freshState();render();toast('Browser scenario data reset.');});
  document.querySelector('#reset-ledger')?.addEventListener('click',async()=>{try{await api('/api/account/reset',{method:'POST',body:JSON.stringify({base_balance:demoConfig.openingCash})});toast('Account ledger reset.');await refreshAccount();}catch(error){toast(error.message,true);}});
}

function userIsEditing() {
  const el = document.activeElement;
  if (!el || !app.contains(el)) return false;
  return ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.isContentEditable;
}

render();
refreshAccount();
pollTimer = setInterval(() => refreshAccount({
  rerender: document.visibilityState === 'visible' && !userIsEditing(),
}), 5000);
window.addEventListener('beforeunload', () => clearInterval(pollTimer));
