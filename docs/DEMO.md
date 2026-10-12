# Two-minute demo script

Good morning. Our project is an MSME Working-Capital Early Warning and Financing Decision Engine.

The important change in this version is that the system no longer treats the business's current cash as only a manually entered simulation value. We have introduced an account-event layer.

I will first open Live Account Feed. Assume this is the company's operating account. The system starts from its known current balance. Now I will post a synthetic bank credit of ₹50,000 from a customer and link it to invoice INV-101. In a production deployment, an authorised bank-data or account-aggregator adapter would send the same event contract automatically.

As soon as the credit is posted, the account balance rises by ₹50,000. At the same time, INV-101's outstanding receivable falls by ₹50,000. This is important because otherwise the system would count the same money twice, once as cash already received and again as a future invoice collection.

When I return to the Executive Dashboard, the rolling forecast is recalculated from the new tracked bank balance. In the default demo, the ₹50,000 linked credit reduces the maximum modeled funding gap from ₹151,000 to ₹101,000. If enough cash is credited, the projected shortage can disappear completely.

The Invoice Management page still predicts collection dates for only the amount that remains outstanding. The Cash-Flow Forecast then provides 7-day, 14-day, and 30-day views using actual posted cash plus future confirmed, expected, and uncertain inflows.

The Liquidity Early Warning module identifies the first shortage date, maximum gap, duration, and expected recovery relative to the configured operating reserve.

Only after that does the Financing Comparison module check whether borrowing or supplier rescheduling is necessary. It applies eligibility, timing, and amount constraints before cost comparison. A cheap loan that arrives after the shortage date is rejected.

Finally, the Explainable Recommendation page states what action is recommended and why. If credited payments remove the projected gap, the system explicitly recommends that additional borrowing may be unnecessary.

The included account feed is a generic integration contract using synthetic data. It does not contain real bank credentials and it is not a claim of live certification with a particular bank.
