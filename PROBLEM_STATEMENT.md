# PayGuard: Intent-Aware Protection for UPI QR Payments

## Theme

Finance

## Problem Statement

UPI QR payments make digital transactions fast and convenient, but they also create a human-factor vulnerability: a user can authorise an outbound payment even when they believe they are receiving money, paying a different recipient, or approving a different amount.

Existing UPI payment flows display transaction information such as recipient details and amount, and payment providers employ fraud-prevention controls. However, these mechanisms do not necessarily represent and compare what the user believes the transaction is supposed to accomplish. During social-engineering attacks, urgency, misleading instructions, or deceptive QR codes can cause users to overlook a contradiction between their intended action and the actual payment request.

The problem is therefore to provide a transparent pre-authorisation decision-support mechanism that captures the user's intended transaction outcome and compares it with the information contained in a UPI QR payment request, including payment direction, recipient identity, and amount.

The system should identify and explain meaningful inconsistencies, particularly situations such as a user expecting to receive a refund or cashback while the scanned QR actually initiates an outbound payment, and recommend proportionate verification or caution before authorisation.

The proposed prototype will operate using simulated or test UPI payment data only. It will not connect to NPCI, banks, or payment service providers; verify real bank accounts; execute, block, reverse, or recover transactions; or declare that a transaction is fraudulent. Its purpose is to demonstrate whether intent-consistency checking can provide an additional, explainable safety signal before payment authorisation.

## Proposed Solution

PayGuard is a responsive web application that creates a small “intent contract” before assessment. The user states whether they expect to receive money or make a payment and, where relevant, supplies the expected recipient and amount. PayGuard then parses a simulated `upi://pay` URI and applies deterministic consistency rules for payment direction, recipient, amount, information completeness, and input validity.

The result is an explainable decision-support outcome, not a fraud verdict or calibrated fraud probability. PayGuard recommends normal review, independent verification, caution, or stopping the attempted payment depending on the contradiction it can actually demonstrate from the supplied test data.
