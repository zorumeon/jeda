# Demo recording script (maximum 2:50)

## Video requirements

- Upload the final video to YouTube as **Public** (not Unlisted or Private) and add the link to `DEVPOST.md`.
- The narration must be in English, or the video must have English subtitles.
- The video must show Jeda running in Google Chrome.
- Record in a clean Chrome window: a fresh profile or guest window with no personal tabs, bookmarks, extensions, notifications, email, or account names visible.
- Keep the total length under 3:00. This script ends at 2:50.

## Before recording

- Use a dedicated Firebase demo project and the built-in synthetic examples only. Never connect a wallet or enter a real key, recovery phrase, address, or account data.
- In desktop Chrome 139+, enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` and restart. Open the app while online, initialize the on-device model, and confirm its status is Ready before recording. Keep the app open, then turn Wi-Fi off for the local-only segment.
- Run the evaluation beforehand only if you want to show measured results. If there is no report in `evaluation-results.json`, show the honest empty state instead of entering example numbers.

## Timed script and narration

1. **0:00–0:20 — Problem and audience.** Show the check screen. "Everyday crypto users get urgent airdrop DMs, fake support messages, and risky approval requests. Jeda helps people pause and inspect a message before they act. It never connects to a wallet or signs a transaction."
2. **0:20–0:55 — Wi-Fi off, on-device verdict.** With the app and local model already initialized, disable Wi-Fi. In "Quick tour for judges", click **01 Scam verdict**; the message fills the text box. Click **Check this message**. Show the actual "Ran on-device" badge, the risk level, the categories, and the next step. Scroll to "Where your checks ran" and show the On-device count at 01 with the "Ran here" marker. "The response source comes from Firebase AI Logic metadata. A low-risk result is not proof of safety."
3. **0:55–1:15 — Secret guard.** Click **02 Secret guard**. Privacy mode switches on and a synthetic seed phrase is pasted. Show the block warning and the "Stopped by secret guard" count going up. "This was stopped in the browser. No model was called." Click **Redact and continue** to show the redaction.
4. **1:15–1:50 — Low confidence and consented cloud review.** Restore Wi-Fi. Click **03 Second opinion**, then **Check this message**. Use the second-opinion prompt only if the model actually marks the on-device result as low-confidence. Read the one-line notice, approve the cloud request, then show both assessments, their separate source badges, and the Cloud count in the console. Do not force or fake a low-confidence result.
5. **1:50–2:25 — Evaluation page.** Click **04 Evaluation**. If a run has been recorded, show its two requested modes, actual inference sources, accuracy, false-negative rate, p50 latency, fallback count, second-opinion count, and per-case outcomes. If the report is empty, say it has not been run yet on this browser and model, and show the empty state. Explain that the 40 examples are synthetic smoke tests, not a security benchmark.
6. **2:25–2:50 — Product tour.** Show History (metadata only by default), the How it works diagnostics, and dark mode: click the theme button so the dark theme spreads from it. Close with: "Jeda is heuristic guidance. Verify through official channels; no tool can guarantee that a message, contract, or website is safe."

Keep the privacy toggle, cloud-routing notice, actual source badge, and disclaimer visible when relevant. Do not enable "Save message in history" in a public demo. The local model must be downloaded before the offline segment; evaluation and cloud second opinions require connectivity and working App Check.
