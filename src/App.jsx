import { useEffect, useMemo, useRef, useState } from 'react';
import BrandMark from './components/BrandMark.jsx';
import ResultPanel from './components/ResultPanel.jsx';
import { scenarios } from './data/scenarios.js';
import { assessIntentConsistency } from './utils/intentEngine.js';
import { parseUpiUri } from './utils/upiParser.js';

const EMPTY_INTENT = {
  type: 'pay_merchant',
  expectedRecipient: '',
  expectedAmount: '',
  description: '',
};

const INTENT_OPTIONS = [
  ['receive_refund', 'Receive a refund or cashback'],
  ['receive_money', 'Receive money from another person'],
  ['pay_merchant', 'Pay a known merchant'],
  ['pay_person', 'Pay a specified person'],
  ['pay_amount', 'Make a payment of an expected amount'],
];

const HISTORY_KEY = 'payguard.assessments.v1';

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function resultToText(result, parsed, intent) {
  const checks = result.checks.map((item) => `${item.label}: ${item.status}. ${item.reason}`).join('\n');
  return [
    `PayGuard assessment: ${result.title}`,
    result.summary,
    `Recommended action: ${result.recommendedAction}`,
    `Intent: ${intent.type}`,
    parsed?.supported ? `Parsed recipient: ${parsed.fields.payeeName || 'Unavailable'} (${parsed.fields.payeeAddress || 'Unavailable'}), amount: ${parsed.fields.amount === null ? 'Unavailable' : `₹${parsed.fields.amount.toFixed(2)}`}` : '',
    checks,
    'Prototype limitation: No detected mismatch is not proof that a payment is safe.',
  ].filter(Boolean).join('\n\n');
}

export default function App() {
  const assessmentRef = useRef(null);
  const [intent, setIntent] = useState(EMPTY_INTENT);
  const [uri, setUri] = useState('');
  const [parsed, setParsed] = useState(null);
  const [result, setResult] = useState(null);
  const [activeScenario, setActiveScenario] = useState('');
  const [history, setHistory] = useState([]);
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      if (Array.isArray(stored)) setHistory(stored.slice(0, 8));
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  const selectedIntentLabel = useMemo(
    () => INTENT_OPTIONS.find(([value]) => value === intent.type)?.[1] ?? intent.type,
    [intent.type],
  );

  function updateIntent(field, value) {
    setIntent((current) => ({ ...current, [field]: value }));
    setActiveScenario('');
    setFormError('');
  }

  function runAssessment(nextIntent = intent, nextUri = uri, scenarioId = '') {
    setFormError('');
    const parsedPayment = parseUpiUri(nextUri);
    const assessment = assessIntentConsistency(nextIntent, parsedPayment);
    setParsed(parsedPayment);
    setResult(assessment);
    setActiveScenario(scenarioId);
    setCopied(false);

    const historyItem = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      timestamp: new Date().toISOString(),
      outcome: assessment.outcome,
      title: assessment.title,
      intentType: nextIntent.type,
      recipient: parsedPayment.fields.payeeName || parsedPayment.fields.payeeAddress || 'Unavailable',
      amount: parsedPayment.fields.amount,
      scenarioId,
    };

    setHistory((current) => {
      const next = [historyItem, ...current].slice(0, 8);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function handleAssess(event) {
    event.preventDefault();
    if (!uri.trim()) {
      setFormError('Enter a test UPI URI or load a built-in scenario.');
      return;
    }
    runAssessment();
  }

  function loadScenario(scenario) {
    const nextIntent = { ...scenario.intent };
    setIntent(nextIntent);
    setUri(scenario.uri);
    runAssessment(nextIntent, scenario.uri, scenario.id);
    requestAnimationFrame(() => assessmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function resetForm() {
    setIntent(EMPTY_INTENT);
    setUri('');
    setParsed(null);
    setResult(null);
    setActiveScenario('');
    setFormError('');
    setCopied(false);
  }

  async function copyExplanation() {
    if (!result) return;
    const text = resultToText(result, parsed, intent);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  }

  function startDemo() {
    assessmentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand-link" href="#top" aria-label="PayGuard home"><BrandMark /></a>
        <nav aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">Limits</a>
          <button className="button button-small" type="button" onClick={startDemo}>Start check</button>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="prototype-badge"><span /> Hackathon prototype · simulated UPI data</div>
            <h1>Check what a payment <span>does</span> against what you meant to do.</h1>
            <p className="hero-lede">PayGuard captures your intended transaction outcome, then compares it with a test UPI payment request before authorisation.</p>
            <div className="hero-actions">
              <button className="button button-primary" type="button" onClick={startDemo}>Start payment safety check</button>
              <button className="button button-secondary" type="button" onClick={() => loadScenario(scenarios[0])}>Run refund deception demo</button>
            </div>
            <p className="hero-disclaimer">Decision support only. PayGuard does not verify accounts, execute payments, or declare transactions fraudulent.</p>
          </div>
          <div className="hero-visual" aria-label="Illustration of intent compared with payment request">
            <div className="visual-label">Intent consistency check</div>
            <div className="visual-card intent-card">
              <span className="card-kicker">What you believe</span>
              <strong>Receive ₹4,999 refund</strong>
              <small>Money should come to you</small>
            </div>
            <div className="compare-line"><span>≠</span></div>
            <div className="visual-card request-card">
              <span className="card-kicker">What QR requests</span>
              <strong>Pay ₹4,999</strong>
              <small>Outbound UPI payment</small>
            </div>
            <div className="visual-alert"><span>!</span><div><strong>Semantic contradiction</strong><small>Direction does not match intent</small></div></div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Product principles">
          <div><strong>Explicit rules</strong><span>No black-box risk probability</span></div>
          <div><strong>Explainable findings</strong><span>Every warning states the mismatch</span></div>
          <div><strong>Local demo history</strong><span>No bank credentials or API keys</span></div>
          <div><strong>Safe by design</strong><span>Test URIs are parsed, never opened</span></div>
        </section>

        <section className="workspace section" ref={assessmentRef}>
          <div className="section-heading">
            <span className="eyebrow">Interactive prototype</span>
            <h2>Assess intent consistency</h2>
            <p>Use a built-in scenario for a fast demo, or enter your own simulated UPI payment intent.</p>
          </div>

          <div className="scenario-row" aria-label="Built-in demonstration scenarios">
            {scenarios.map((scenario, index) => (
              <button
                type="button"
                className={`scenario-card ${activeScenario === scenario.id ? 'scenario-active' : ''}`}
                key={scenario.id}
                onClick={() => loadScenario(scenario)}
              >
                <span className="scenario-number">0{index + 1}</span>
                <strong>{scenario.name}</strong>
                <small>{scenario.short}</small>
              </button>
            ))}
          </div>

          <div className="assessment-grid">
            <form className="input-panel" onSubmit={handleAssess}>
              <div className="panel-heading">
                <div><span className="eyebrow">Step 1</span><h3>State your intent</h3></div>
                <button type="button" className="text-button" onClick={resetForm}>Reset</button>
              </div>

              <fieldset className="intent-options">
                <legend>What are you trying to do?</legend>
                {INTENT_OPTIONS.map(([value, label]) => (
                  <label className={`intent-option ${intent.type === value ? 'intent-selected' : ''}`} key={value}>
                    <input type="radio" name="intent" value={value} checked={intent.type === value} onChange={(event) => updateIntent('type', event.target.value)} />
                    <span className="radio-dot" />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <div className="field-row">
                <label>
                  <span>Expected recipient <small>when relevant</small></span>
                  <input type="text" value={intent.expectedRecipient} onChange={(event) => updateIntent('expectedRecipient', event.target.value)} placeholder="e.g. Asha Stores or asha@upi" autoComplete="off" />
                </label>
                <label>
                  <span>Expected amount <small>₹</small></span>
                  <input type="number" min="0.01" step="0.01" value={intent.expectedAmount} onChange={(event) => updateIntent('expectedAmount', event.target.value)} placeholder="e.g. 850" />
                </label>
              </div>

              <label>
                <span>Intent note <small>optional</small></span>
                <input type="text" value={intent.description} onChange={(event) => updateIntent('description', event.target.value)} placeholder="What did the person or merchant tell you?" />
              </label>

              <div className="direction-note">
                <span aria-hidden="true">↕</span>
                <div><strong>Current intent: {selectedIntentLabel}</strong><small>{intent.type.startsWith('receive_') ? 'You expect money to come to you.' : 'You expect to authorise an outbound payment.'}</small></div>
              </div>

              <div className="panel-divider" />

              <div className="panel-heading compact-heading"><div><span className="eyebrow">Step 2</span><h3>Provide test QR payment data</h3></div></div>
              <label>
                <span>UPI payment URI</span>
                <textarea rows="5" value={uri} onChange={(event) => { setUri(event.target.value); setActiveScenario(''); setFormError(''); }} placeholder="upi://pay?pa=merchant@upi&pn=Merchant%20Name&am=850&cu=INR" spellCheck="false" />
              </label>
              <p className="field-help">Supported fields: <code>pa</code> payee address, <code>pn</code> payee name, <code>am</code> amount, <code>cu</code> currency, <code>tn</code> note. The URI is parsed locally and is never opened.</p>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button className="button button-primary button-wide" type="submit">Assess payment</button>
            </form>

            <ResultPanel result={result} parsed={parsed} onCopy={copyExplanation} copied={copied} />
          </div>
        </section>

        <section id="how-it-works" className="section how-section">
          <div className="section-heading narrow">
            <span className="eyebrow">How it works</span>
            <h2>A small deterministic engine, not a fraud oracle</h2>
            <p>PayGuard evaluates consistency between a declared intent and the fields available in a UPI payment request.</p>
          </div>
          <div className="workflow">
            <div className="workflow-step"><span>1</span><strong>Intent contract</strong><p>Record whether the user expects to pay or receive, plus an expected recipient and amount where relevant.</p></div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step"><span>2</span><strong>Safe parsing</strong><p>Parse a test <code>upi://pay</code> URI without opening it or contacting payment infrastructure.</p></div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step"><span>3</span><strong>Consistency rules</strong><p>Compare payment direction, recipient, amount, input validity, and information completeness.</p></div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step"><span>4</span><strong>Explainable action</strong><p>Return a named outcome, evidence for each check, and a proportionate verification recommendation.</p></div>
          </div>
        </section>

        <section className="section history-section">
          <div className="history-heading">
            <div><span className="eyebrow">Local demo record</span><h2>Recent assessments</h2></div>
            {history.length > 0 && <button type="button" className="text-button" onClick={clearHistory}>Clear history</button>}
          </div>
          {history.length === 0 ? (
            <div className="history-empty">No assessments yet. Run any built-in scenario to populate this local browser history.</div>
          ) : (
            <div className="history-table-wrap">
              <table>
                <thead><tr><th>Time</th><th>Outcome</th><th>Recipient</th><th>Amount</th></tr></thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td>{formatTime(item.timestamp)}</td>
                      <td><span className={`history-outcome history-${item.outcome}`}>{item.title}</span></td>
                      <td>{item.recipient}</td>
                      <td>{item.amount === null ? 'Unavailable' : `₹${Number(item.amount).toFixed(2)}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="privacy" className="section limits-section">
          <div className="limits-card">
            <div><span className="eyebrow">Privacy & limitations</span><h2>What PayGuard does not claim</h2></div>
            <div className="limits-grid">
              <p><strong>No real payment access.</strong> The prototype uses simulated/test data only and does not connect to NPCI, banks, PSPs, or real accounts.</p>
              <p><strong>No identity verification.</strong> Names and UPI IDs are compared as supplied text. They are not independently authenticated.</p>
              <p><strong>No “safe” certification.</strong> A matching result means only that modeled inconsistencies were not detected in available fields.</p>
              <p><strong>No sensitive storage.</strong> The app asks for no UPI PIN, OTP, bank credential, API key, or account balance. Demo history stays in browser storage.</p>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <BrandMark />
        <p>PayGuard · Finance hackathon prototype · Intent-aware protection for UPI QR payments</p>
      </footer>
    </div>
  );
}
