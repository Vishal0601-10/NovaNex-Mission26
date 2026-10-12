# NovaNex MSME Working-Capital Early Warning Engine

NovaNex is an account-aware working-capital decision-support system for MSMEs. It tracks posted company-account credits and debits, reconciles credited customer payments to invoices, forecasts near-term cash, detects reserve breaches, and compares feasible financing or operational responses.

This package contains a **zero-runtime-dependency production path**. Node.js 20+ is sufficient to run the complete dashboard and API. React/Vite source from the earlier prototype remains in `src/App.jsx` as an optional development path, but the production dashboard does not require `npm install`.

## Core flow

```text
Bank / account credit or debit
        ↓
Persistent account ledger
        ↓
Duplicate transaction protection
        ↓
Invoice reconciliation when invoice reference exists
        ↓
Actual available account cash
        ↓
Remaining receivables forecast
        ↓
Upcoming supplier, payroll, loan and operating obligations
        ↓
7 / 14 / 30 day rolling cash forecast
        ↓
Liquidity-gap detection against minimum reserve
        ↓
Feasible financing / supplier-rescheduling comparison
        ↓
Explainable recommendation, including no-borrowing decisions
```

## What is production-ready in this package

- Single Node.js production server for dashboard + API
- No npm packages required for the production run path
- Persistent JSON account ledger with atomic file replacement
- Duplicate bank-transaction rejection
- Optional API-key protection for all account writes
- Same-origin browser/API architecture, so wildcard CORS is not required
- Security headers and a restrictive Content Security Policy
- Request-size limits and JSON validation
- Health endpoints
- Graceful process shutdown
- Responsive browser dashboard with no external CDN
- CSV invoice import
- Browser persistence for forecast/scenario data
- Account-to-invoice reconciliation
- 7, 14 and 30-day forecasting
- Hard-feasibility financing comparison
- Explainable no-borrowing or financing recommendations
- Dockerfile and Docker Compose deployment
- Automated financial tests and an end-to-end production smoke test

## Important real-bank integration boundary

The application is ready to **receive account events**, but the ZIP does not contain credentials for a real bank, account aggregator, ERP, or payment gateway. A real provider must be authorized separately and configured to call:

```text
POST /api/account/webhook
```

with a unique bank transaction ID. This separation is intentional. The project does not fabricate access to bank APIs.

## Requirements

### Normal laptop run

- Node.js 20 or newer
- A modern browser

You do **not** need Python, a database, React, Vite, Docker, or `npm install` for the production run path.

### Optional container deployment

- Docker Desktop or Docker Engine with Docker Compose

## Fastest Windows setup

1. Extract the ZIP to a normal folder, for example:

```text
C:\Projects\NovaNex-MSME-Production
```

2. Install Node.js 20+ if it is not already installed.

3. Double-click:

```text
run_windows.bat
```

4. Open:

```text
http://127.0.0.1:8080
```

5. Keep the Command Prompt window open while using the application.

6. Press `Ctrl+C` in that window when you want to stop the server.

## Windows command-line setup

Open PowerShell or Command Prompt inside the extracted project folder:

```bash
node --version
npm run verify
npm start
```

Then open:

```text
http://127.0.0.1:8080
```

`npm run verify` does not install packages. It runs syntax checks, all financial unit tests, and the production server smoke test.

## macOS / Linux setup

From Terminal:

```bash
cd /path/to/NovaNex-MSME-Production
chmod +x run_unix.sh
./run_unix.sh
```

Or:

```bash
npm run verify
npm start
```

Open:

```text
http://127.0.0.1:8080
```

## First demonstration workflow

1. Open **Executive Dashboard**. Note the current tracked cash and maximum funding gap.
2. Open **Live Account Feed**.
3. Enter a unique transaction ID such as `UTR-DEMO-001`.
4. Enter an amount, for example `50000`.
5. Select **Credit received**.
6. Select invoice `INV-101`.
7. Enter payer `Arun Retail` and an optional UTR/reference.
8. Click **Post account event**.
9. The current balance increases immediately.
10. Open **Invoice Management**. `INV-101` outstanding is lower by the applied credit.
11. Return to **Executive Dashboard**. The rolling liquidity forecast and maximum funding gap have been recalculated from the new actual cash position.
12. Re-submit the same transaction ID. The API rejects it as a duplicate instead of counting the credit twice.

## Production configuration

Copy `.env.example` to `.env`.

### Local-only deployment

The defaults are intentionally local:

```text
HOST=127.0.0.1
PORT=8080
REQUIRE_WRITE_API_KEY=false
```

This means the server is reachable only from the same computer.

### Network or cloud deployment

Before exposing the server beyond your laptop, configure at least:

```text
HOST=0.0.0.0
PORT=8080
REQUIRE_WRITE_API_KEY=true
ACCOUNT_WRITE_API_KEY=REPLACE_WITH_A_LONG_RANDOM_SECRET
```

Use at least 24 random characters for `ACCOUNT_WRITE_API_KEY` and do not commit the real `.env` file.

If write-key protection is enabled, open **Live Account Feed → Connection & write protection**, enter the same key, and store it for the browser session. External webhook senders must provide:

```text
X-API-Key: REPLACE_WITH_A_LONG_RANDOM_SECRET
```

For an internet-facing deployment, place the application behind HTTPS using a trusted reverse proxy or managed platform. Do not expose plain HTTP account-event endpoints to the public internet.

## Account webhook contract

Endpoint:

```text
POST /api/account/webhook
Content-Type: application/json
X-API-Key: <configured key when required>
```

Example:

```json
{
  "transaction_id": "UTR123456789",
  "posted_at": "2026-10-12T12:30:00+05:30",
  "amount": 50000,
  "direction": "credit",
  "payer": "Arun Retail",
  "reference": "Invoice settlement",
  "invoice_number": "INV-101",
  "source": "bank_webhook"
}
```

Required fields:

- `transaction_id`
- `amount` greater than zero

Supported optional fields:

- `posted_at`
- `direction`: `credit` or `debit`
- `payer`
- `payee`
- `reference`
- `invoice_number`
- `status`
- `source`

A duplicate `transaction_id` returns HTTP `409`.

## Why credited payments are not double-counted

Suppose an invoice is ₹100,000 and a ₹40,000 payment reaches the company account.

The system does both operations together:

```text
Tracked account cash       + ₹40,000
Remaining invoice balance  - ₹40,000
```

The future receivable becomes ₹60,000. Therefore the model sees total economic cash of ₹100,000, not ₹140,000.

## Forecast model

The production dashboard uses the tested modules in `src/lib/`.

### Invoice-to-cash

- outstanding = invoice amount − collected amount
- customer historical delay is estimated from paid invoices
- median customer delay is used when enough history exists
- otherwise a configurable fallback delay is used and labeled as such
- confirmed, expected, and uncertain receivables remain distinguishable

### Cash forecast

```text
Projected closing cash
= tracked account cash
+ cumulative risk-adjusted future inflows
- cumulative future outflows
```

Base scenario collection weights:

- confirmed: 100%
- expected: 80%
- uncertain: 45%

The dashboard also provides Conservative and Optimistic scenarios.

### Liquidity gap

```text
Required liquidity gap
= max(0, minimum operating cash reserve - projected closing cash)
```

The engine reports first shortage date, maximum gap, shortage duration, recovery date and severity.

### Financing comparison

Hard constraints are evaluated before cost:

1. mandatory eligibility
2. availability date
3. approval/disbursement timing
4. required funding deadline
5. usable amount

A cheaper option arriving too late is therefore rejected.

For simple annual-rate comparisons:

```text
Interest = principal × annual interest rate × financing days / 365
Total estimated cost = interest + processing fees + other applicable fees
Net proceeds = gross proceeds - upfront deductions
```

Bundled lender terms are fictional demonstration terms and must be replaced with actual approved facility data for real use.

## CSV import

Template:

```text
data/invoices_template.csv
```

Required columns:

```text
invoice_number,customer,invoice_date,due_date,amount,amount_collected
```

Optional:

```text
actual_payment_date,collection_certainty
```

The importer validates required columns, duplicate invoice numbers, dates, non-negative amounts and over-collection.

## Persistent data

Server-side account events are stored in:

```text
data/account_ledger.local.json
```

by default. This file is excluded from Git.

Invoice edits, imported invoices, forecast assumptions and manually entered future cash events are stored in the browser's local storage. Use **Data & Scenarios → Reset browser data** to restore the bundled demonstration data.

For multi-user production use, replace browser-local scenario persistence and the JSON ledger with an authenticated application database. The current persistence model is appropriate for a single-business pilot, demonstration, research prototype or controlled hackathon deployment.

## Test and validation commands

Run:

```bash
npm run verify
```

This executes:

```text
npm run check
npm test
npm run smoke
```

Coverage includes:

- invoice outstanding balances
- historical delay estimation
- expected collection dates
- 7/14/30-day windows
- certainty-separated cash flow
- reserve breaches
- maximum funding gap
- shortage duration and recovery
- financing interest and fees
- credit-line available draw
- funding deadline exclusion
- supplier rescheduling permission
- no-borrowing recommendation
- CSV validation
- prevention of financing double counting
- account transaction validation
- duplicate transaction protection
- current bank balance calculation
- invoice reconciliation
- overpayment capping
- prevention of account-credit/receivable double counting
- production dashboard serving
- health endpoint
- account write authentication
- credit posting
- duplicate HTTP 409 behavior

## Docker deployment

Create a `.env` file containing a strong account write key:

```text
ACCOUNT_WRITE_API_KEY=replace-this-with-a-long-random-secret
```

Then run:

```bash
docker compose up --build -d
```

Open:

```text
http://localhost:8080
```

Stop:

```bash
docker compose down
```

Account ledger data is persisted in the named Docker volume `novanex-runtime`.

## Project structure

```text
NovaNex-MSME-Production/
├── web/
│   ├── index.html                 # zero-dependency production dashboard
│   ├── app.js
│   └── styles.css
├── server/
│   ├── productionServer.js        # dashboard + API production entry point
│   ├── accountServer.js           # persistent account ingestion API
│   └── config.js
├── src/
│   ├── lib/                       # tested finance/reconciliation engine
│   ├── data/demoData.js
│   └── App.jsx                    # earlier optional React development UI
├── tests/engine.test.js
├── scripts/smoke.mjs
├── data/invoices_template.csv
├── docs/
├── Dockerfile
├── docker-compose.yml
├── run_windows.bat
├── run_unix.sh
├── .env.example
└── package.json
```

## API health checks

```text
GET /api/system/health
GET /api/account/health
GET /api/account/snapshot
```

## Security notes

- Never commit real bank credentials or API keys.
- Enable `REQUIRE_WRITE_API_KEY=true` before network exposure.
- Terminate TLS/HTTPS at a reverse proxy or managed hosting layer.
- Validate the authenticity of a real bank/provider webhook before translating it into the internal account-event contract.
- Use a database and proper user authentication for multi-user or regulated deployments.
- Do not treat this prototype as guaranteed financial advice, a loan approval, or a guarantee of future collections.

## Optional React/Vite development source

The older React source is retained for developers who want to continue that UI. That optional path requires package installation:

```bash
npm install
npm run dev:react
```

It is **not required** to run the production application described above.
