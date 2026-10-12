# Test scenarios

## 1. Posted invoice credit changes shortage analysis

- Base tracked balance: ₹235,000.
- Post a ₹50,000 credit linked to `INV-101`.
- Expected tracked balance: ₹285,000.
- Expected `INV-101` outstanding amount: reduced by ₹50,000.
- Expected maximum demo funding gap: decreases from ₹151,000 to ₹101,000.
- The ₹50,000 must not be counted again as future invoice cash.

## 2. Unmatched credit still affects liquidity

- Post an account credit without an invoice reference.
- Current cash must increase immediately.
- No invoice collected amount should change.
- The UI should show the credit as needing reconciliation.

## 3. Duplicate webhook

- Post the same `transaction_id` twice.
- First request succeeds.
- Second request returns HTTP 409 and must not change the balance.

## 4. Overpayment

- Post a credit larger than the remaining invoice balance.
- Only the invoice outstanding amount is applied.
- The excess remains an unmatched credit but still contributes to account cash.

## 5. No-borrowing transition

- In the default demo, post enough cash to keep projected closing cash above the minimum reserve.
- Expected result: maximum funding gap becomes zero and the recommendation changes to no additional borrowing under current assumptions.
