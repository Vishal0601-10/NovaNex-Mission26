export default function BrandMark({ compact = false }) {
  return (
    <div className="brand" aria-label="PayGuard">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 28 32" role="img">
          <path d="M14 1.8 25 6v8.5c0 7.2-4.6 13.4-11 15.7C7.6 27.9 3 21.7 3 14.5V6l11-4.2Z" fill="currentColor" opacity=".16" />
          <path d="M14 3.8 23 7.2v7.3c0 5.9-3.7 11.1-9 13.3-5.3-2.2-9-7.4-9-13.3V7.2l9-3.4Z" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m9.4 15 3 3 6.2-6.5" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>PayGuard</strong>
          <small>Intent-aware payment protection</small>
        </span>
      )}
    </div>
  );
}
