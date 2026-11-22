# Firebase setup checklist

1. Create a Firebase project and register a web app. Add its web config to `.env.local` using `.env.example` as a key template.
2. Enable Anonymous sign-in in Firebase Authentication.
3. Create Firestore and deploy the included `firestore.rules`.
4. Enable Firebase AI Logic, choose a supported Gemini backend, and configure the project's API access restrictions. The app calls Firebase AI Logic directly from the browser; there is no custom model proxy.
5. Create Remote Config values: `defaultMode=PREFER_ON_DEVICE`, `maxOnDeviceChars=1800`, `escalationEnabled=true`, `lowConfidenceThreshold=2`. Publish. Client defaults remain available when fetching fails.
6. Configure App Check with reCAPTCHA Enterprise, add the production site key as `VITE_RECAPTCHA_SITE_KEY`, deploy, verify valid tokens, then enforce App Check in Firebase products. For local development, use only a development Firebase project and opt-in debug token.
7. Verify Privacy mode blocks all cloud calls when local inference fails; verify cloud confirmation and source badge; verify per-user history isolation and raw-text opt-in/clear behavior.

The Firebase AI Logic web guide describes current browser/device prerequisites and supported hybrid inference modes. On-device support depends on the browser, device, model availability/download, and Firebase SDK. Unsupported runtimes may reject `ONLY_ON_DEVICE`; they must not be reported as a local success.
