# PayGuard: Intent-Aware Protection for UPI QR Payments

PayGuard is a responsive finance-hackathon web prototype that compares what a user believes a UPI QR transaction should accomplish with what a test payment request actually asks them to authorise.

The project focuses on a human-factor failure mode: a person may believe they are receiving a refund, paying a known recipient, or approving one amount while the scanned request represents an outbound payment to a different recipient or for a different amount.

> **Prototype scope:** PayGuard uses simulated/test UPI data only. It does not connect to NPCI, banks, or payment service providers; verify real accounts; execute, block, reverse, or recover transactions; or declare that a transaction is fraudulent.

## Theme

Finance

## Problem statement

UPI QR payments make digital transactions fast and convenient, but they also create a human-factor vulnerability: a user can authorise an outbound payment even when they believe they are receiving money, paying a different recipient, or approving a different amount.

PayGuard demonstrates a transparent pre-authorisation decision-support mechanism that captures the user's intended transaction outcome and compares it with available information in a test UPI payment request, including payment direction, recipient identity, and amount.

The complete approved wording is in [`PROBLEM_STATEMENT.md`](./PROBLEM_STATEMENT.md).

## Target users

- UPI users who may be exposed to social-engineering or deceptive QR instructions.
- Hackathon judges evaluating explainable fintech safety mechanisms.
- Product and security teams exploring how user intent might be represented before payment authorisation.

## Key features

- Intent selection for receiving refunds or money, paying a merchant, paying a person, or paying an expected amount.
- Local parser for supported `upi://pay` test URIs.
- Explicit checks for payment direction, recipient consistency, amount consistency, information completeness, and input validity.
- Structured explainable outcomes with recommended next actions and assessment limitations.
- Five built-in demonstration scenarios that can be switched without reloading.
- Recent demo assessment history in browser `localStorage` with a clear-history control.
- Copyable result explanation.
- Responsive, keyboard-friendly fintech UI with no external runtime API dependency.

## Technology stack

- React 18
- Vite 5
- JavaScript ES modules
- Lightweight custom CSS
- Browser `localStorage` for non-sensitive demo history
- Node's built-in test runner for deterministic engine tests

There is no backend, banking API, paid service, model download, external AI API, or secret required.

## Architecture and workflow

```text
User intent ───────────────┐
                           ├─> Intent Consistency Engine ─> Explainable result ─> Recommended action
Test UPI URI -> local parser┘
```

The engine is separated from the UI in `src/utils/intentEngine.js`, and URI parsing is isolated in `src/utils/upiParser.js`. See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the detailed Mermaid diagram and module boundaries.

## Installation and execution

### Prerequisites

- Node.js 18 or newer
- npm

### Windows PowerShell

```powershell
cd path\to\payguard-intent-protection
npm install
npm test
npm run build
npm run dev
```

Vite will print a local URL, normally `http://localhost:5173`. Open that URL in your browser.

After dependencies have been installed once, the core scenarios do not require banking services or external API keys. The application itself has no runtime network dependency.

## Demonstration scenarios

| Scenario | Expected result |
| --- | --- |
| Refund deception | Intent mismatch detected |
| Correct intended payment | No mismatch detected in available information |
| Wrong recipient | Verify recipient or amount |
| Amount mismatch | Verify recipient or amount |
| Incomplete information | Unable to assess essential details |

See [`docs/TEST_SCENARIOS.md`](./docs/TEST_SCENARIOS.md) for the exact scenario intent and expected behaviour.

## Testing

Run:

```powershell
npm test
npm run build
```

The automated tests verify all five built-in scenarios plus malformed URI handling, unsupported URL schemes, invalid expected amounts, missing payee-address handling, and the requirement that a matching result must not be presented as proof of payment safety. A successful `npm install` generates `package-lock.json`; commit that generated lockfile before final GitHub submission.

Manual browser checks should confirm:

1. Landing page renders and “Start payment safety check” scrolls to the assessment workspace.
2. Each scenario updates intent, payment data, and results without a page reload.
3. Malformed or unsupported input produces a clear unable-to-assess result instead of a crash.
4. Result explanations can be copied.
5. Assessment history appears locally and can be cleared.
6. Layout remains usable on laptop and narrow mobile widths.

## Deterministic decision logic

PayGuard does **not** output a fraud probability. It uses explicit rules:

- Receiving intent + `upi://pay` request -> direction contradiction.
- Expected recipient supplied + parsed payee differs -> recipient mismatch.
- Expected amount supplied + parsed amount differs -> amount mismatch.
- Required comparison field unavailable -> unable to fully assess that check.
- Malformed or unsupported input -> unable to assess.

The overall result is chosen from the strongest demonstrated condition. Each individual check remains visible so the judge can see why the outcome was produced.

## Privacy and security limitations

- No UPI PINs, OTPs, bank credentials, account balances, API keys, or secrets are requested or stored.
- Test UPI URIs are parsed as text and are never automatically opened.
- `localStorage` contains only demo assessment summaries and can be cleared from the UI.
- A payee name or UPI ID is not independently verified by this prototype.
- “No mismatch detected” means only that the modeled fields were consistent. It is not a safety certification.
- The prototype cannot execute, approve, decline, block, reverse, or recover any real payment.

## Standards and references

The design is informed by public NPCI fraud-awareness and UPI guidance, RBI digital-payment security directions, and EMVCo QR payment specifications. These are contextual references only. PayGuard does not claim certification or regulatory compliance.

See [`docs/STANDARDS_AND_REFERENCES.md`](./docs/STANDARDS_AND_REFERENCES.md).

## Demo and judge preparation

- [`docs/DEMO.md`](./docs/DEMO.md): concise two-minute walkthrough.
- [`docs/JUDGE_QA.md`](./docs/JUDGE_QA.md): five likely questions with technical answers.

## Repository structure

```text
payguard-intent-protection/
├── PROBLEM_STATEMENT.md
├── README.md
├── package.json
├── package-lock.json        # generated by npm install, then commit it
├── vite.config.js
├── index.html
├── public/
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   ├── components/
│   ├── data/
│   └── utils/
├── tests/
└── docs/
```

## License and submission note

This repository is a hackathon prototype and should be reviewed before reuse in any real payment environment. No live deployment URL is listed unless deployment has actually been completed and verified.
