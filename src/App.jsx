import { useEffect, useMemo, useState } from 'react';
import MetricCard from './components/MetricCard.jsx';
import Badge from './components/Badge.jsx';
import LineChart from './components/LineChart.jsx';
import { demoConfig, demoFinancingOptions, demoInvoices, demoTransactions, healthyTransactions } from './data/demoData.js';
import { enrichInvoices } from './lib/invoiceForecasting.js';
import { buildCashflowForecast, forecastWindows } from './lib/cashflowForecasting.js';
import { detectLiquidityGap } from './lib/gapDetection.js';
import { compareFinancingOptions } from './lib/financing.js';
import { buildRecommendation } from './lib/recommendations.js';
import { parseInvoiceCsv } from './lib/dataManager.js';
import { reconcileAccountCredits } from './lib/accountLedger.js';
import { getAccountSnapshot, recordAccountTransaction, resetAccountFeed, setAccountBaseBalance } from './lib/accountApi.js';

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

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const money = (value) => INR.format(Number(value) || 0);
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const emptyInvoice = {
  invoice_number: '', customer: '', invoice_date: demoConfig.today, due_date: demoConfig.today,
  amount: 0, amount_collected: 0, actual_payment_date: '', collection_certainty: 'expected',
};

const emptyAccount = {
  account_name: 'MSME Operating Account',
  account_mask: 'Not connected',
  base_balance: demoConfig.openingCash,
  current_balance: demoConfig.openingCash,
  total_credits: 0,
  total_debits: 0,
  credited_today: 0,
  debited_today: 0,
  posted_count: 0,
  last_posted_at: null,
  transactions: [],
  synced_at: null,
};

function riskTone(status) {
  if (status === 'No gap') return 'good';
  if (status === 'Temporary') return 'warn';
  if (status === 'Significant') return 'danger';
  return 'neutral';
}

function newestFirst(items = []) {
  return [...items].sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)));
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [invoices, setInvoices] = useState(demoInvoices);
  const [transactions, setTransactions] = useState(demoTransactions);
  const [financingOptions, setFinancingOptions] = useState(demoFinancingOptions);
  const [openingCash, setOpeningCash] = useState(demoConfig.openingCash);
  const [minimumReserve, setMinimumReserve] = useState(demoConfig.minimumReserve);
  const [horizon, setHorizon] = useState(30);
  const [scenario, setScenario] = useState('Base');
  const [fallbackDelayDays, setFallbackDelayDays] = useState(demoConfig.fallbackDelayDays);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoice);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [importMessages, setImportMessages] = useState([]);
  const [transactionForm, setTransactionForm] = useState({ date: demoConfig.today, amount: 0, direction: 'outflow', category: 'Other', certainty: 'confirmed', label: '' });
  const [accountSnapshot, setAccountSnapshot] = useState(emptyAccount);
  const [accountStatus, setAccountStatus] = useState('checking');
  const [accountMessage, setAccountMessage] = useState('Connecting to account feed...');
  const [baseBalanceInput, setBaseBalanceInput] = useState(demoConfig.openingCash);
  const [accountForm, setAccountForm] = useState({
    transaction_id: `BANK-${Date.now()}`,
    amount: 0,
    direction: 'credit',
    payer: '',
    reference: '',
    invoice_number: '',
  });

  async function refreshAccount(silent = false) {
    try {
      const snapshot = await getAccountSnapshot();
      setAccountSnapshot(snapshot);
      setBaseBalanceInput(snapshot.base_balance);
      setAccountStatus('connected');
      if (!silent) setAccountMessage('Account feed connected. Posted bank events automatically refresh the liquidity forecast.');
    } catch (error) {
      setAccountStatus('offline');
      if (!silent) setAccountMessage(`Account feed offline. Using fallback opening cash. ${error.message}`);
    }
  }

  useEffect(() => {
    refreshAccount();
    const timer = setInterval(() => refreshAccount(true), 5000);
    return () => clearInterval(timer);
  }, []);

  const ledgerReconciliation = useMemo(
    () => reconcileAccountCredits(invoices, accountStatus === 'connected' ? accountSnapshot.transactions : []),
    [invoices, accountSnapshot.transactions, accountStatus],
  );
  const forecastInvoices = ledgerReconciliation.invoices;
  const trackedCash = accountStatus === 'connected' ? accountSnapshot.current_balance : openingCash;
  const enrichedInvoices = useMemo(() => enrichInvoices(forecastInvoices, demoConfig.today, { fallbackDelayDays }), [forecastInvoices, fallbackDelayDays]);
  const windows = useMemo(() => forecastWindows({ startDate: demoConfig.today, openingCash: trackedCash, invoices: enrichedInvoices, transactions, scenario }), [trackedCash, enrichedInvoices, transactions, scenario]);
  const forecast = windows[horizon];
  const gap = useMemo(() => detectLiquidityGap(forecast, minimumReserve, { significantGapRatio: demoConfig.significantGapRatio, prolongedDays: demoConfig.prolongedDays }), [forecast, minimumReserve]);
  const evaluations = useMemo(() => compareFinancingOptions(financingOptions, { requiredAmount: gap.maximum_gap, deadline: gap.first_shortage_date, evaluationDate: demoConfig.today }), [financingOptions, gap]);
  const recommendation = useMemo(() => buildRecommendation({ gap, financingOptions, evaluationDate: demoConfig.today }), [gap, financingOptions]);
  const scenarioForecasts = useMemo(() => ['Conservative', 'Base', 'Optimistic'].map((name) => ({
    name,
    values: buildCashflowForecast({ startDate: demoConfig.today, horizonDays: horizon, openingCash: trackedCash, invoices: enrichedInvoices, transactions, scenario: name }).map((row) => row.closing_cash),
  })), [horizon, trackedCash, enrichedInvoices, transactions]);

  const openInvoices = enrichedInvoices.filter((invoice) => invoice.outstanding > 0);
  const overdue = openInvoices.filter((invoice) => invoice.payment_status.includes('Overdue'));
  const expectedCollections = forecast.reduce((sum, row) => sum + row.risk_adjusted_inflows, 0);
  const upcomingObligations = forecast.reduce((sum, row) => sum + row.outflows, 0);
  const minimumProjectedCash = Math.min(...forecast.map((row) => row.closing_cash));
  const matchedTransactionIds = new Set(ledgerReconciliation.reconciliations.map((item) => item.transaction_id));
  const recentAccountTransactions = newestFirst(accountSnapshot.transactions);

  const filteredInvoices = enrichedInvoices.filter((invoice) => {
    const q = filter.toLowerCase();
    const matchesSearch = !q || invoice.invoice_number.toLowerCase().includes(q) || invoice.customer.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All' || invoice.payment_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function resetDemo(mode = 'gap') {
    const base = mode === 'healthy' ? 600000 : demoConfig.openingCash;
    setInvoices(demoInvoices);
    setTransactions(mode === 'healthy' ? healthyTransactions : demoTransactions);
    setOpeningCash(base);
    setMinimumReserve(demoConfig.minimumReserve);
    setFinancingOptions(demoFinancingOptions);
    setImportMessages([mode === 'healthy' ? 'Healthy-liquidity scenario loaded.' : 'Funding-gap demonstration scenario loaded.']);
    if (accountStatus === 'connected') {
      try {
        const result = await resetAccountFeed(base);
        setAccountSnapshot(result.snapshot);
        setBaseBalanceInput(base);
        setAccountMessage('Account ledger reset for the selected synthetic scenario.');
      } catch (error) {
        setAccountMessage(`Scenario loaded, but account feed reset failed: ${error.message}`);
      }
    }
  }

  function saveInvoice(event) {
    event.preventDefault();
    const normalized = { ...invoiceForm, amount: num(invoiceForm.amount), amount_collected: num(invoiceForm.amount_collected) };
    if (!normalized.invoice_number.trim() || !normalized.customer.trim()) return;
    if (editingInvoice) {
      setInvoices((items) => items.map((item) => item.invoice_number === editingInvoice ? normalized : item));
    } else if (!invoices.some((item) => item.invoice_number === normalized.invoice_number)) {
      setInvoices((items) => [...items, normalized]);
    } else {
      setImportMessages([`Invoice ${normalized.invoice_number} already exists.`]);
      return;
    }
    setEditingInvoice(null);
    setInvoiceForm(emptyInvoice);
  }

  function beginEdit(invoice) {
    const baseInvoice = invoices.find((item) => item.invoice_number === invoice.invoice_number) || invoice;
    setEditingInvoice(invoice.invoice_number);
    setInvoiceForm({
      invoice_number: baseInvoice.invoice_number,
      customer: baseInvoice.customer,
      invoice_date: baseInvoice.invoice_date,
      due_date: baseInvoice.due_date,
      amount: baseInvoice.amount,
      amount_collected: baseInvoice.amount_collected,
      actual_payment_date: baseInvoice.actual_payment_date || '',
      collection_certainty: baseInvoice.collection_certainty || 'expected',
    });
  }

  async function importCsv(file) {
    if (!file) return;
    const result = parseInvoiceCsv(await file.text());
    if (result.errors.length) {
      setImportMessages(result.errors);
      return;
    }
    const existing = new Set(invoices.map((invoice) => invoice.invoice_number));
    const conflicts = result.rows.filter((row) => existing.has(row.invoice_number));
    if (conflicts.length) {
      setImportMessages([`Import blocked. Existing invoice number(s): ${conflicts.map((row) => row.invoice_number).join(', ')}.`]);
      return;
    }
    setInvoices((items) => [...items, ...result.rows]);
    setImportMessages([`${result.rows.length} invoice record(s) imported successfully.`]);
  }

  function addTransaction(event) {
    event.preventDefault();
    setTransactions((items) => [...items, { ...transactionForm, id: `USER-${Date.now()}`, amount: num(transactionForm.amount), label: transactionForm.label || transactionForm.category }]);
    setTransactionForm({ date: demoConfig.today, amount: 0, direction: 'outflow', category: 'Other', certainty: 'confirmed', label: '' });
  }

  async function submitAccountTransaction(event) {
    event.preventDefault();
    try {
      const result = await recordAccountTransaction({
        ...accountForm,
        amount: num(accountForm.amount),
        posted_at: new Date().toISOString(),
        status: 'posted',
        source: 'bank_webhook',
      });
      setAccountSnapshot(result.snapshot);
      setAccountStatus('connected');
      const invoiceText = accountForm.invoice_number ? ` and reconciled against ${accountForm.invoice_number}` : '';
      setAccountMessage(`${accountForm.direction === 'credit' ? 'Credit' : 'Debit'} ${money(accountForm.amount)} posted${invoiceText}. Forecast recalculated.`);
      setAccountForm({ transaction_id: `BANK-${Date.now()}`, amount: 0, direction: 'credit', payer: '', reference: '', invoice_number: '' });
    } catch (error) {
      setAccountMessage(error.message);
    }
  }

  async function updateAccountBase(event) {
    event.preventDefault();
    try {
      const result = await setAccountBaseBalance(baseBalanceInput);
      setAccountSnapshot(result.snapshot);
      setAccountStatus('connected');
      setAccountMessage('Account base balance updated. The shortage analysis has been recalculated.');
    } catch (error) {
      setAccountMessage(error.message);
    }
  }

  function updateFinance(id, field, value) {
    setFinancingOptions((items) => items.map((item) => item.id === id ? { ...item, [field]: field === 'eligible' || field === 'contract_permitted' ? value : num(value) } : item));
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-symbol">N</div>
          <div><strong>NovaNex</strong><span>MSME Liquidity Engine</span></div>
        </div>
        <nav>
          {PAGES.map(([id, label]) => <button key={id} className={page === id ? 'active' : ''} onClick={() => setPage(id)}>{label}</button>)}
        </nav>
        <div className="side-note">
          <span>Account-aware decision support</span>
          <p>A local bank-feed adapter accepts posted account events. No real bank credentials or lender credentials are stored in this project.</p>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">Working-capital early warning</p>
            <h1>{PAGES.find(([id]) => id === page)?.[1]}</h1>
          </div>
          <div className="topbar-controls">
            <label>Scenario<select value={scenario} onChange={(e) => setScenario(e.target.value)}><option>Conservative</option><option>Base</option><option>Optimistic</option></select></label>
            <Badge tone={accountStatus === 'connected' ? 'good' : accountStatus === 'offline' ? 'warn' : 'neutral'}>{accountStatus === 'connected' ? 'Account live' : accountStatus}</Badge>
            <Badge tone={riskTone(gap.status)}>{gap.severity}</Badge>
          </div>
        </header>

        {page === 'dashboard' && <section className="page-section">
          <div className="metric-grid">
            <MetricCard label={accountStatus === 'connected' ? 'Tracked account balance' : 'Fallback opening cash'} value={money(trackedCash)} hint={accountStatus === 'connected' ? `${accountSnapshot.account_name} · ${accountSnapshot.account_mask}` : 'Account feed is offline'} tone={accountStatus === 'connected' ? 'good' : 'warn'} />
            <MetricCard label="Credits received today" value={money(accountSnapshot.credited_today)} hint={accountStatus === 'connected' ? `${ledgerReconciliation.reconciliations.length} invoice reconciliation(s)` : 'Feed offline'} />
            <MetricCard label={`${horizon}-day expected inflows`} value={money(expectedCollections)} hint="Future receivables after credited payments are reconciled" />
            <MetricCard label={`${horizon}-day obligations`} value={money(upcomingObligations)} hint="Committed modeled outflows" />
            <MetricCard label="Minimum projected cash" value={money(minimumProjectedCash)} hint={`Reserve: ${money(minimumReserve)}`} tone={minimumProjectedCash < minimumReserve ? 'danger' : 'good'} />
            <MetricCard label="Maximum funding gap" value={money(gap.maximum_gap)} hint={gap.first_shortage_date ? `Starts ${gap.first_shortage_date}` : 'No shortage date'} tone={riskTone(gap.status)} />
          </div>
          <div className="two-column">
            <article className="panel wide-panel"><div className="panel-head"><div><h2>Liquidity trajectory from actual tracked cash</h2><p>Posted account credits affect today’s available cash immediately. Remaining receivables are forecast separately.</p></div><Badge tone={riskTone(gap.status)}>{gap.status}</Badge></div><LineChart series={[{ name: scenario, values: forecast.map((row) => row.closing_cash) }]} reserve={minimumReserve} /></article>
            <article className="panel recommendation-card"><p className="eyebrow">Recommended response</p><h2>{recommendation.action}</h2><div className="recommendation-stat"><span>Required</span><strong>{money(recommendation.amount_required)}</strong></div><div className="recommendation-stat"><span>Needed by</span><strong>{recommendation.funding_needed_date || 'Not required'}</strong></div><div className="recommendation-stat"><span>Estimated modeled cost</span><strong>{money(recommendation.estimated_cost)}</strong></div><button className="primary" onClick={() => setPage('recommendation')}>View full explanation</button></article>
          </div>
          <div className="two-column">
            <article className="panel"><div className="panel-head"><div><h2>Latest posted account activity</h2><p>The account service is polled every five seconds.</p></div><button className="secondary" onClick={() => setPage('account')}>Open account feed</button></div><AccountActivity rows={recentAccountTransactions.slice(0, 5)} matchedTransactionIds={matchedTransactionIds} /></article>
            <article className="panel"><h2>Receivable position after reconciliation</h2><div className="recommendation-stat"><span>Open receivables</span><strong>{money(openInvoices.reduce((sum, invoice) => sum + invoice.outstanding, 0))}</strong></div><div className="recommendation-stat"><span>Overdue invoices</span><strong>{overdue.length}</strong></div><div className="recommendation-stat"><span>Credits matched to invoices</span><strong>{money(ledgerReconciliation.matched_credit_amount)}</strong></div><div className="recommendation-stat"><span>Unmatched credits</span><strong>{money(ledgerReconciliation.unmatched_credit_amount)}</strong></div></article>
          </div>
          <article className="panel"><div className="panel-head"><div><h2>Next five forecast cash-flow events</h2><p>These are future modeled events. Posted bank credits are already included in tracked cash and are not inserted again here.</p></div></div><EventTable rows={forecast.flatMap((row) => row.events.map((event) => ({ ...event, date: row.date }))).slice(0, 5)} /></article>
        </section>}

        {page === 'account' && <section className="page-section">
          <article className={`panel account-status account-${accountStatus}`}>
            <div className="panel-head"><div><p className="eyebrow">Account ingestion layer</p><h2>{accountStatus === 'connected' ? `${accountSnapshot.account_name} · ${accountSnapshot.account_mask}` : 'Account feed unavailable'}</h2><p>{accountMessage}</p></div><button className="secondary" onClick={() => refreshAccount()}>Refresh now</button></div>
          </article>
          <div className="metric-grid">
            <MetricCard label="Current available balance" value={money(trackedCash)} hint="Base balance + posted credits − posted debits" tone={accountStatus === 'connected' ? 'good' : 'warn'} />
            <MetricCard label="Credits today" value={money(accountSnapshot.credited_today)} />
            <MetricCard label="Debits today" value={money(accountSnapshot.debited_today)} />
            <MetricCard label="Matched invoice credits" value={money(ledgerReconciliation.matched_credit_amount)} hint={`${ledgerReconciliation.reconciliations.length} matched event(s)`} />
            <MetricCard label="Unmatched credits" value={money(ledgerReconciliation.unmatched_credit_amount)} hint="Cash still counts, invoice remains unreconciled" tone={ledgerReconciliation.unmatched_credit_amount > 0 ? 'warn' : 'good'} />
            <MetricCard label="Posted bank events" value={accountSnapshot.posted_count} hint={accountSnapshot.last_posted_at ? `Latest ${new Date(accountSnapshot.last_posted_at).toLocaleString()}` : 'No events yet'} />
          </div>
          <div className="two-column settings-grid">
            <article className="panel form-panel">
              <h2>Receive account event</h2>
              <p>This form uses the same endpoint a bank-data aggregator or webhook adapter can call. For the hackathon it lets you demonstrate a payment arriving while the dashboard is open.</p>
              <form className="stack-form" onSubmit={submitAccountTransaction}>
                <div className="field-pair"><label>Bank transaction ID<input value={accountForm.transaction_id} onChange={(e) => setAccountForm({ ...accountForm, transaction_id: e.target.value })} required /></label><label>Amount<input type="number" min="0.01" step="0.01" value={accountForm.amount} onChange={(e) => setAccountForm({ ...accountForm, amount: e.target.value })} required /></label></div>
                <div className="field-pair"><label>Direction<select value={accountForm.direction} onChange={(e) => setAccountForm({ ...accountForm, direction: e.target.value })}><option value="credit">Credit received</option><option value="debit">Debit posted</option></select></label><label>Invoice reference<select value={accountForm.invoice_number} onChange={(e) => setAccountForm({ ...accountForm, invoice_number: e.target.value })}><option value="">Unmatched / not invoice-specific</option>{openInvoices.map((invoice) => <option key={invoice.invoice_number} value={invoice.invoice_number}>{invoice.invoice_number} · {invoice.customer} · {money(invoice.outstanding)}</option>)}</select></label></div>
                <label>Payer / counterparty<input value={accountForm.payer} onChange={(e) => setAccountForm({ ...accountForm, payer: e.target.value })} placeholder="Customer or counterparty" /></label>
                <label>Bank reference / UTR<input value={accountForm.reference} onChange={(e) => setAccountForm({ ...accountForm, reference: e.target.value })} placeholder="UTR, narration or reference" /></label>
                <button className="primary" disabled={accountStatus !== 'connected'}>{accountForm.direction === 'credit' ? 'Post credited payment' : 'Post account debit'}</button>
              </form>
            </article>
            <article className="panel">
              <h2>Account balance baseline</h2>
              <p>The ledger begins from a known bank balance and then applies only posted account events. When connected, this tracked balance replaces the manually entered opening cash in the shortage engine.</p>
              <form className="stack-form" onSubmit={updateAccountBase}><label>Base account balance<input type="number" min="0" value={baseBalanceInput} onChange={(e) => setBaseBalanceInput(e.target.value)} /></label><button className="secondary" disabled={accountStatus !== 'connected'}>Update base balance</button></form>
              <h3>Webhook contract</h3>
              <code className="code-block">POST /api/account/transactions</code>
              <p className="small-copy">Required: transaction_id and amount. Optional: direction, payer, reference, invoice_number, posted_at, source. Duplicate transaction IDs are rejected.</p>
              <h3>Why this is not double-counted</h3>
              <p className="small-copy">A posted credit first increases the account balance. If an invoice number is supplied, the same credit also reduces that invoice’s remaining receivable. The forecast therefore sees the cash once, not twice.</p>
            </article>
          </div>
          <article className="panel table-panel"><div className="panel-head"><div><h2>Posted account transaction ledger</h2><p>Runtime ledger data is stored locally and excluded from Git.</p></div><Badge tone={accountStatus === 'connected' ? 'good' : 'warn'}>{accountStatus}</Badge></div><AccountActivity rows={recentAccountTransactions} matchedTransactionIds={matchedTransactionIds} /></article>
          {ledgerReconciliation.unmatched_credits.length > 0 && <article className="panel"><h2>Credits needing reconciliation</h2><p>These credits increase available cash, but the system has not linked them to an invoice.</p><div className="evidence-grid">{ledgerReconciliation.unmatched_credits.map((credit) => <div className="evidence-item" key={`${credit.transaction_id}-${credit.reason}`}><strong>{credit.transaction_id} · {money(credit.amount)}</strong><p>{credit.payer || 'Unknown payer'} · {credit.reference || 'No bank reference'}</p><small>{credit.reason.replaceAll('_', ' ')}</small></div>)}</div></article>}
        </section>}

        {page === 'invoices' && <section className="page-section">
          <div className="toolbar"><input placeholder="Search invoice or customer" value={filter} onChange={(e) => setFilter(e.target.value)} /><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>All</option><option>Open</option><option>Paid</option><option>Overdue</option><option>Partially paid</option><option>Partially paid / overdue</option></select><span>{filteredInvoices.length} record(s)</span></div>
          <div className="two-column invoice-layout">
            <article className="panel wide-panel table-panel"><h2>Receivables register</h2><p>Collected amounts include posted account credits linked to each invoice.</p><div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Amount</th><th>Collected</th><th>From account feed</th><th>Outstanding</th><th>Status</th><th>Expected cash date</th><th>Uncertainty</th><th></th></tr></thead><tbody>{filteredInvoices.map((invoice) => <tr key={invoice.invoice_number}><td>{invoice.invoice_number}</td><td>{invoice.customer}</td><td>{invoice.due_date}</td><td>{money(invoice.amount)}</td><td>{money(invoice.amount_collected)}</td><td>{money(invoice.ledger_collected_amount || 0)}</td><td>{money(invoice.outstanding)}</td><td><Badge tone={invoice.payment_status.includes('Overdue') ? 'danger' : invoice.payment_status === 'Paid' ? 'good' : 'neutral'}>{invoice.payment_status}</Badge></td><td><strong>{invoice.expected_date}</strong><small className="cell-note">{invoice.predicted_delay_days} day modeled delay · {invoice.confidence}</small></td><td>{invoice.uncertainty_low_date} → {invoice.uncertainty_high_date}</td><td><button className="link-button" onClick={() => beginEdit(invoice)}>Edit base record</button></td></tr>)}</tbody></table></div></article>
            <article className="panel form-panel"><h2>{editingInvoice ? 'Edit invoice' : 'Add invoice'}</h2><form className="stack-form" onSubmit={saveInvoice}><label>Invoice number<input value={invoiceForm.invoice_number} disabled={Boolean(editingInvoice)} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_number: e.target.value })} required /></label><label>Customer<input value={invoiceForm.customer} onChange={(e) => setInvoiceForm({ ...invoiceForm, customer: e.target.value })} required /></label><div className="field-pair"><label>Invoice date<input type="date" value={invoiceForm.invoice_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_date: e.target.value })} /></label><label>Due date<input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} /></label></div><div className="field-pair"><label>Base collected amount<input type="number" min="0" value={invoiceForm.amount_collected} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount_collected: e.target.value })} /></label><label>Invoice amount<input type="number" min="0" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} /></label></div><label>Actual payment date<input type="date" value={invoiceForm.actual_payment_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, actual_payment_date: e.target.value })} /></label><label>Collection certainty<select value={invoiceForm.collection_certainty} onChange={(e) => setInvoiceForm({ ...invoiceForm, collection_certainty: e.target.value })}><option value="confirmed">Confirmed</option><option value="expected">Expected</option><option value="uncertain">Uncertain</option></select></label><button className="primary" type="submit">{editingInvoice ? 'Save changes' : 'Add invoice'}</button>{editingInvoice ? <button type="button" className="secondary" onClick={() => { setEditingInvoice(null); setInvoiceForm(emptyInvoice); }}>Cancel</button> : null}</form></article>
          </div>
          <article className="panel"><h2>Prediction evidence</h2><div className="evidence-grid">{openInvoices.map((invoice) => <div key={invoice.invoice_number} className="evidence-item"><strong>{invoice.invoice_number} · {invoice.customer}</strong><p>{invoice.evidence}</p><small>{invoice.method} · confidence {invoice.confidence}</small></div>)}</div></article>
        </section>}

        {page === 'forecast' && <section className="page-section">
          <div className="toolbar"><span>Forecast window</span>{[7, 14, 30].map((days) => <button key={days} className={horizon === days ? 'seg-active' : 'secondary'} onClick={() => setHorizon(days)}>{days} days</button>)}</div>
          <div className="metric-grid compact"><MetricCard label="Forecast starts from" value={money(trackedCash)} hint={accountStatus === 'connected' ? 'Current tracked account balance' : 'Fallback opening cash'} /><MetricCard label="Account credits already absorbed" value={money(accountSnapshot.total_credits)} hint="Not repeated as future inflows" /><MetricCard label="Future open receivables" value={money(openInvoices.reduce((sum, item) => sum + item.outstanding, 0))} hint="After account-credit reconciliation" /></div>
          <article className="panel"><div className="panel-head"><div><h2>Scenario comparison</h2><p>Conservative, base, and optimistic views use explicit certainty weights. Actual credited cash is not discounted.</p></div></div><LineChart series={scenarioForecasts} reserve={minimumReserve} /></article>
          <article className="panel table-panel"><h2>{horizon}-day daily forecast</h2><div className="table-scroll"><table><thead><tr><th>Date</th><th>Opening</th><th>Confirmed</th><th>Expected</th><th>Uncertain</th><th>Risk-adjusted inflow</th><th>Outflows</th><th>Closing</th><th>Gap vs reserve</th></tr></thead><tbody>{gap.rows.map((row) => <tr key={row.date} className={row.required_liquidity_gap > 0 ? 'risk-row' : ''}><td>{row.date}</td><td>{money(row.opening_cash)}</td><td>{money(row.confirmed_inflows)}</td><td>{money(row.expected_inflows)}</td><td>{money(row.uncertain_inflows)}</td><td>{money(row.risk_adjusted_inflows)}</td><td>{money(row.outflows)}</td><td><strong>{money(row.closing_cash)}</strong></td><td>{money(row.required_liquidity_gap)}</td></tr>)}</tbody></table></div></article>
          <article className="panel formula-panel"><h2>Auditable calculation</h2><p><code>Tracked cash now = base account balance + posted credits − posted debits</code></p><p><code>Projected closing cash = tracked cash now + cumulative future risk-adjusted inflows − cumulative future outflows</code></p><p><code>Required liquidity gap = max(0, minimum operating cash reserve − projected closing cash)</code></p><p>When a bank credit is linked to an invoice, that invoice’s future outstanding amount is reduced by the credited amount before the forecast is rebuilt.</p></article>
        </section>}

        {page === 'warning' && <section className="page-section">
          <div className="metric-grid"><MetricCard label="Current tracked cash" value={money(trackedCash)} hint={accountStatus === 'connected' ? 'From account ledger' : 'Fallback balance'} /><MetricCard label="First projected shortage" value={gap.first_shortage_date || 'None'} hint={`Reserve ${money(minimumReserve)}`} tone={riskTone(gap.status)} /><MetricCard label="Maximum funding gap" value={money(gap.maximum_gap)} tone={riskTone(gap.status)} /><MetricCard label="First gap duration" value={`${gap.gap_duration_days} day(s)`} hint={`${gap.total_gap_days || 0} total gap day(s)`} /><MetricCard label="Expected recovery" value={gap.recovery_date || 'Beyond forecast'} hint="Based on modeled inflows" /></div>
          <article className={`panel risk-banner risk-${riskTone(gap.status)}`}><div><p className="eyebrow">Current early-warning state</p><h2>{gap.severity}</h2></div><p>{gap.status === 'No gap' ? 'Projected cash remains at or above the configured reserve after applying posted account activity.' : `After applying posted account activity, the forecast first breaches the operating reserve on ${gap.first_shortage_date}. The largest modeled gap is ${money(gap.maximum_gap)}.`}</p></article>
          <article className="panel table-panel"><h2>Reserve breach timeline</h2><div className="table-scroll"><table><thead><tr><th>Date</th><th>Closing cash</th><th>Minimum reserve</th><th>Required gap</th><th>Status</th></tr></thead><tbody>{gap.rows.map((row) => <tr key={row.date} className={row.required_liquidity_gap ? 'risk-row' : ''}><td>{row.date}</td><td>{money(row.closing_cash)}</td><td>{money(minimumReserve)}</td><td>{money(row.required_liquidity_gap)}</td><td>{row.required_liquidity_gap ? <Badge tone="danger">Below reserve</Badge> : <Badge tone="good">Covered</Badge>}</td></tr>)}</tbody></table></div></article>
          <article className="panel"><h2>Severity configuration</h2><p>The demo marks a shortage significant when the maximum gap reaches at least 100% of the configured reserve or the first shortage episode lasts at least 5 days. These remain configurable demonstration thresholds, not universal financial rules.</p></article>
        </section>}

        {page === 'financing' && <section className="page-section">
          <div className="metric-grid"><MetricCard label="Funding requirement" value={money(gap.maximum_gap)} hint={gap.first_shortage_date ? `Needed by ${gap.first_shortage_date}` : 'No funding deadline'} /><MetricCard label="Feasible options" value={evaluations.filter((item) => item.feasible).length} hint={`of ${evaluations.length} modeled alternatives`} /><MetricCard label="Options covering full gap" value={evaluations.filter((item) => item.feasible && item.covers_required_amount).length} /></div>
          <article className="panel table-panel"><div className="panel-head"><div><h2>Financing and operational alternatives</h2><p>Required amount is recalculated from the latest tracked bank balance before financing options are compared.</p></div></div><div className="table-scroll"><table><thead><tr><th>Option</th><th>Available</th><th>Net / liquidity improvement</th><th>Estimated cost</th><th>Effective cost</th><th>Funds available</th><th>Deadline</th><th>Covers amount</th><th>Remaining gap</th><th>Feasibility</th></tr></thead><tbody>{evaluations.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small className="cell-note">{item.type.replaceAll('_', ' ')}</small></td><td>{money(item.gross_amount)}</td><td>{money(item.liquidity_improvement)}</td><td>{money(item.estimated_total_cost)}</td><td>{item.effective_cost_pct.toFixed(2)}%</td><td>{item.funds_available_date || 'N/A'}</td><td>{item.meets_deadline ? <Badge tone="good">On time</Badge> : <Badge tone="danger">Too late</Badge>}</td><td>{item.covers_required_amount ? 'Yes' : 'No'}</td><td>{money(item.remaining_gap)}</td><td>{item.feasible ? <Badge tone="good">Feasible</Badge> : <span><Badge tone="danger">Excluded</Badge><small className="cell-note">{item.rejection_reasons.join(' ')}</small></span>}</td></tr>)}</tbody></table></div></article>
          <article className="panel formula-panel"><h2>Pricing approximation</h2><p><code>Interest = principal × annual interest rate × financing days / 365</code></p><p><code>Total estimated cost = interest + processing fees + other disclosed fees</code></p><p><code>Net proceeds = gross proceeds − upfront deductions</code></p><p>Actual lender pricing can use different compounding, fee timing, taxes, minimum charges, or repayment conventions. All offers shown here are hypothetical demo inputs.</p></article>
        </section>}

        {page === 'recommendation' && <section className="page-section">
          <article className="panel decision-hero"><p className="eyebrow">Explainable decision</p><h2>{recommendation.action}</h2><p>The engine starts from posted account balance evidence when the account feed is online. It then forecasts only still-outstanding future collections and upcoming obligations before deciding whether financing is needed.</p><div className="metric-grid compact"><MetricCard label="Tracked cash now" value={money(trackedCash)} /><MetricCard label="Amount required" value={money(recommendation.amount_required)} /><MetricCard label="Funding needed" value={recommendation.funding_needed_date || 'Not required'} /><MetricCard label="Shortage duration" value={`${recommendation.expected_duration_days || 0} day(s)`} /><MetricCard label="Estimated cost" value={money(recommendation.estimated_cost)} /><MetricCard label="Remaining gap" value={money(recommendation.remaining_gap)} tone={recommendation.remaining_gap > 0 ? 'danger' : 'good'} /></div></article>
          <div className="two-column"><article className="panel"><h2>Why this action was selected</h2><ol className="reason-list"><li>{accountStatus === 'connected' ? `Current available cash is taken from the tracked account ledger: ${money(trackedCash)}.` : `Account feed is offline, so the fallback opening cash of ${money(trackedCash)} is used.`}</li>{recommendation.rationale.map((reason) => <li key={reason}>{reason}</li>)}</ol><h3>Main assumptions</h3><ul className="plain-list"><li>Posted account transactions are treated as actual cash and are not risk-discounted.</li><li>Invoice credits are reconciled before future invoice cash is forecast, preventing duplicate recognition.</li><li>The selected {scenario.toLowerCase()} scenario discounts only future uncertain cash, not already credited cash.</li><li>Financing terms remain hypothetical and must be replaced with actual disclosed terms before use.</li></ul></article><article className="panel"><h2>Rejected or lower-priority alternatives</h2><ul className="plain-list rejected-list">{recommendation.rejected.map((reason) => <li key={reason}>{reason}</li>)}</ul><h3>Residual risk</h3><p>{recommendation.residual_risk}</p><h3>Recommended next action</h3><p>{recommendation.next_action}</p></article></div>
          <article className="panel disclaimer"><strong>Decision-support disclaimer</strong><p>This prototype can ingest account events but does not independently verify a bank, customer identity, lender approval, supplier agreement, or future collection. Production use requires an authorised banking-data provider, authentication, secure webhook verification, encryption, and consent controls.</p></article>
        </section>}

        {page === 'data' && <section className="page-section">
          <div className="two-column settings-grid"><article className="panel"><h2>Forecast assumptions</h2><div className="stack-form"><label>Fallback opening cash<input type="number" value={openingCash} onChange={(e) => setOpeningCash(num(e.target.value))} /><small>Used only while the account feed is offline.</small></label><label>Minimum operating cash reserve<input type="number" min="0" value={minimumReserve} onChange={(e) => setMinimumReserve(Math.max(0, num(e.target.value)))} /></label><label>Fallback invoice delay in days<input type="number" min="0" value={fallbackDelayDays} onChange={(e) => setFallbackDelayDays(Math.max(0, num(e.target.value)))} /></label><div className="button-row"><button className="primary" onClick={() => resetDemo('gap')}>Load funding-gap demo</button><button className="secondary" onClick={() => resetDemo('healthy')}>Load no-borrowing demo</button></div></div></article><article className="panel"><h2>Invoice CSV import</h2><p>Required columns: invoice_number, customer, invoice_date, due_date, amount, amount_collected. Optional: actual_payment_date, collection_certainty.</p><label className="upload-box"><input type="file" accept=".csv,text/csv" onChange={(e) => importCsv(e.target.files?.[0])} /><strong>Select CSV file</strong><span>Validation blocks invalid dates, amounts, missing columns, and duplicates.</span></label>{importMessages.length ? <div className="message-box">{importMessages.map((message) => <p key={message}>{message}</p>)}</div> : null}</article></div>
          <div className="two-column settings-grid"><article className="panel"><h2>Add future cash event</h2><p>Use this only for expected or committed future events. Already-posted bank transactions belong in the Live Account Feed.</p><form className="stack-form" onSubmit={addTransaction}><div className="field-pair"><label>Date<input type="date" value={transactionForm.date} onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })} /></label><label>Amount<input type="number" min="0" value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} /></label></div><div className="field-pair"><label>Direction<select value={transactionForm.direction} onChange={(e) => setTransactionForm({ ...transactionForm, direction: e.target.value })}><option value="outflow">Outflow</option><option value="inflow">Inflow</option></select></label><label>Certainty<select value={transactionForm.certainty} onChange={(e) => setTransactionForm({ ...transactionForm, certainty: e.target.value })}><option value="confirmed">Confirmed</option><option value="expected">Expected</option><option value="uncertain">Uncertain</option></select></label></div><label>Category<input value={transactionForm.category} onChange={(e) => setTransactionForm({ ...transactionForm, category: e.target.value })} /></label><label>Label<input value={transactionForm.label} onChange={(e) => setTransactionForm({ ...transactionForm, label: e.target.value })} /></label><button className="primary">Add future cash event</button></form></article><article className="panel table-panel"><h2>Current future cash events</h2><div className="table-scroll compact-table"><table><thead><tr><th>Date</th><th>Event</th><th>Direction</th><th>Amount</th></tr></thead><tbody>{transactions.map((tx) => <tr key={tx.id}><td>{tx.date}</td><td>{tx.label}</td><td>{tx.direction}</td><td>{money(tx.amount)}</td></tr>)}</tbody></table></div></article></div>
          <article className="panel table-panel"><h2>Hypothetical financing assumptions</h2><p>Edit inputs to see the feasibility and recommendation update immediately.</p><div className="table-scroll"><table><thead><tr><th>Option</th><th>Eligible</th><th>Max / reschedulable amount</th><th>Rate %</th><th>Processing fee</th><th>Approval days</th><th>Supplier consent</th></tr></thead><tbody>{financingOptions.filter((option) => option.type !== 'no_financing').map((option) => <tr key={option.id}><td>{option.name}</td><td><input type="checkbox" checked={option.eligible !== false} onChange={(e) => updateFinance(option.id, 'eligible', e.target.checked)} /></td><td><input className="table-input" type="number" value={option.type === 'supplier_reschedule' ? option.reschedulable_amount : option.max_available_amount} onChange={(e) => updateFinance(option.id, option.type === 'supplier_reschedule' ? 'reschedulable_amount' : 'max_available_amount', e.target.value)} /></td><td><input className="table-input" type="number" value={option.annual_rate_pct || option.financing_fee_pct || 0} onChange={(e) => updateFinance(option.id, option.type === 'invoice_financing' ? 'financing_fee_pct' : 'annual_rate_pct', e.target.value)} /></td><td><input className="table-input" type="number" value={option.processing_fee || 0} onChange={(e) => updateFinance(option.id, 'processing_fee', e.target.value)} /></td><td><input className="table-input" type="number" value={option.approval_days || 0} onChange={(e) => updateFinance(option.id, 'approval_days', e.target.value)} /></td><td>{option.type === 'supplier_reschedule' ? <input type="checkbox" checked={option.contract_permitted === true} onChange={(e) => updateFinance(option.id, 'contract_permitted', e.target.checked)} /> : 'N/A'}</td></tr>)}</tbody></table></div></article>
        </section>}
      </main>
    </div>
  );
}

function AccountActivity({ rows, matchedTransactionIds }) {
  if (!rows.length) return <div className="empty-state">No posted account events yet.</div>;
  return <div className="table-scroll"><table><thead><tr><th>Posted</th><th>Transaction</th><th>Direction</th><th>Amount</th><th>Counterparty</th><th>Invoice</th><th>Reference</th><th>Reconciliation</th></tr></thead><tbody>{rows.map((item) => <tr key={item.transaction_id}><td>{item.posted_at ? new Date(item.posted_at).toLocaleString() : item.date}</td><td><strong>{item.transaction_id}</strong><small className="cell-note">{item.source || 'bank feed'}</small></td><td><Badge tone={item.direction === 'credit' ? 'good' : 'warn'}>{item.direction}</Badge></td><td>{money(item.amount)}</td><td>{item.payer || item.payee || '—'}</td><td>{item.invoice_number || '—'}</td><td>{item.reference || '—'}</td><td>{item.direction === 'credit' ? (matchedTransactionIds.has(item.transaction_id) ? <Badge tone="good">Invoice matched</Badge> : <Badge tone="warn">Unmatched</Badge>) : <span>Balance only</span>}</td></tr>)}</tbody></table></div>;
}

function EventTable({ rows }) {
  if (!rows.length) return <div className="empty-state">No events in the selected period.</div>;
  return <div className="table-scroll"><table><thead><tr><th>Date</th><th>Event</th><th>Category</th><th>Certainty</th><th>Direction</th><th>Amount</th></tr></thead><tbody>{rows.map((event) => <tr key={`${event.date}-${event.id}`}><td>{event.date}</td><td>{event.label}</td><td>{event.category}</td><td>{event.certainty}</td><td>{event.direction}</td><td>{money(event.amount)}</td></tr>)}</tbody></table></div>;
}
