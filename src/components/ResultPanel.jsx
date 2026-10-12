import StatusIcon from './StatusIcon.jsx';

const outcomeClass = {
  no_mismatch: 'result-neutral',
  verify: 'result-warning',
  intent_mismatch: 'result-danger',
  unable: 'result-muted',
};

export default function ResultPanel({ result, parsed, onCopy, copied }) {
  if (!result) {
    return (
      <section className="result-empty" aria-live="polite">
        <div className="empty-shield" aria-hidden="true">✓</div>
        <h3>Assessment results appear here</h3>
        <p>Choose a scenario or enter your intended outcome and a test UPI URI, then select “Assess payment”.</p>
      </section>
    );
  }

  return (
    <section className={`result-panel ${outcomeClass[result.outcome]}`} aria-live="polite">
      <div className="result-heading">
        <div>
          <span className="eyebrow">Assessment</span>
          <h2>{result.title}</h2>
          <p>{result.summary}</p>
        </div>
        <span className="outcome-pill">{result.outcome.replaceAll('_', ' ')}</span>
      </div>

      <div className="recommendation">
        <span className="recommendation-label">Recommended action</span>
        <p>{result.recommendedAction}</p>
      </div>

      <div className="check-list">
        {result.checks.map((item) => (
          <article className="check-row" key={item.id}>
            <StatusIcon status={item.status} />
            <div>
              <div className="check-title-row">
                <h4>{item.label}</h4>
                <span className={`severity severity-${item.severity}`}>{item.status.replace('_', ' ')}</span>
              </div>
              <p>{item.reason}</p>
            </div>
          </article>
        ))}
      </div>

      {parsed?.supported && (
        <div className="parsed-grid">
          <div><span>Payee name</span><strong>{parsed.fields.payeeName || 'Unavailable'}</strong></div>
          <div><span>UPI ID</span><strong>{parsed.fields.payeeAddress || 'Unavailable'}</strong></div>
          <div><span>Amount</span><strong>{parsed.fields.amount === null ? 'Unavailable' : `₹${parsed.fields.amount.toFixed(2)}`}</strong></div>
        </div>
      )}

      <details className="limitations">
        <summary>Assessment limits</summary>
        <ul>
          {result.limitations.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </details>

      <button className="button button-secondary copy-button" type="button" onClick={onCopy}>
        {copied ? 'Copied' : 'Copy explanation'}
      </button>
    </section>
  );
}
