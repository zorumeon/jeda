# Threat model

## Assets and goals

The primary asset is the user's pasted message, including accidental credentials and wallet recovery material. Goals: prevent accidental secret transmission, make cloud routing visible, prevent analysis text from being retained by default, isolate history per anonymous user, and communicate uncertainty without implying safety guarantees.

## Adversaries and untrusted inputs

- Phishing messages can contain prompt injection, manipulative instructions, fabricated URLs, wallet-connection requests, or credential requests.
- A model can hallucinate, misclassify, return malformed structured data, or be unavailable.
- Browser storage, client configuration, and responses are user-controlled. Firebase web keys are not secrets.
- A user may paste a mnemonic/private key by mistake.

## Controls

- Never follow instructions embedded in analyzed text; use a fixed system instruction, constrained JSON schema, response bounds, and output validation.
- Never visit user-provided URLs, connect a wallet, sign, or transact.
- Run local secret-like text detection before the model and before persistence; block the request until the input is redacted.
- `ONLY_ON_DEVICE` for privacy mode; explicit confirmation before its cloud fallback and low-confidence cloud review. Long text selects cloud-only mode on user action. `PREFER_ON_DEVICE` can invoke Firebase's automatic cloud fallback: the UI and source badge disclose this behavior.
- Use SDK `inferenceSource` for the result badge. Unknown source is not presented as local.
- Store only risk, inference source, latency, and timestamp by default; raw-message persistence is opt-in. User path is scoped to anonymous auth UID, Firestore rules restrict reads/deletes/creates to that UID, and updates are denied.
- App Check is supported; production should use reCAPTCHA Enterprise and enforce App Check for supported services.
- Render model content as escaped text. No HTML from model outputs is interpreted.

## Residual risks / out of scope

The secret scan is heuristic: it matches the English BIP-39 wordlist without validating the checksum, so it can miss non-English phrases and obfuscated secrets (for example words split across messages, heavily misspelled, or interleaved with other characters), and it blocks 64-character transaction hashes because they look like private keys. Client-side filters can be bypassed by a modified browser. Automatic Firebase fallback in preferred mode can transmit text when local inference is unavailable. A model is not a phishing oracle and cannot reliably prove that links/contracts are safe. Anonymous accounts are not recoverable across cleared browser state. Firebase privacy, retention, regional, and abuse controls must be configured for the deploying project. This prototype is not an audit or financial advice.

## Operational review

Before launch: use synthetic tests; review Firebase AI Logic data handling and enabled backend; configure API key restrictions, App Check enforcement, budgets/rate controls, Firestore rules, Remote Config; verify deployed headers and CSP against Firebase endpoints; test browser permission failures and unavailable model paths; and obtain security/privacy review.
