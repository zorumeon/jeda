# Submission checklist (deadline: 1 Dec 2026)

Code, tests (54 passing) and the production build are verified. The items below need your own Firebase account, browser or channel, so they cannot be done from the code.

## Must do before submitting

1. **Create the Firebase project and deploy.** Follow `MANUAL_STEPS.md` steps 1-9, then `pnpm build` and `firebase deploy --only hosting,firestore:rules`.
2. **Put the live URL in two places:** `DEVPOST.md` (Links and Testing instructions) and `README.md` (Testing instructions for judges). Search for `[TO ADD`.
3. **Record the demo video** with `DEMO_SCRIPT.md` (under 3:00, English, in Chrome, uploaded to YouTube as **Public**). Add the link to `DEVPOST.md`.
4. **Take one screenshot of a real assessment** from the deployed app and add it to `devpost-assets/` as the gallery image. The existing five were taken without Firebase keys.
5. **Confirm "Built during the submission period"** in `DEVPOST.md` (starts 11 November 2026) against your commit history. Do not submit that sentence if any code predates that date.
6. **Make the GitHub repository public** and confirm `.env.local` and credentials are absent from the commit history. GitHub should show the Apache-2.0 license.
7. **Re-read the official rules** (eligibility, required fields, video rules) against the Devpost form before pressing submit.

## Optional

- Run the in-app Evaluation on desktop Chrome, download the JSON, then `pnpm record-eval jeda-evaluation-results.json`. Only publish numbers from a real run.
- Enforce App Check on AI Logic and Firestore after verifying monitoring.
