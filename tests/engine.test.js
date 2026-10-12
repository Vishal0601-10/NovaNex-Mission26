import test from 'node:test';
import assert from 'node:assert/strict';
import { scenarios } from '../src/data/scenarios.js';
import { assessIntentConsistency, OUTCOMES } from '../src/utils/intentEngine.js';
import { parseUpiUri } from '../src/utils/upiParser.js';

for (const scenario of scenarios) {
  test(`scenario: ${scenario.name}`, () => {
    const parsed = parseUpiUri(scenario.uri);
    const result = assessIntentConsistency(scenario.intent, parsed);
    assert.equal(result.outcome, scenario.expectedOutcome);
  });
}

test('refund deception explicitly detects direction mismatch', () => {
  const scenario = scenarios[0];
  const result = assessIntentConsistency(scenario.intent, parseUpiUri(scenario.uri));
  const direction = result.checks.find((item) => item.id === 'direction');
  assert.equal(direction.status, 'fail');
  assert.match(direction.reason, /money should come to you/i);
});

test('recipient mismatch is detected', () => {
  const scenario = scenarios.find((item) => item.id === 'wrong-recipient');
  const result = assessIntentConsistency(scenario.intent, parseUpiUri(scenario.uri));
  assert.equal(result.checks.find((item) => item.id === 'recipient').status, 'fail');
});

test('amount mismatch is detected', () => {
  const scenario = scenarios.find((item) => item.id === 'amount-mismatch');
  const result = assessIntentConsistency(scenario.intent, parseUpiUri(scenario.uri));
  assert.equal(result.checks.find((item) => item.id === 'amount').status, 'fail');
});

test('malformed URI never crashes and is unable to assess', () => {
  const parsed = parseUpiUri('this is not a payment URI');
  const result = assessIntentConsistency({ type: 'pay_merchant', expectedRecipient: '', expectedAmount: '' }, parsed);
  assert.equal(result.outcome, OUTCOMES.UNABLE);
  assert.equal(parsed.valid, false);
});

test('unsupported URL scheme is rejected', () => {
  const parsed = parseUpiUri('https://example.com/?pa=merchant@upi');
  assert.equal(parsed.supported, false);
  assert.match(parsed.errors[0], /only UPI payment-intent URIs/i);
});

test('matching details do not claim the payment is safe', () => {
  const scenario = scenarios.find((item) => item.id === 'correct-payment');
  const result = assessIntentConsistency(scenario.intent, parseUpiUri(scenario.uri));
  assert.equal(result.outcome, OUTCOMES.NO_MISMATCH);
  assert.match(result.recommendedAction, /do not prove/i);
});

test('invalid expected amount is not silently accepted', () => {
  const parsed = parseUpiUri('upi://pay?pa=testmerchant@upi&pn=Test%20Merchant&am=10&cu=INR');
  const result = assessIntentConsistency({ type: 'pay_amount', expectedRecipient: 'Test Merchant', expectedAmount: '-10' }, parsed);
  assert.equal(result.outcome, OUTCOMES.VERIFY);
  assert.equal(result.checks.find((item) => item.id === 'amount').status, 'fail');
});


test('missing payee address is treated as essential missing information', () => {
  const parsed = parseUpiUri('upi://pay?pn=Test%20Merchant&am=10&cu=INR');
  const result = assessIntentConsistency({ type: 'pay_merchant', expectedRecipient: '', expectedAmount: '' }, parsed);
  assert.equal(result.outcome, OUTCOMES.UNABLE);
  assert.match(result.missingInformation.join(' '), /payee address/i);
});
