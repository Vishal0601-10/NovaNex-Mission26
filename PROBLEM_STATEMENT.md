# MSME Working-Capital Early Warning and Financing Decision Engine

MSMEs can become temporarily illiquid even when they are profitable or hold valid receivables. Delayed customer payments, supplier obligations, payroll, loan repayments, and uncertain collection dates can create a working-capital gap before cash arrives.

This project forecasts daily cash availability, identifies the first projected reserve breach, estimates the maximum funding requirement and duration, and determines whether the gap should be addressed through collections, supplier-payment rescheduling, financing, or no additional borrowing.

The system is explicitly a decision-support prototype. It includes a generic account-event ingestion layer that can accept posted credits/debits for demonstration, but it is not an authenticated connection to a real bank or lender. It does not guarantee customer collection dates, approve credit, or provide financial advice.
