# Devpost submission draft

## Project name
Jeda

## Tagline
Pause before you connect.

## Value proposition
- **Who it is for:** everyday crypto and NFT users who get messages in DMs, community chats, and social feeds: airdrop claims, "official support" offers, recovery services, and wallet approval requests.
- **The problem:** these scams work by rushing people. A countdown or a frozen-account threat pushes the reader to connect a wallet, approve a spending permission, or share a recovery phrase before they stop to check.
- **What makes Jeda different:**
  - **Runs on the device first.** Short messages go to Firebase AI Logic in `PREFER_ON_DEVICE` mode, so a supported Chrome browser can analyze them with the on-device model. Privacy mode switches to `ONLY_ON_DEVICE`, and the text is never sent to the cloud without a separate, explicit confirmation.
  - **Blocks seed phrases before any model runs.** A local secret guard catches word runs that match the BIP-39 recovery-phrase wordlist and private-key-like 64-character hex values, stops the request, and offers local redaction. Nothing is sent or stored.
  - **Never connects a wallet.** Jeda only reads pasted text. It never requests a wallet connection, never signs a transaction, and never opens the links inside a message.

## Inspiration
Crypto scams often combine urgency, impersonated support, free-token claims, and wallet approvals. People need a quick, understandable way to inspect suspicious text without being asked to connect a wallet or share a recovery phrase.

## What it does
Jeda checks pasted crypto-related messages and wallet requests for common risk signals. It shows a structured risk level (low to critical), the signals it found mapped to six scam categories, and one practical next step. A local preflight blocks private-key-like and recovery-phrase-like text before inference. The app shows its routing choice and the inference source that the Firebase SDK reports for each response. Privacy mode fails closed to on-device only. Optional per-user history stores only metadata, and saving the message text is off by default.

## How we use Firebase AI Logic
All facts below are taken from `src/firebase.ts`, `src/policy.ts`, and `src/main.ts`.

- **Hybrid inference modes.** `getAI()` is initialized with the `GoogleAIBackend`, and `getGenerativeModel()` is created per `InferenceMode`:
  - `PREFER_ON_DEVICE` is the default for messages up to `maxOnDeviceChars` (1,800 characters by default). The SDK may fall back to the cloud model (`gemini-3.5-flash-lite`) if the on-device model is unavailable, and the UI says so.
  - `ONLY_ON_DEVICE` is used when Privacy mode is on. If the local model cannot initialize, the request fails and the message is not sent. A cloud attempt is only offered as a separate action behind a confirmation dialog.
  - `ONLY_IN_CLOUD` is used for messages over the length limit (after the user clicks Check) and for a user-approved cloud second opinion on low-confidence on-device results.
  - `initializeDeviceModel()` is called from the user's action and its download progress is shown in the UI.
  - The source badge uses `response.inferenceSource` (on-device or cloud) from the SDK, not a guess based on the requested mode.
- **Structured output.** One JSON schema (risk, summary, flags with category and explanation, recommendation, uncertainty) is passed as `responseSchema` with `responseMimeType: 'application/json'` for the cloud model and as `responseConstraint` for the on-device model. Every response is validated by `parseVerdict()` before it is shown.
- **App Check.** App Check is initialized with `ReCaptchaEnterpriseProvider`. Until App Check is ready, cloud-capable modes are disabled and the app only allows `ONLY_ON_DEVICE`. A debug token is opt-in and development-only.
- **Remote Config.** Four validated parameters control the routing policy: `defaultMode`, `maxOnDeviceChars` (100 to 6,000), `escalationEnabled`, and `lowConfidenceThreshold` (0 to 8). Safe client defaults are used when fetching fails.
- **Anonymous Auth and Firestore.** `signInAnonymously()` provides a per-user UID. Optional history is written to `users/{uid}/checks` in Firestore. Security rules allow each user to read, create, and delete only their own records, restrict fields and values, and block updates. Only risk, source, latency, and timestamp are saved unless the user opts in to saving the message.

## How we built it
The interface is a responsive Vite + TypeScript app without a UI framework. Firebase AI Logic provides structured Gemini responses through hybrid inference. Remote Config provides validated routing defaults, Anonymous Auth scopes optional Firestore history, and App Check protects Firebase resources. A 40-case synthetic dataset (20 scam, 20 benign) and a browser evaluation harness are included. The harness records accuracy, false-negative rate, p50 latency, fallback counts, and per-case errors only from real runs; `evaluation-results.json` stays empty until a run is recorded.

## Built during the submission period
All work in this repository was done during the submission period, starting 11 November 2026:
- The Vite + TypeScript web app: message checker, example chips, result panel, History, How it works, Evaluation, onboarding, and dark mode.
- Firebase integration: AI Logic hybrid inference with structured output, App Check, Remote Config, Anonymous Auth, Firestore history, and security rules.
- The local secret guard and routing policy, with unit tests (`src/secret-guard.test.ts`, `src/policy.test.ts`).
- The 40-case synthetic evaluation set, the in-browser evaluation harness, and the `record-evaluation.mjs` script.
- Documentation, the threat model, the judge testing guide, and the CSS-only hero and result-card design (no third-party image assets).

[TO ADD: confirm this list against your commit history before submitting.]

## Privacy and responsible use
The app does not connect to wallets, sign transactions, open submitted URLs, or execute pasted text. Standard `PREFER_ON_DEVICE` routing can fall back to the cloud under Firebase SDK policy, and the interface discloses that. Privacy mode uses `ONLY_ON_DEVICE`, and an unavailable local model does not trigger an automatic cloud request. Long-input and low-confidence cloud review paths are clearly disclosed and require the user's Check action or a separate confirmation. The result is heuristic guidance, not a guarantee, audit, or financial recommendation.

## Challenges and limitations
On-device availability depends on the user's browser, device, model download, and Firebase SDK support. Scam language and benign messages vary, so false positives and false negatives are expected. The synthetic evaluation set is small and is not a security benchmark, and no evaluation results have been recorded yet. Firebase configuration, App Check, Firestore rules, and model access must be completed in the project's own Firebase environment before live inference is available.

## What's next
Record and publish a real evaluation run, expand the reviewed synthetic corpus, test with independent human reviewers, and improve multilingual and accessibility coverage before making any quality claims.

## Testing instructions for judges
No login, wallet, or real data is needed. Every example in the app is synthetic.

1. **Open the hosted site:** [TO ADD: hosted site URL]. Use desktop Chrome.
2. **Check an example.** Under "Try an example", click the **Claim your airdrop** chip, then click **Check this message**. The result shows a risk level, the signals found, one safe next step, and where the model ran.
3. **Try Privacy mode and the secret guard.** Turn on **Privacy mode** (on-device only) and paste this synthetic seed phrase: `apple river stone cloud maple tiger lemon ocean pencil garden window silver`. Jeda blocks the check before any model runs and shows a warning with a **Redact and continue** button.
4. **Open Evaluation and History.** Evaluation lists the 40 synthetic test cases and stays empty until a real run is recorded. History is anonymous and metadata-only by default.

On-device inference needs desktop Chrome with the local model downloaded. Without it, standard mode (`PREFER_ON_DEVICE`) lets the Firebase SDK use the cloud model under its hybrid inference policy, while Privacy mode (`ONLY_ON_DEVICE`) never falls back on its own. Either way, the badge under each result ("Ran on-device" or "Ran in cloud") comes from the SDK's `response.inferenceSource`, so it always shows where the result was actually produced.

## Links
- Demo video (public on YouTube): [TO ADD]
- Source repository: [TO ADD]
- Live site: [TO ADD]
- Measured evaluation report and run metadata, if one is recorded: [TO ADD]
- Team and event-specific acknowledgments: [TO ADD]
