const RECEIVE_INTENTS = new Set(['receive_refund', 'receive_money']);

export const OUTCOMES = {
  NO_MISMATCH: 'no_mismatch',
  VERIFY: 'verify',
  INTENT_MISMATCH: 'intent_mismatch',
  UNABLE: 'unable',
};

function canonicalText(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9@]/g, '');
}

function expectedRecipientMatches(expectedRecipient, parsed) {
  const expected = String(expectedRecipient ?? '').trim();
  if (!expected) return { assessable: false, matches: null, reason: 'No expected recipient was provided.' };

  const { payeeAddress, payeeName } = parsed.fields;
  const expectedCanonical = canonicalText(expected);

  if (expected.includes('@')) {
    if (!payeeAddress) {
      return { assessable: false, matches: null, reason: 'The QR does not provide a payee address to compare.' };
    }
    return {
      assessable: true,
      matches: canonicalText(payeeAddress) === expectedCanonical,
      reason: `Expected UPI ID “${expected}”; QR contains “${payeeAddress}”.`,
    };
  }

  if (payeeName) {
    return {
      assessable: true,
      matches: canonicalText(payeeName) === expectedCanonical,
      reason: `Expected recipient “${expected}”; QR displays “${payeeName}”.`,
    };
  }

  return {
    assessable: false,
    matches: null,
    reason: 'A recipient name was expected, but the QR does not provide a payee name to compare.',
  };
}

function expectedAmountCheck(expectedAmount, parsed) {
  const expectedText = String(expectedAmount ?? '').trim();
  if (!expectedText) return { assessable: false, matches: null, reason: 'No expected amount was provided.' };

  const expected = Number(expectedText);
  if (!Number.isFinite(expected) || expected <= 0) {
    return { assessable: false, matches: null, invalidExpected: true, reason: 'Expected amount must be a positive number.' };
  }

  if (parsed.fields.amount === null) {
    return { assessable: false, matches: null, reason: `Expected ₹${expected.toFixed(2)}, but the QR does not provide an amount.` };
  }

  const matches = Math.abs(parsed.fields.amount - expected) < 0.005;
  return {
    assessable: true,
    matches,
    reason: `Expected ₹${expected.toFixed(2)}; QR requests ₹${parsed.fields.amount.toFixed(2)}.`,
  };
}

function check(id, label, status, severity, reason) {
  return { id, label, status, severity, reason };
}

export function assessIntentConsistency(intent, parsed) {
  const limitations = [
    'This prototype compares only the intent you entered with fields available in the test UPI URI.',
    'A displayed payee name or UPI ID is not proof of account ownership, identity, legitimacy, or delivery of goods or services.',
    'A result with no detected mismatch is not proof that a payment is safe.',
    'PayGuard does not connect to NPCI, a bank, or a payment service provider and cannot execute, block, reverse, or recover a payment.',
  ];

  if (!parsed?.supported || !parsed?.valid) {
    const reasons = parsed?.errors?.length ? parsed.errors : ['The payment input cannot be assessed.'];
    return {
      outcome: OUTCOMES.UNABLE,
      title: 'Unable to assess this payment request',
      summary: reasons[0],
      checks: [check('input', 'Input validity', 'fail', 'critical', reasons.join(' '))],
      inconsistencies: [],
      missingInformation: [],
      recommendedAction: 'Do not use this prototype result to authorise a payment. Correct the test URI or choose a built-in scenario, then assess again.',
      limitations,
    };
  }

  const checks = [];
  const inconsistencies = [];
  const missingInformation = [];

  checks.push(check('input', 'Input validity', 'pass', 'info', 'The text is a supported UPI payment-intent URI and its supplied fields are syntactically valid for this prototype.'));

  const receivingIntent = RECEIVE_INTENTS.has(intent.type);
  if (receivingIntent) {
    const reason = 'You stated that money should come to you, but upi://pay represents a payment request that would send money from the payer after authorisation.';
    checks.push(check('direction', 'Payment direction', 'fail', 'critical', reason));
    inconsistencies.push(reason);
  } else {
    checks.push(check('direction', 'Payment direction', 'pass', 'info', 'Your stated intent is to make a payment, which is directionally consistent with a UPI pay request.'));
  }

  const recipient = expectedRecipientMatches(intent.expectedRecipient, parsed);
  if (intent.expectedRecipient) {
    if (!recipient.assessable) {
      checks.push(check('recipient', 'Recipient consistency', 'unknown', 'warning', recipient.reason));
      missingInformation.push(recipient.reason);
    } else if (recipient.matches) {
      checks.push(check('recipient', 'Recipient consistency', 'pass', 'info', recipient.reason));
    } else {
      checks.push(check('recipient', 'Recipient consistency', 'fail', 'warning', recipient.reason));
      inconsistencies.push(recipient.reason);
    }
  } else {
    checks.push(check('recipient', 'Recipient consistency', 'not_checked', 'info', 'No expected recipient was supplied, so recipient consistency was not checked.'));
  }

  const amount = expectedAmountCheck(intent.expectedAmount, parsed);
  if (amount.invalidExpected) {
    checks.push(check('amount', 'Amount consistency', 'fail', 'warning', amount.reason));
    inconsistencies.push(amount.reason);
  } else if (intent.expectedAmount) {
    if (!amount.assessable) {
      checks.push(check('amount', 'Amount consistency', 'unknown', 'warning', amount.reason));
      missingInformation.push(amount.reason);
    } else if (amount.matches) {
      checks.push(check('amount', 'Amount consistency', 'pass', 'info', amount.reason));
    } else {
      checks.push(check('amount', 'Amount consistency', 'fail', 'warning', amount.reason));
      inconsistencies.push(amount.reason);
    }
  } else {
    checks.push(check('amount', 'Amount consistency', 'not_checked', 'info', 'No expected amount was supplied, so amount consistency was not checked.'));
  }

  const completenessNotes = [];
  if (!parsed.fields.payeeAddress) {
    completenessNotes.push('payee address');
    missingInformation.push('The QR does not provide a payee address (pa), which is essential to identify the requested recipient in this prototype.');
  }
  if (!parsed.fields.payeeName) completenessNotes.push('payee name');
  if (parsed.fields.amount === null) completenessNotes.push('amount');

  if (completenessNotes.length) {
    const reason = `Unavailable QR fields: ${completenessNotes.join(', ')}.`;
    checks.push(check('completeness', 'Information completeness', 'unknown', 'warning', reason));
  } else {
    checks.push(check('completeness', 'Information completeness', 'pass', 'info', 'Payee address, payee name, and amount are available in this test URI.'));
  }

  const hasDirectionMismatch = checks.some((item) => item.id === 'direction' && item.status === 'fail');
  const hasMissingEssential = missingInformation.length > 0;
  const hasOtherMismatch = checks.some((item) => ['recipient', 'amount'].includes(item.id) && item.status === 'fail');

  let outcome;
  let title;
  let summary;
  let recommendedAction;

  if (hasDirectionMismatch) {
    outcome = OUTCOMES.INTENT_MISMATCH;
    title = 'Intent mismatch detected';
    summary = 'Your expected transaction outcome conflicts with the direction of the UPI payment request.';
    recommendedAction = 'Do not authorise this payment as a way to receive money. Independently contact the person or organisation using a trusted channel and verify the correct refund or receiving process.';
  } else if (hasMissingEssential) {
    outcome = OUTCOMES.UNABLE;
    title = 'Unable to assess essential details';
    summary = 'The available payment information is insufficient for one or more checks you asked PayGuard to perform.';
    recommendedAction = 'Do not rely on the incomplete request. Obtain complete payment details and independently verify the recipient and amount before authorisation.';
  } else if (hasOtherMismatch) {
    outcome = OUTCOMES.VERIFY;
    title = 'Verify recipient or amount';
    summary = 'At least one payment detail does not match what you said you intended.';
    recommendedAction = 'Pause before authorisation. Verify the recipient and amount through an independent trusted source, then use a corrected payment request if necessary.';
  } else {
    outcome = OUTCOMES.NO_MISMATCH;
    title = 'No mismatch detected in available information';
    summary = 'The fields PayGuard could compare are consistent with your stated intent.';
    recommendedAction = 'Continue only after your normal payment review. Matching test details do not prove that the recipient or transaction is legitimate.';
  }

  return {
    outcome,
    title,
    summary,
    checks,
    inconsistencies,
    missingInformation,
    recommendedAction,
    limitations,
  };
}
