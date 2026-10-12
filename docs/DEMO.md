# Two-Minute Hackathon Demo

Good morning. Our project is PayGuard, an intent-aware protection layer for UPI QR payments.

The problem is a human-factor gap. A payment screen can show transaction details, but during social engineering the user may misunderstand what the transaction is actually doing. A common example is being told to scan a QR and enter a UPI PIN to receive a refund, even though the QR initiates an outbound payment.

PayGuard begins with an Intent Contract. Before assessment, I state what I believe should happen: receive money, pay a merchant, pay a person, and where relevant the expected recipient and amount.

I will start with our refund deception scenario. My intent says I should receive ₹4,999. The test QR is a `upi://pay` request for ₹4,999. PayGuard identifies the semantic contradiction: receiving intent versus an outbound payment request. It explains the reason and recommends that I do not authorise the payment as a way to receive money.

Next, I will switch to the wrong-recipient scenario. I intend to pay Metro Medicals, but the QR names Quick Collect. PayGuard does not call it fraud. It simply shows the mismatch and asks me to independently verify the recipient.

Now I will run the correct intended payment. The recipient and amount match the stated intent, so PayGuard reports that no mismatch was detected in the available information. Notice that it still does not say the payment is safe. Matching text cannot prove legitimacy or account ownership.

The engine is deterministic and explainable. It checks payment direction, recipient, amount, information completeness, and input validity. The prototype uses only simulated data, stores no financial credentials, and does not connect to NPCI, banks, or payment service providers.

Our goal is to demonstrate that explicitly representing user intent can add a useful pre-authorisation safety signal on top of existing payment information.
