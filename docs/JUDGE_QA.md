# Likely Judge Questions

## 1. Is PayGuard just another fraud score?

No. Its central mechanism is intent consistency. It first represents what the user believes the economic action should be, then compares that belief with the payment request. The prototype deliberately avoids presenting an arbitrary score as a calibrated probability of fraud.

## 2. Why not use machine learning?

The hackathon prototype has no validated, labelled fraud dataset suitable for credible training and evaluation. Deterministic rules make every scenario reproducible and every warning traceable to a specific contradiction. Machine learning could later complement the system, but it is not required to demonstrate the core concept.

## 3. Can PayGuard stop a real UPI transaction?

No. This prototype is intentionally isolated from real payment infrastructure. It cannot execute, approve, decline, block, reverse, or recover a transaction. It demonstrates a decision-support layer that could conceptually be integrated before authorisation.

## 4. Does a matching recipient mean the payment is safe?

No. The app explicitly says that no detected mismatch is not proof of safety. A displayed payee name or UPI ID is not independently verified by PayGuard and cannot prove account ownership or legitimacy.

## 5. What is the key differentiator?

The differentiator is the explicit comparison between declared user intent and payment semantics, especially payment direction. For example, “I expect to receive a refund” conflicts with a `upi://pay` request that authorises money to leave the payer. Recipient and amount checks support that central intent-consistency model.
