# Implementation Guide

## 1. Extract and verify

Extract the project and open a terminal in its root folder.

```bash
node --version
npm run verify
```

Use Node.js 20 or newer. `npm run verify` should finish with all financial tests and the production smoke test passing.

## 2. Start locally

Windows: double-click `run_windows.bat`.

macOS/Linux:

```bash
./run_unix.sh
```

Or on any platform:

```bash
npm start
```

Open `http://127.0.0.1:8080`.

## 3. Set the actual company opening balance

Open **Live Account Feed** and update the base balance to the known company account balance at the point from which you want event tracking to begin.

Do not add historical transactions that are already included in that base balance, otherwise cash would be duplicated.

## 4. Load company invoices

Open **Invoice Management**.

Either enter invoices manually or download `data/invoices_template.csv`, populate it, and import it.

For reliable invoice-to-cash estimates, historical paid invoices should include `due_date` and `actual_payment_date`.

## 5. Load future obligations

Open **Data & Scenarios** and enter supplier payments, payroll, rent, operating expenses, loan repayments and any other committed cash events not already represented in the account balance.

These are future events only. Do not add a debit that has already posted to the account ledger.

## 6. Connect account-credit events

For a demonstration, use the form on **Live Account Feed**.

For an actual provider integration, configure the provider/adaptor to POST normalized events to `/api/account/webhook`.

Use a unique transaction ID for idempotency. Where possible include the invoice number so the credit can reconcile to the receivable automatically.

## 7. Secure writes

Before exposing the service on a network, create `.env` and set:

```text
HOST=0.0.0.0
REQUIRE_WRITE_API_KEY=true
ACCOUNT_WRITE_API_KEY=<long random secret>
```

Restart the server. Configure the same key in the webhook sender's `X-API-Key` header.

## 8. Validate the decision flow

After a credit is posted, verify all of the following:

1. Live Account Feed shows the credit exactly once.
2. Current available balance increases by the credited amount.
3. If an invoice number was supplied, that invoice outstanding balance decreases.
4. Executive Dashboard recalculates maximum funding gap.
5. Liquidity Early Warning updates the first shortage date/duration if changed.
6. Financing Comparison excludes options that miss the deadline or mandatory constraints.
7. Explainable Recommendations changes when financing becomes unnecessary.

## 9. Deploy

For Docker:

```bash
docker compose up --build -d
```

For a VM/server, run `npm start` under a service manager such as systemd, PM2, or the hosting platform's process supervisor and put an HTTPS reverse proxy in front of port 8080.

## 10. Real bank/account-aggregator adapter

Provider payloads vary. The provider-specific adapter should verify the provider signature/authentication and then map the event into:

```json
{
  "transaction_id": "provider-unique-id",
  "posted_at": "ISO-8601 timestamp",
  "amount": 50000,
  "direction": "credit",
  "payer": "Customer name",
  "reference": "UTR/reference",
  "invoice_number": "INV-101",
  "source": "provider-name"
}
```

Do not put bank credentials in frontend JavaScript.
