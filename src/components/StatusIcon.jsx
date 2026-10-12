export default function StatusIcon({ status }) {
  const glyph = status === 'pass' ? '✓' : status === 'fail' ? '!' : status === 'unknown' ? '?' : '•';
  return <span className={`status-icon status-${status}`} aria-hidden="true">{glyph}</span>;
}
