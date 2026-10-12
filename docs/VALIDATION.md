# Validation Record

The deterministic core was validated independently of the React runtime using Node's built-in test runner.

Validated cases:

- refund deception direction contradiction;
- correct intended payment;
- wrong recipient;
- amount mismatch;
- incomplete information;
- malformed URI handling;
- unsupported URL scheme handling;
- invalid expected amount handling;
- missing payee-address handling;
- wording that avoids presenting a matching result as proof of safety.

The repository's `scripts/verify.ps1` performs the complete Windows verification sequence: dependency installation, automated tests, and Vite production build.
