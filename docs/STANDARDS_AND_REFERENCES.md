# Standards and References

These references inform the prototype's design context. They do not imply certification, regulatory approval, or complete implementation of any payment standard.

1. National Payments Corporation of India (NPCI), Fraud Awareness. NPCI states that scanning a QR code and entering a UPI PIN is meant for making payments, not receiving money. This directly motivates PayGuard's receive-versus-pay direction check.
2. NPCI, UPI Frequently Asked Questions. NPCI describes QR-based merchant integration and notes that merchant information such as merchant UPI ID and amount can be stored in a UPI QR and shown to the customer during payment.
3. Reserve Bank of India, Master Directions on Cyber Resilience and Digital Payment Security Controls for non-bank Payment System Operators, July 30, 2024. PayGuard is not a compliance implementation. The directions are cited only as broader security and risk-control context.
4. EMVCo, EMV QR Code Specifications. EMVCo standardises QR data formats for merchant-presented and consumer-presented payment use cases. PayGuard does not claim EMV QRCPS compliance and currently parses only simplified UPI payment-intent URIs used for the hackathon demonstration.

Public reference pages:

- https://www.npci.org.in/fraud-awareness
- https://www.npci.org.in/what-we-do/upi/faqs
- https://systemhealth.rbi.org.in/Scripts/BS_ViewMasDirections.aspx_id%3D12715%281%29.html
- https://www.emvco.com/emv-technologies/qr-codes/
