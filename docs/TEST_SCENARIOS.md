# Demonstration Scenarios

| Scenario | Intent | Test request | Expected outcome |
| --- | --- | --- | --- |
| Refund deception | Receive ₹4,999 refund | `upi://pay` requests outbound ₹4,999 | Intent mismatch detected |
| Correct intended payment | Pay Asha Stores ₹850 | Recipient and amount match | No mismatch detected in available information |
| Wrong recipient | Pay Metro Medicals ₹1,260 | QR names Quick Collect | Verify recipient or amount |
| Amount mismatch | Pay Riya Sharma ₹500 | QR requests ₹5,000 | Verify recipient or amount |
| Incomplete information | Pay City Cabs ₹320 | QR omits amount | Unable to assess essential details |

The automated tests in `tests/engine.test.js` exercise these five scenarios plus malformed input, unsupported schemes, invalid expected amounts, and the non-safety wording of a matching result.
