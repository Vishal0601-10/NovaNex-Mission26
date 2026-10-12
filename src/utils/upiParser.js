const UPI_ID_PATTERN = /^[A-Za-z0-9._-]{2,}@[A-Za-z0-9.-]{2,}$/;

function decodePlus(value) {
  return value?.replace(/\+/g, ' ') ?? '';
}

export function parseUpiUri(input) {
  const raw = String(input ?? '').trim();
  const baseResult = {
    raw,
    valid: false,
    supported: false,
    errors: [],
    warnings: [],
    fields: {
      payeeAddress: '',
      payeeName: '',
      amount: null,
      currency: '',
      note: '',
    },
  };

  if (!raw) {
    return { ...baseResult, errors: ['Enter a test UPI payment URI before assessing it.'] };
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ...baseResult, errors: ['The payment URI is malformed and could not be parsed.'] };
  }

  const isUpi = url.protocol.toLowerCase() === 'upi:';
  const isPay = url.hostname.toLowerCase() === 'pay';

  if (!isUpi || !isPay) {
    return {
      ...baseResult,
      errors: ['Only UPI payment-intent URIs in the form upi://pay?... are supported by this prototype.'],
    };
  }

  const payeeAddress = decodePlus(url.searchParams.get('pa') ?? '').trim();
  const payeeName = decodePlus(url.searchParams.get('pn') ?? '').trim();
  const amountText = (url.searchParams.get('am') ?? '').trim();
  const currency = (url.searchParams.get('cu') ?? '').trim().toUpperCase();
  const note = decodePlus(url.searchParams.get('tn') ?? '').trim();

  const errors = [];
  const warnings = [];
  let amount = null;

  if (payeeAddress && !UPI_ID_PATTERN.test(payeeAddress)) {
    errors.push('The payee address (pa) is not in a supported UPI ID format such as name@provider.');
  }

  if (amountText) {
    const parsedAmount = Number(amountText);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      errors.push('The amount (am) must be a positive number when supplied.');
    } else {
      amount = parsedAmount;
    }
  }

  if (currency && currency !== 'INR') {
    warnings.push(`Currency ${currency} is outside this INR-focused demo and is not converted.`);
  }

  if (!payeeAddress) warnings.push('Payee address (pa) is missing.');
  if (!payeeName) warnings.push('Payee name (pn) is unavailable.');
  if (amount === null) warnings.push('Amount (am) is unavailable.');

  return {
    raw,
    valid: errors.length === 0,
    supported: true,
    errors,
    warnings,
    fields: {
      payeeAddress,
      payeeName,
      amount,
      currency: currency || 'INR',
      note,
    },
  };
}
