import { analyze, appCheckReady, CLOUD_MODEL, clearHistory, configured, firebaseConfigReady, getPolicy, initializeOnDevice, loadHistory, saveHistory, type Verdict } from './firebase'
import { findSecrets, redactSecrets } from './secret-guard'
import { examples, judgeSeedPhrase } from './examples'
import { DEFAULTS, isLowConfidence, routeInput, type Risk } from './policy'
import { mountMotionDashboard } from './motion-dashboard'
import committedEvaluationResults from '../evaluation-results.json'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/space-grotesk'
import './style.css'
import './theme-glass.css'
import './theme-elegant.css'
import './motion-dashboard.css'
import './theme-devpost.css'
import './theme-judge.css'
import './theme-check.css'

type Result = { verdict: Verdict; source: string; latencyMs: number; reason: string }
type EvaluationOutput = { id: string; category: string; mode: 'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD'; stage: 'preferred' | 'cloud-only' | 'second-opinion'; path: string; expected: 'scam' | 'benign'; actual?: 'scam' | 'benign'; latencyMs?: number; uncertainty?: number; lowConfidence?: boolean; error?: string }
type EvaluationMetrics = { cases: number; completed: number; errors: number; accuracy: number | null; falseNegativeRate: number | null; p50LatencyMs: number | null }
type EvaluationReport = { generatedAt: string; firebaseSdk: string; model: string; browser: string; syntheticOnly: true; caseCount: number; initializationError: string | null; classificationRule: string; modeResults: { preferred: EvaluationMetrics; cloudOnly: EvaluationMetrics }; actualSource: { onDevice: EvaluationMetrics; cloud: EvaluationMetrics; unknown: EvaluationMetrics }; fallbackCount: number; fallbackRate: number | null; escalationCount: number; escalationRate: number | null; outputs: EvaluationOutput[] }
const app = document.querySelector<HTMLDivElement>('#app')!
let input = ''
let result: Result | null = null
let previousResult: Result | null = null
let busy = false
let privacyOnly = false
let saveRaw = false
let dark = false
let page: 'scan' | 'history' | 'diagnostics' | 'evaluation' = 'scan'
let historyItems: any[] = []
let currentPolicy = DEFAULTS
let lifecycle = 'Checking availability'
let errorMessage = ''
let cloudFallbackAvailable = false
let evaluationHistory = Array.isArray(committedEvaluationResults) ? committedEvaluationResults as EvaluationReport[] : []
let evaluationReport: EvaluationReport | null = evaluationHistory.length ? evaluationHistory[evaluationHistory.length - 1] : null
let onboardingDismissed = (()=>{try{return sessionStorage.getItem('jeda.onboarding.dismissed')==='1'}catch{return false}})()
type TourStep = 'scam' | 'guard' | 'second' | 'eval'
type RunPath = 'on-device' | 'cloud' | 'guard'
let tourStep: TourStep | null = null
// Hybrid console counters. They describe this tab only: they start at zero and are never stored or sent anywhere.
const runs: Record<RunPath, number> = { 'on-device': 0, cloud: 0, guard: 0 }
let lastPath: RunPath | null = null
let guardActive = false
// Counts one secret-guard block each time the input changes from clear to blocked.
function syncGuard() {
  const blocked = findSecrets(input).length > 0
  if (blocked && !guardActive) { runs.guard++; lastPath = 'guard' }
  guardActive = blocked
}
let animateResult = false
let checkingMode = ''
let checkingStartedAt = 0
let checkingTimer = 0

function esc(value: unknown) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!) }
function riskName(risk: Risk) { return risk[0].toUpperCase() + risk.slice(1) }
function getEffectiveRoute(length: number, privacy: boolean) {
  const route = routeInput(length, privacy, currentPolicy.maxOnDeviceChars, currentPolicy.defaultMode)
  if (firebaseConfigReady && !appCheckReady && route.mode === 'PREFER_ON_DEVICE') return { mode: 'ONLY_ON_DEVICE' as const, reason: 'App Check unavailable; cloud fallback is disabled' }
  return route
}
const scamTypes = [
  { id: 'fake_airdrop', name: 'Fake airdrops', icon: 'gift', desc: 'Unclaimed-allocation bait that ends in a malicious approval or signature request.', signal: '“Claim within 12 minutes”' },
  { id: 'approval_drainer', name: 'Approval drainers', icon: 'unlock', desc: 'Requests for unlimited spending permission that let an attacker move your tokens.', signal: '“Approve unlimited, it’s safe”' },
  { id: 'support_impersonation', name: 'Fake support', icon: 'headset', desc: 'Someone posing as wallet or exchange support, asking for secrets in a private chat.', signal: '“Send your recovery phrase”' },
  { id: 'recovery_scam', name: 'Recovery offers', icon: 'refresh', desc: 'Promises to recover lost funds in exchange for an upfront fee or “gas deposit”.', signal: '“Pay a refundable deposit”' },
  { id: 'urgency_pressure', name: 'Pressure tactics', icon: 'zap', desc: 'Countdowns, threats and frozen-account claims designed to rush you past checking.', signal: '“FINAL NOTICE”' },
  { id: 'fake_giveaway', name: 'Fake giveaways', icon: 'coins', desc: 'Send-a-little-get-more-back doubling schemes dressed up as community rewards.', signal: '“First 50 members only”' },
] as const
const categoryNames: Record<string, string> = { ...Object.fromEntries(scamTypes.map(t => [t.id, t.name.replace(/s$/, '')])), urgency_pressure: 'Urgency & pressure', other: 'Other signal' }
const riskOrder: Risk[] = ['low', 'medium', 'high', 'critical']
let menuOpen = false

function icon(name: string) {
  const paths: Record<string, string> = {
    shield: '<path d="M12 3 4.5 6v5c0 5 3.2 8.5 7.5 10 4.3-1.5 7.5-5 7.5-10V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
    scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 12h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
    moon: '<path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/>',
    close: '<path d="m18 6-12 12M6 6l12 12"/>',
    pause: '<path d="M9 5v14M15 5v14" stroke-width="2.6"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    headset: '<path d="M3 14v-2a9 9 0 0 1 18 0v2"/><path d="M21 15a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2ZM3 15a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2Z"/><path d="M18 17v1a3 3 0 0 1-3 3h-3"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    coins: '<circle cx="9" cy="9" r="6"/><path d="M15.7 9.4A6 6 0 1 1 9.4 15.7"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 6 19Z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    play: '<path d="M7 4v16l13-8L7 4Z"/>',
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`
}
function arrowCta(label: string, attrs: string, extra = '') {
  return `<button class="cta-white ${extra}" ${attrs}><span>${label}</span><span class="cta-arrow">${icon('arrow')}</span></button>`
}
type FocusTarget = { selector: string; occurrence: number; selection?: [number, number] }
let pendingFocus: FocusTarget | null = null
function captureFocus(): FocusTarget | null {
  const el = document.activeElement
  if (!(el instanceof HTMLElement) || !app.contains(el)) return pendingFocus
  const attr = el.id ? null : ['data-example', 'data-page', 'data-jump', 'data-tour'].find(a => el.hasAttribute(a))
  const selector = el.id ? `#${CSS.escape(el.id)}` : attr ? `[${attr}="${CSS.escape(el.getAttribute(attr)!)}"]` : ''
  if (!selector) return null
  const selection = el instanceof HTMLTextAreaElement ? [el.selectionStart, el.selectionEnd] as [number, number] : undefined
  return { selector, occurrence: Math.max(0, [...app.querySelectorAll(selector)].indexOf(el)), selection }
}
// The whole view is re-rendered with innerHTML, so keyboard focus is restored to the equivalent control afterwards.
function restoreFocus(target: FocusTarget | null) {
  if (!target) return
  const el = app.querySelectorAll<HTMLElement>(target.selector)[target.occurrence]
  if (!el || (el as HTMLButtonElement).disabled || el.closest('[inert]')) { pendingFocus = target; return }
  el.focus({ preventScroll: true })
  if (target.selection && el instanceof HTMLTextAreaElement) el.setSelectionRange(...target.selection)
  pendingFocus = null
}
function render() {
  const focusTarget = captureFocus()
  const modalOpen = !onboardingDismissed
  const inert = modalOpen ? ' inert' : ''
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  const navigation = [['scan', 'Check'], ['diagnostics', 'How it works'], ['history', 'History'], ['evaluation', 'Evaluation']] as const
  const navLinks = navigation.map(([id, label]) => `<button class="nav-link ${page === id ? 'active' : ''}" data-page="${id}" ${page === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')
  app.innerHTML = `
    <a class="skip-link" href="#main-content"${inert}>Skip to content</a>
    <header class="topbar"${inert}><div class="container topbar-inner">
      <a class="brand" href="#" data-page="scan" aria-label="Jeda home"><span class="logo-mark" aria-hidden="true"><i></i><i></i></span>jeda</a>
      <nav class="topnav" aria-label="Main navigation">${navLinks}<button class="nav-link" data-jump="trust">Is it safe?</button></nav>
      <div class="top-actions">
        <span class="conn-pill" title="${configured ? 'Firebase and App Check are configured' : 'Firebase is not configured in this workspace'}"><span class="status-dot ${configured ? 'online' : ''}"></span>${configured ? 'Firebase connected' : 'Demo workspace'}</span>
        <button class="icon-button" id="theme-toggle" aria-label="Switch to ${dark ? 'light' : 'dark'} theme">${icon(dark ? 'sun' : 'moon')}</button>
        <button class="btn-white-sm hide-sm" data-jump="check">Check a message</button>
        <button class="icon-button menu-toggle" id="menu-toggle" aria-expanded="${menuOpen}" aria-controls="mobile-menu" aria-label="${menuOpen ? 'Close menu' : 'Open menu'}">${icon(menuOpen ? 'close' : 'menu')}</button>
      </div></div>
      ${menuOpen ? `<nav class="mobile-menu" id="mobile-menu" aria-label="Mobile navigation">${navLinks}<button class="nav-link" data-jump="trust">Is it safe?</button>${arrowCta('Check a message', 'data-jump="check"', 'full')}</nav>` : ''}
    </header>
    <main id="main-content" tabindex="-1"${inert}>${page === 'scan' ? renderScan() : page === 'history' ? renderHistory() : page === 'diagnostics' ? renderDiagnostics() : renderEvaluation()}</main>
    ${renderFooter(inert)}
    ${modalOpen ? renderOnboarding() : ''}`
  const motionSlot = app.querySelector<HTMLElement>('#motion-slot')
  if (motionSlot) mountMotionDashboard(motionSlot)
  bind()
  if (modalOpen && !focusTarget?.selector.includes('onboarding')) restoreFocus({ selector: '#close-onboarding-cta', occurrence: 0 })
  else restoreFocus(focusTarget)
}
function renderFooter(inert = '') {
  return `<footer class="site-footer"${inert}><div class="container">
    <div class="footer-top">
      <div class="footer-brand"><a class="brand" href="#" data-page="scan"><span class="logo-mark" aria-hidden="true"><i></i><i></i></span>jeda</a><p class="footer-tagline">Take a beat <em>before</em> you connect.</p><p>A privacy-first pause button for crypto messages and wallet approvals. Heuristic guidance, not a guarantee. Not financial advice.</p></div>
      <div class="footer-col"><h3>Product</h3><button data-jump="check">Check a message</button><button data-jump="types">Scam types</button><button data-page="history">History</button></div>
      <div class="footer-col"><h3>Transparency</h3><button data-page="diagnostics">How it works</button><button data-jump="stack">Firebase stack</button><button data-page="evaluation">Evaluation</button><button data-jump="trust">Is it safe?</button></div>
      <div class="footer-col"><h3>Built on</h3><span>Firebase AI Logic</span><span>Gemini Nano on-device</span><span>Chrome Prompt API</span></div>
    </div>
    <div class="footer-bottom"><span>&copy; 2026 Jeda &middot; #BuildHybridAI</span><span>Always verify through official channels.</span><span>Never share your recovery phrase.</span></div>
    <div class="footer-wordmark" aria-hidden="true">jeda</div>
  </div></footer>`
}
function renderHero() {
  return `<section class="hero"><div class="hero-grid-bg" aria-hidden="true"></div><div class="container hero-inner">
    <button class="announce" data-jump="tour"><span class="badge-new">#BuildHybridAI 2026</span><span class="announce-long">Built on Firebase AI Logic hybrid inference</span><span class="announce-short">Hybrid inference</span><span class="announce-link">Judge tour</span><span class="announce-arrow">${icon('arrow')}</span></button>
    <h1>Take a beat <em>before</em><br>you connect.</h1>
    <p class="hero-lead">Scam messages work by rushing you. Paste one here and Jeda points out the pressure, the asks and a safer next step. It checks on your own device first.</p>
    <div class="hero-actions">${arrowCta('Check a message', 'data-jump="check"')}<button class="btn-blue" data-jump="how">See how it works</button></div>
    <ul class="mode-chips" aria-label="Firebase AI Logic inference modes used by Jeda"><li>${icon('cpu')}<code>PREFER_ON_DEVICE</code>default</li><li>${icon('lock')}<code>ONLY_ON_DEVICE</code>Privacy mode</li><li>${icon('cloud')}<code>ONLY_IN_CLOUD</code>long input or consent</li></ul>
    <div class="motion-slot" id="motion-slot"></div>
  </div></section>`
}
function renderImpact() {
  const audiences = [
    ['Newcomers', 'First-time wallet owners who have never seen an approval prompt or a fake support DM.'],
    ['Community moderators', 'People who triage dozens of suspicious links in Discord and Telegram every day.'],
    ['Older holders', 'The group that reported the largest crypto losses and is the most targeted by urgency scripts.'],
  ]
  return `<section class="section impact" id="impact"><div class="container impact-grid">
    <div class="impact-figure">
      <span class="eyebrow">02 · THE PROBLEM</span>
      <strong class="impact-number">$9.3B</strong>
      <p class="impact-caption">lost to crypto-related fraud reported to the FBI in 2024, up 66% on the year before.</p>
      <dl class="impact-facts"><div><dt>149,686</dt><dd>complaints filed</dd></div><div><dt>$2.8B</dt><dd>lost by people over 60</dd></div></dl>
      <small class="impact-source">Source: FBI Internet Crime Complaint Center, 2024 Internet Crime Report.</small>
    </div>
    <div class="impact-copy">
      <h2>Scams win in the <em>ten seconds</em> before you click.</h2>
      <p class="lead">The message that drains a wallet usually contains your own recovery phrase or an approval you were rushed into. That is exactly the text you should never paste into a random cloud tool. Jeda checks it on your device first, so the safest moment to pause is also the most private one.</p>
      <ul class="audience-list">${audiences.map(([name, text]) => `<li><strong>${name}</strong><span>${text}</span></li>`).join('')}</ul>
    </div>
  </div></section>`
}
function renderStack() {
  const stack = [
    ['cpu', 'Firebase AI Logic', 'Hybrid inference', `One <code>getGenerativeModel</code> call with <code>PREFER_ON_DEVICE</code>, <code>ONLY_ON_DEVICE</code> and <code>ONLY_IN_CLOUD</code>. Every result reports its real <code>inferenceSource</code>.`],
    ['shield', 'App Check', 'reCAPTCHA Enterprise', 'Protects the cloud model from abuse. Without a valid token, Jeda locks itself to on-device only instead of failing open.'],
    ['refresh', 'Remote Config', 'Live routing policy', 'The on-device character limit, default mode and second-opinion threshold change without redeploying.'],
    ['lock', 'Authentication', 'Anonymous sign-in', 'Each visitor gets a private, account-less identity so history is scoped to them alone.'],
    ['book', 'Firestore', 'Per-user history', 'Stores risk level, source and latency by default. Message text is saved only after an explicit opt-in.'],
  ] as const
  return `<section class="section" id="stack"><div class="container">
    <div class="section-head center"><span class="eyebrow">05 · BUILT ON FIREBASE</span><h2>Five Firebase products, one hybrid pipeline</h2><p class="lead">Every product below is imported and called at runtime in <code>src/firebase.ts</code>, not just listed in the README.</p></div>
    <div class="stack-grid">${stack.map(([ic, name, tag, text], i) => `<article class="stack-card${i === 0 ? ' featured' : ''}"><div class="stack-top"><span class="type-icon">${icon(ic)}</span><span class="stack-tag">${tag}</span></div><h3>${name}</h3><p>${text}</p></article>`).join('')}</div>
  </div></section>`
}
function renderSections() {
  return `${renderImpact()}<section class="section alt" id="types"><div class="container">
      <div class="section-head center"><span class="eyebrow">03 · WHAT JEDA LOOKS FOR</span><h2>Six patterns behind most crypto scams</h2><p class="lead">Every flag in your assessment maps to one of these categories, with a plain-language explanation.</p></div>
      <div class="types-grid">${scamTypes.map(t => `<article class="type-card"><span class="type-icon">${icon(t.icon)}</span><h3>${t.name}</h3><p>${t.desc}</p><span class="type-signal">${t.signal}</span></article>`).join('')}</div>
    </div></section>
    <section class="section" id="how"><div class="container">
      <div class="section-head center"><span class="eyebrow">04 · HOW IT WORKS</span><h2>Paste text. Never connect a wallet.</h2><p class="lead">Every message goes through the same four stops. The result always tells you where it actually ran.</p></div>
      <div class="flow" aria-label="Request routing">
        <div class="flow-node"><span>${icon('scan')}</span><strong>Paste message</strong><small>Text only</small></div><span class="flow-line" aria-hidden="true"></span>
        <div class="flow-node accent"><span>${icon('lock')}</span><strong>Secret guard</strong><small>Blocks keys &amp; phrases locally</small></div><span class="flow-line" aria-hidden="true"></span>
        <div class="flow-node"><span>${icon('cpu')}</span><strong>On-device model</strong><small>Under ${currentPolicy.maxOnDeviceChars.toLocaleString()} chars</small></div><span class="flow-line" aria-hidden="true"></span>
        <div class="flow-node"><span>${icon('cloud')}</span><strong>Cloud</strong><small>Fallback, long input or second opinion</small></div>
      </div>
      <div class="center-link"><button class="link-button" data-page="diagnostics">See full routing policy ${icon('arrow')}</button></div>
    </div></section>
    ${renderStack()}
    <section class="section alt" id="trust"><div class="container">
      <div class="section-head center"><span class="eyebrow">06 · IS IT SAFE?</span><h2>Built to keep your secrets yours</h2></div>
      <div class="trust-grid">
        <article class="trust-card"><span class="type-icon">${icon('lock')}</span><h3>Secrets are blocked first</h3><p>Recovery phrases and private keys are caught before any model runs, then redacted on request. Nothing is sent or stored.</p></article>
        <article class="trust-card"><span class="type-icon">${icon('shield')}</span><h3>Your text stays yours</h3><p>History saves only the risk level by default. Your message is stored only if you switch that on.</p></article>
        <article class="trust-card"><span class="type-icon">${icon('alert')}</span><h3>Honest about limits</h3><p>This is heuristic guidance. Jeda cannot verify contracts, links or addresses, so check through official channels.</p></article>
      </div>
    </div></section>`
}
function renderScan() {
  const flagged = findSecrets(input)
  const selectedExample = examples.findIndex(example => example.text === input)
  const route = getEffectiveRoute(input.length, privacyOnly)
  const showEscalation = result && isLowConfidence(result.verdict, currentPolicy.lowConfidenceThreshold) && result.source === 'on-device' && currentPolicy.escalationEnabled && appCheckReady
  return `${renderHero()}<section class="section" id="check"><div class="container">
    <div class="check-head">
      <div class="check-head-copy"><span class="eyebrow">01 · LIVE DEMO</span><h2>Check a message</h2><p>Paste a message. Jeda checks it on your device first, and never uses the cloud without your OK.</p></div>
      ${!configured ? `<button class="setup-pill" data-page="diagnostics" title="Complete the Firebase web-app configuration and App Check to enable inference and private history.">${icon('alert')}<span>Firebase not configured</span><b>Setup guide ${icon('arrow')}</b></button>` : ''}
    </div>
    ${renderTour()}
    <div class="check-grid">
      <section class="panel input-panel" aria-labelledby="input-title">
        <div class="panel-heading"><div><span class="eyebrow">STEP 1 · INPUT</span><h3 id="input-title">Paste a message or request</h3></div><span class="local-tag">${icon('shield')} Checked locally first</span></div>
        <div class="examples"><span class="examples-label">Try an example <small>· all synthetic · <i class="chip-dot scam"></i> scam <i class="chip-dot benign"></i> benign</small></span><div class="chip-row">${examples.map((x, i) => `<button class="chip ${selectedExample === i ? 'active' : ''}" data-example="${i}" aria-pressed="${selectedExample === i}"><span class="chip-dot ${x.kind}"></span>${x.label}</button>`).join('')}</div></div>
        <label class="sr-only" for="message-input">Suspicious message or wallet request</label>
        <div class="textarea-wrap"><textarea id="message-input" maxlength="6000" placeholder="Paste the message, link context, or wallet request you want to check…">${esc(input)}</textarea><div class="input-meta"><span id="char-count">${input.length} / 6000</span><span>Min. 10 characters · Press / to focus</span></div></div>
        ${flagged.length ? `<div class="secret-warning" role="alert"><span class="warning-mark">${icon('lock')}</span><div><strong>Possible ${[...new Set(flagged.map(x => x.kind))].join(' and ')} detected</strong><p>We blocked analysis. Nothing was sent to any model or stored. Choose Redact and continue to remove the sensitive text.${flagged.some(x => x.kind === 'private key') ? ' A 64-character hex value can also be a transaction hash; it looks identical to a private key, so both are blocked. Describe the transaction in words instead.' : ''}</p><button class="btn-small" id="redact-input">Redact and continue</button></div></div>` : ''}
        <fieldset class="check-settings"><legend>Check settings</legend><div class="options-row">
          <label class="toggle-label"><input id="privacy-toggle" type="checkbox" ${privacyOnly ? 'checked' : ''}><span class="switch"></span><span><strong>Privacy mode</strong><small>On-device only</small></span></label>
          <label class="toggle-label"><input id="save-raw" type="checkbox" ${saveRaw ? 'checked' : ''}><span class="switch"></span><span><strong>Save text to history</strong><small>Off by default</small></span></label>
        </div>
        <div class="route-note"><span class="route-badge ${route.mode === 'ONLY_IN_CLOUD' ? 'cloud' : 'device'}">${icon(route.mode === 'ONLY_IN_CLOUD' ? 'cloud' : 'cpu')}${route.mode.replaceAll('_', ' ').toLowerCase()}</span><p>${privacyOnly ? 'Privacy mode blocks cloud use. If no local model is available, you can choose whether to send this text to the cloud.' : `${esc(route.reason)}. ${route.mode === 'ONLY_IN_CLOUD' ? 'Cloud-only inference starts only after you click Check.' : route.mode === 'PREFER_IN_CLOUD' ? 'The SDK prefers cloud inference for this request.' : ''}`}</p></div></fieldset>
        <div class="form-actions"><button class="btn-primary" id="analyze" aria-busy="${busy}" ${busy || input.trim().length < 10 || flagged.length ? 'disabled' : ''}>${busy ? '<span class="spinner" aria-hidden="true"></span> Checking…' : `${icon('scan')} Check this message`}</button><span class="button-caption">${icon('check')} No wallet connection · No transaction signing</span></div>
        <div id="inference-status" class="inference-status" aria-live="polite">${busy ? esc(lifecycle) : ''}</div>
        ${errorMessage ? `<div class="error-box" role="alert"><span class="notice-icon">${icon('alert')}</span><div><p>${esc(errorMessage)}</p>${cloudFallbackAvailable ? '<button id="cloud-fallback" class="btn-small">Ask before sending to cloud</button>' : ''}</div></div>` : ''}
      </section>
      <aside class="check-side" aria-label="Assessment">
        ${busy ? renderChecking() : result ? renderResult(result, Boolean(showEscalation)) : `<section class="empty-result"><span class="empty-icon">${icon('shield')}</span><strong>Your assessment will appear here</strong><p>Start with a message on the left. Your input is checked for sensitive secrets before any model runs.</p><ul class="empty-list"><li>${icon('check')} Risk level from low to critical</li><li>${icon('check')} Each red flag explained</li><li>${icon('check')} One safe next step</li></ul></section>`}
      </aside>
    </div>
    ${renderConsole()}
    ${previousResult ? `<section class="panel comparison"><span class="eyebrow">SIDE-BY-SIDE OPINION</span><h3>Local and cloud assessment</h3><div class="compare-grid">${resultCard(previousResult)}${resultCard(result!)}</div></section>` : ''}
  </div></section>${renderSections()}`
}
const tourSteps: { id: TourStep; title: string; text: string }[] = [
  { id: 'scam', title: 'Scam verdict', text: 'Loads a synthetic airdrop DM. Press Check to see the risk level and where it ran.' },
  { id: 'guard', title: 'Secret guard', text: 'Turns on Privacy mode and pastes a synthetic seed phrase. It is blocked before any model runs.' },
  { id: 'second', title: 'Second opinion', text: 'Loads an ambiguous approval. A low-confidence local result offers a consented cloud review.' },
  { id: 'eval', title: 'Evaluation', text: 'Opens the 40-case synthetic benchmark. It stays empty until a real run is recorded.' },
]
function renderTour() {
  const active = tourSteps.find(step => step.id === tourStep)
  return `<section class="tour-bar" id="tour" aria-labelledby="tour-title">
    <span class="tour-label" id="tour-title">${icon('play')} Judge tour</span>
    <div class="tour-chips">${tourSteps.map((step, i) => `<button class="tour-chip ${tourStep === step.id ? 'active' : ''}" data-tour="${step.id}" aria-pressed="${tourStep === step.id}" title="${step.text}"><span aria-hidden="true">${i + 1}</span>${step.title}</button>`).join('')}</div>
    <p class="tour-hint" aria-live="polite">${active ? active.text : 'Synthetic data only. Nothing is sent until you press Check.'}</p>
  </section>`
}
function renderChecking() {
  const cloud = checkingMode === 'ONLY_IN_CLOUD'
  const where = cloud ? `Cloud · ${CLOUD_MODEL}` : checkingMode === 'ONLY_ON_DEVICE' ? 'On-device only · Gemini Nano' : 'On-device first · Gemini Nano'
  const preview = esc(input.trim().slice(0, 220)) + (input.trim().length > 220 ? '…' : '')
  const steps = [
    { state: 'done', title: 'Secret guard', detail: 'No seed phrase or private key found' },
    { state: 'done', title: 'Route chosen', detail: where },
    { state: 'active', title: 'Model reading the message', detail: `<span id="checking-lifecycle">${esc(lifecycle)}</span>` },
    { state: 'todo', title: 'Writing the assessment', detail: 'Risk level, red flags, one safe next step' },
  ]
  return `<section class="checking" aria-labelledby="checking-title" aria-busy="true">
    <div class="checking-top">
      <span class="checking-orb" aria-hidden="true">${icon(cloud ? 'cloud' : 'cpu')}</span>
      <div><span class="eyebrow">STEP 2 · CHECKING</span><h3 id="checking-title">Reading your message</h3></div>
      <span class="checking-time" id="checking-elapsed" aria-label="Elapsed time">0.0 s</span>
    </div>
    <div class="checking-scan" aria-hidden="true"><p>${preview}</p><span class="scan-beam"></span></div>
    <ol class="checking-steps">${steps.map(s => `<li class="${s.state}"><span class="step-dot">${s.state === 'done' ? icon('check') : ''}</span><div><strong>${s.title}</strong><small>${s.detail}</small></div></li>`).join('')}</ol>
    <p class="checking-hint" id="checking-hint" hidden>${icon('clock')} ${cloud ? 'Cloud checks usually finish in a few seconds.' : 'The first on-device check can take up to a minute while Gemini Nano warms up. Nothing leaves this device.'}</p>
  </section>`
}
function startCheckingTimer() {
  window.clearInterval(checkingTimer)
  checkingTimer = window.setInterval(() => {
    const seconds = (performance.now() - checkingStartedAt) / 1000
    const el = document.querySelector('#checking-elapsed')
    if (el) el.textContent = `${seconds.toFixed(1)} s`
    if (seconds > 6) document.querySelector<HTMLElement>('#checking-hint')?.removeAttribute('hidden')
  }, 100)
}
function renderConsole() {
  const lanes: { id: RunPath; icon: string; name: string; detail: string }[] = [
    { id: 'on-device', icon: 'cpu', name: 'On-device', detail: 'Gemini Nano through the Chrome Prompt API' },
    { id: 'cloud', icon: 'cloud', name: 'Cloud', detail: `${CLOUD_MODEL} through Firebase AI Logic` },
    { id: 'guard', icon: 'lock', name: 'Stopped by secret guard', detail: 'Blocked locally, no model called' },
  ]
  return `<section class="console" aria-labelledby="console-title">
    <div class="console-head"><div><span class="eyebrow">STEP 3 · HYBRID CONSOLE</span><h3 id="console-title">Where your checks ran</h3></div><span class="console-scope">This tab only · starts at zero · not stored</span></div>
    <ul class="lanes">${lanes.map(lane => `<li class="lane ${lastPath === lane.id ? 'last' : ''}"><span class="lane-top">${icon(lane.icon)}${lane.name}</span><span class="lane-count" aria-label="${runs[lane.id]} ${runs[lane.id] === 1 ? 'check' : 'checks'}">${String(runs[lane.id]).padStart(2, '0')}</span><small>${esc(lane.detail)}</small>${lastPath === lane.id ? '<span class="lane-here">Ran here</span>' : ''}</li>`).join('')}</ul>
    <p class="console-note">On-device and cloud counts come from the Firebase SDK&apos;s <code>response.inferenceSource</code> for each completed check, not from the mode that was requested.</p>
  </section>`
}
function renderResult(item: Result, showEscalation = false) {
  const level = riskOrder.indexOf(item.verdict.risk)
  const escalation = showEscalation ? `<div class="escalation"><div><strong>Want a second opinion?</strong><p>This result has limited evidence. A cloud model can review the same message. The text leaves this device only if you approve.</p></div><button class="btn-small" id="escalate">Get a second opinion ${icon('arrow')}</button></div>` : ''
  const groups = new Map<string, string[]>()
  for (const f of item.verdict.flags) groups.set(f.category, [...(groups.get(f.category) ?? []), f.explanation])
  const flagCount = item.verdict.flags.length
  const flagsHeading = flagCount ? `Why Jeda flagged it <span class="count">${flagCount} signal${flagCount === 1 ? '' : 's'} · ${groups.size} ${groups.size === 1 ? 'category' : 'categories'}</span>` : 'No specific red flags found'
  const flagList = [...groups].map(([category, explanations]) => `<li class="flag-item"><span class="flag-icon">${icon(scamTypes.find(t => t.id === category)?.icon ?? 'alert')}</span><div><span class="category-pill">${categoryNames[category] ?? 'Other signal'}${explanations.length > 1 ? ` <b>×${explanations.length}</b>` : ''}</span>${explanations.length > 1 ? `<ul class="flag-points">${explanations.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : `<p>${esc(explanations[0])}</p>`}</div></li>`).join('')
  const where = item.source === 'on-device' ? 'on-device' : item.source === 'cloud' ? 'in cloud' : 'with unknown source'
  const seconds = item.latencyMs >= 1000 ? `${(item.latencyMs / 1000).toFixed(1)} s` : `${item.latencyMs} ms`
  return `<section class="result-panel risk-${item.verdict.risk}${animateResult ? ' enter' : ''}" aria-live="polite">
    <div class="result-top"><div><span class="eyebrow">STEP 2 · RESULT</span><h3>Safety assessment</h3></div><div class="risk-chip risk-${item.verdict.risk}"><span class="risk-dot"></span>${riskName(item.verdict.risk)} risk</div></div>
    <div class="risk-meter" role="meter" aria-label="Risk level: ${item.verdict.risk}" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${level + 1}"><div class="meter-bars" style="--filled:${level + 1}">${riskOrder.map((r, i) => `<span class="${level >= i ? 'filled' : ''}" style="--i:${i}"><small>${riskName(r)}</small></span>`).join('')}</div></div>
    <p class="result-summary">${esc(item.verdict.summary)}</p>
    <div class="recommendation"><span class="recommend-icon">${icon('shield')}</span><div><span>WHAT TO DO NEXT</span><p>${esc(item.verdict.recommendation)}</p></div></div>
    <div class="flags-title">${flagsHeading}</div>
    ${flagCount ? `<ul class="flag-list">${flagList}</ul>` : '<p class="no-flags">This does not guarantee a message is safe. Verify independently.</p>'}
    ${escalation}
    <div class="result-bottom"><div class="run-meta"><span class="run-badge ${item.source}">${icon(item.source === 'cloud' ? 'cloud' : 'cpu')}Ran ${where} · ${seconds}</span><span class="run-reason">${esc(item.reason)}</span></div><button class="btn-small ghost" id="copy-summary">${icon('copy')} Copy safe summary</button></div>
    <p class="disclaimer">Heuristic guidance, not a guarantee. Jeda cannot verify contract code or guarantee safety.</p></section>`
}
function resultCard(item: Result) {
  return `<div class="compare-card"><div class="compare-top"><span class="run-badge ${item.source}">${icon(item.source === 'cloud' ? 'cloud' : 'cpu')}${item.source === 'on-device' ? 'On-device' : 'Cloud'} · ${item.latencyMs} ms</span><span class="risk-chip risk-${item.verdict.risk}"><span class="risk-dot"></span>${riskName(item.verdict.risk)} risk</span></div><p>${esc(item.verdict.summary)}</p><span class="compare-flags">${item.verdict.flags.length} concrete signal${item.verdict.flags.length === 1 ? '' : 's'}</span></div>`
}
function pageHero(eyebrow: string, title: string, lead: string, action = '') {
  return `<section class="page-hero"><div class="hero-grid-bg" aria-hidden="true"></div><div class="container page-hero-inner"><div><span class="eyebrow light">${eyebrow}</span><h1>${title}</h1><p>${lead}</p></div>${action}</div></section>`
}
function renderHistory() {
  if (!configured) return `${pageHero('YOUR ACTIVITY', 'History', 'Your anonymous checks, stored only on your account.')}<div class="container page-body"><div class="notice notice-info"><span class="notice-icon">${icon('alert')}</span><div><strong>Firebase setup required</strong><p>Anonymous Auth and Firestore are enabled after configuring Firebase. No checks are stored in this preview workspace.</p></div><button class="text-link" data-page="diagnostics">Setup guide</button></div><section class="panel"><div class="empty-state"><span class="empty-icon">${icon('clock')}</span><strong>Nothing stored here</strong><p>Once Firebase is configured, completed checks show up here — risk level, source and latency only.</p><button class="btn-primary" data-jump="check">${icon('scan')} Check a message</button></div></section></div>`
  const total = historyItems.length
  const flaggedCount = historyItems.filter(item => item.risk === 'high' || item.risk === 'critical').length
  const onDevice = historyItems.filter(item => item.source === 'on-device').length
  const stat = (label: string, value: string) => `<div class="mini-stat"><span>${label}</span><strong>${value}</strong></div>`
  return `${pageHero('YOUR ACTIVITY', 'History', 'Your recent checks. Raw messages are excluded unless you opted in.', total ? '<button class="btn-white-sm" id="clear-history">Clear my history</button>' : '')}<div class="container page-body">
    ${total ? `<div class="mini-stats">${stat('Total checks', String(total))}${stat('High or critical', String(flaggedCount))}${stat('Ran on-device', `${Math.round((onDevice / total) * 100)}%`)}</div>` : ''}
    <section class="panel history-panel">${total ? `<div class="history-list">${historyItems.map(item => `<div class="history-row"><span class="risk-chip risk-${esc(item.risk)}"><span class="risk-dot"></span>${riskName(item.risk)} risk</span><span class="history-run">${icon(item.source === 'cloud' ? 'cloud' : 'cpu')}${esc(item.source)} · ${Number(item.latencyMs) || 0} ms</span><time>${item.createdAt?.toDate?.().toLocaleString?.() ?? 'Just now'}</time></div>`).join('')}</div>` : `<div class="empty-state"><span class="empty-icon">${icon('clock')}</span><strong>No checks yet</strong><p>Completed checks will show up here, without their messages.</p><button class="btn-primary" data-jump="check">${icon('scan')} Check a message</button></div>`}</section></div>`
}
function renderDiagnostics() {
  const api = (window as any).LanguageModel
  const chrome = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1]
  const cell = (label: string, value: string, ok: boolean | null, id = '') => `<div class="diag-cell"><span>${label}</span><strong ${id ? `id="${id}"` : ''}>${value}</strong>${ok === null ? '' : `<i class="diag-state ${ok ? 'ok' : 'warn'}">${ok ? 'Ready' : 'Check'}</i>`}</div>`
  return `${pageHero('TRANSPARENCY', 'How it works', 'See exactly how your message is handled before you check it.')}<div class="container page-body">
    <section class="panel"><div class="section-title"><div><span class="eyebrow">RUNTIME</span><h2>This browser</h2></div><span class="status-tag ${configured ? 'ok' : ''}">${configured ? 'Firebase configured' : 'Needs setup'}</span></div>
      <div class="diag-grid">${cell('Browser', chrome ? `Chrome ${chrome}` : 'Chrome not detected', Boolean(chrome))}${cell('Prompt API', api ? 'Available' : 'Not detected', Boolean(api))}${cell('App Check', appCheckReady ? 'Initialized' : 'Needs setup', appCheckReady)}${cell('Model status', esc(lifecycle), null, 'model-status')}${cell('Inference default', esc(currentPolicy.defaultMode.replaceAll('_', ' ')), null)}${cell('On-device max', `${currentPolicy.maxOnDeviceChars.toLocaleString()} characters`, null)}${cell('Cloud escalation', currentPolicy.escalationEnabled ? 'Available with consent' : 'Disabled by policy', null)}</div>
      <p class="diagnostic-note">Prompt API presence is a browser capability hint only. Firebase SDK response metadata is used for the actual inference-source badge.</p></section>
    <section class="panel"><div class="section-title"><div><span class="eyebrow">ROUTING POLICY</span><h2>Where requests go</h2></div></div>
      <div class="table-wrap"><table><thead><tr><th>Condition</th><th>Inference mode</th><th>Data handling</th></tr></thead><tbody>
        <tr><td>Under length limit; privacy mode off</td><td><code>${esc(currentPolicy.defaultMode)}</code></td><td>Configured by Remote Config; SDK response metadata shows the actual path.</td></tr>
        <tr><td>Over length limit</td><td><code>ONLY_IN_CLOUD</code></td><td>Cloud request starts only when you click Check.</td></tr>
        <tr><td>Privacy mode on</td><td><code>ONLY_ON_DEVICE</code></td><td>Cloud is blocked unless you explicitly confirm the fallback.</td></tr>
        <tr><td>Low-confidence local result</td><td><code>ONLY_IN_CLOUD</code></td><td>Cloud review is offered; the text is sent only after consent.</td></tr>
      </tbody></table></div>
      <p class="diagnostic-note">Low confidence means invalid/unparseable schema, medium risk, fewer than ${currentPolicy.lowConfidenceThreshold} concrete flags, or model uncertainty ≥ 0.55.</p></section>
    <section class="panel"><div class="section-title"><div><span class="eyebrow">LOCAL MODEL SETUP</span><h2>Enable Gemini Nano</h2></div></div>
      <ol class="setup-list"><li><span>1</span><p>Use current Chrome desktop (139+ recommended).</p></li><li><span>2</span><p>Open <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code> and enable the Prompt API flag.</p></li><li><span>3</span><p>Restart Chrome, then allow Chrome to download the on-device model.</p></li><li><span>4</span><p>Return here and run an analysis. The first local request may take longer while model files download.</p></li></ol></section>
  </div>`
}
function renderEvaluation() {
  if (!evaluationReport) return `${pageHero('EVIDENCE', 'Evaluation', 'A transparent, synthetic benchmark — not a marketing claim.')}<div class="container page-body"><div class="notice notice-warn"><span class="notice-icon">${icon('alert')}</span><div><strong>No recorded runs</strong><p>Results stay empty until you run the benchmark and record actual model responses. No numbers are fabricated.</p></div></div><section class="panel"><div class="empty-state"><span class="empty-icon">${icon('chart')}</span><strong>No committed results yet</strong><p>Run all 40 synthetic cases through PREFER_ON_DEVICE and ONLY_IN_CLOUD. Download the report, then append it to evaluation-results.json with the record-evaluation script.</p><div class="empty-meta"><span>40 synthetic cases</span><span>20 scam</span><span>20 benign</span><span>6 scam categories</span></div><button class="btn-primary" id="run-eval" ${!configured ? 'disabled' : ''}>${icon('play')} Run evaluation in this browser</button>${!configured ? '<p class="diagnostic-note">Requires Firebase and App Check configuration.</p>' : ''}</div><p class="diagnostic-note">The benchmark uses synthetic text only and requires one confirmation before cloud-capable runs. Reports contain labels, timings, modes, and actual inference sources — never input messages.</p></section></div>`
  const report = evaluationReport
  const pct = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`
  const metric = (name: string, value: string, detail: string) => `<div class="eval-metric"><span>${name}</span><strong>${value}</strong><small>${detail}</small></div>`
  const group = (name: string, value: EvaluationMetrics) => `<section class="eval-group"><span class="eyebrow">${name}</span><div class="eval-metrics">${metric('Accuracy', pct(value.accuracy), `${value.completed} completed · ${value.errors} errors`)}${metric('False-negative rate', pct(value.falseNegativeRate), 'Scam labels missed at the report threshold')}${metric('P50 latency', value.p50LatencyMs === null ? '—' : `${Math.round(value.p50LatencyMs)} ms`, 'Includes model initialization on first use')}</div></section>`
  const escalatedIds = new Set(report.outputs.filter(item => item.stage === 'second-opinion').map(item => item.id))
  const rows = report.outputs.map(item => `<tr><td>${esc(item.id)}</td><td>${esc(item.category)}</td><td><code>${esc(item.mode)}</code></td><td>${esc(item.stage)}</td><td>${esc(item.path)}</td><td>${esc(item.expected)}</td><td>${esc(item.actual ?? '—')}</td><td>${item.latencyMs === undefined ? '—' : `${Math.round(item.latencyMs)} ms`}</td><td>${item.error ? `<span class="eval-error">${esc(item.error)}</span>` : item.stage === 'second-opinion' ? 'Consent confirmed' : escalatedIds.has(item.id) ? 'Second opinion triggered' : item.lowConfidence ? 'Low confidence' : '—'}</td></tr>`).join('')
  return `${pageHero('EVIDENCE', 'Evaluation', 'Observed model output on synthetic data only.', `<button class="btn-white-sm" id="download-eval">${icon('download')} Download JSON</button>`)}<div class="container page-body">
    <div class="notice notice-info"><span class="notice-icon">${icon('chart')}</span><div><strong>${report.caseCount} cases · ${esc(report.model)} · Firebase JS SDK ${esc(report.firebaseSdk)}</strong><p>Run ${esc(report.generatedAt)} · ${esc(report.browser)} · ${evaluationHistory.length} previously recorded run${evaluationHistory.length === 1 ? '' : 's'}. ${esc(report.classificationRule)}.</p></div></div>
    ${report.initializationError ? `<div class="notice notice-warn"><span class="notice-icon">${icon('alert')}</span><div><strong>On-device initialization did not complete</strong><p>${esc(report.initializationError)} Preferred-mode calls may have fallen back to cloud; actual SDK source is listed per row.</p></div></div>` : ''}
    <div class="eval-dashboard">${group('PREFER_ON_DEVICE', report.modeResults.preferred)}${group('ONLY_IN_CLOUD', report.modeResults.cloudOnly)}<section class="eval-group"><span class="eyebrow">OBSERVED SOURCE &amp; ROUTING</span><div class="eval-metrics">${metric('On-device source', `${report.actualSource.onDevice.completed}/${report.actualSource.onDevice.cases}`, 'Actual source reported by Firebase SDK')}${metric('Cloud fallback', `${report.fallbackCount}`, `${pct(report.fallbackRate)} of preferred-mode cases`)}${metric('Cloud second opinions', `${report.escalationCount}`, `${pct(report.escalationRate)} of preferred-mode cases triggered`)}</div></section></div>
    <section class="panel"><div class="section-title"><div><span class="eyebrow">PER-CASE RESULTS</span><h2>${report.outputs.length} model runs</h2></div><button class="btn-primary" id="run-eval" ${!configured ? 'disabled' : ''}>${icon('refresh')} Run again</button></div><div class="table-wrap"><table><thead><tr><th>Case</th><th>Category</th><th>Requested mode</th><th>Run stage</th><th>Actual source</th><th>Label</th><th>Output</th><th>Latency</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div><p class="diagnostic-note">Raw synthetic prompts are omitted from the report. After download, record the run with <code>record-evaluation.mjs</code> to append it to the committed results file.</p></section>
  </div>`
}
function chromeSetupStatus() {
  const version = Number(navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? 0)
  const browser = version ? `Chrome ${version}${version < 139 ? ' (139+ required)' : ''}` : 'Chrome desktop not detected'
  return `${browser} · Prompt API ${'LanguageModel' in window ? 'available' : 'not detected'}`
}
function dismissOnboarding() { onboardingDismissed = true; try { sessionStorage.setItem('jeda.onboarding.dismissed', '1') } catch { }; render(); pendingFocus = null; document.getElementById('main-content')?.focus({ preventScroll: true }) }
function renderOnboarding() {
  return `<div class="modal-backdrop" role="presentation"><section class="onboarding" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
    <div class="onboarding-art"><span class="onboarding-mark" aria-hidden="true"><i></i><i></i></span><button class="icon-button modal-close" id="close-onboarding" aria-label="Close introduction">${icon('close')}</button></div>
    <div class="onboarding-body"><span class="eyebrow">WELCOME TO JEDA</span><h2 id="welcome-title">A little more certainty before you connect.</h2><p>Check suspicious crypto messages with a privacy-first assistant built to help you pause, spot red flags, and choose a safer next step.</p>
    <ol class="onboarding-steps"><li><span>01</span><div><strong>Paste, never connect</strong><p>This tool only reads text. It never connects to your wallet.</p></div></li><li><span>02</span><div><strong>Check your browser</strong><p><strong>${esc(chromeSetupStatus())}</strong><br>Enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input and restart for on-device analysis.</p></div></li><li><span>03</span><div><strong>Choose what leaves your device</strong><p>If the local model is unavailable, standard mode falls back to Firebase AI Logic in the cloud; long inputs and a second opinion use it too. Turn on Privacy mode to keep checks on-device. Every result shows where it ran.</p></div></li></ol>
    <button class="btn-primary full" id="close-onboarding-cta">Start checking messages ${icon('arrow')}</button><div class="onboarding-foot">${icon('lock')} Never share a recovery phrase with anyone, not even this tool.</div></div></section></div>`
}
function bind() {
  document.querySelectorAll<HTMLElement>('[data-page]').forEach(el=>el.addEventListener('click',(e)=>{e.preventDefault();menuOpen=false;window.scrollTo({top:0});page=el.dataset.page as typeof page;if(page==='history') void refreshHistory();render();pendingFocus=null;document.getElementById('main-content')?.focus({preventScroll:true})}))
  document.querySelectorAll<HTMLElement>('[data-jump]').forEach(el=>el.addEventListener('click',()=>{const id=el.dataset.jump!;if(page!=='scan'||menuOpen){page='scan';menuOpen=false;render()}const target=document.getElementById(id);target?.scrollIntoView({behavior:'smooth',block:'start'});if(id==='check')window.setTimeout(()=>document.querySelector<HTMLTextAreaElement>('#message-input')?.focus({preventScroll:true}),450);else if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true})}}))
  document.querySelector('#theme-toggle')?.addEventListener('click',(e)=>{
    const rect=(e.currentTarget as HTMLElement).getBoundingClientRect()
    const x=rect.left+rect.width/2,y=rect.top+rect.height/2
    const root=document.documentElement
    root.style.setProperty('--ink-x',`${x}px`)
    root.style.setProperty('--ink-y',`${y}px`)
    root.style.setProperty('--ink-r',`${Math.ceil(Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y)))}px`)
    const flip=()=>{dark=!dark;render()}
    const transition=(document as Document&{startViewTransition?:(callback:()=>void)=>unknown}).startViewTransition
    if(transition&&!matchMedia('(prefers-reduced-motion: reduce)').matches)transition.call(document,flip);else flip()
  })
  document.querySelectorAll<HTMLElement>('[data-tour]').forEach(el=>el.addEventListener('click',()=>{
    tourStep=el.dataset.tour as TourStep
    result=null;previousResult=null;errorMessage=''
    if(tourStep==='eval'){page='evaluation';window.scrollTo({top:0});render();pendingFocus=null;document.getElementById('main-content')?.focus({preventScroll:true});toast('Tour 4 of 4: the synthetic evaluation report.');return}
    if(tourStep==='scam'){privacyOnly=false;input=examples[0].text;toast('Tour 1 of 4: press Check this message.')}
    else if(tourStep==='guard'){privacyOnly=true;input=judgeSeedPhrase;toast('Tour 2 of 4: blocked before any model ran.')}
    else{privacyOnly=false;input=examples[6].text;toast('Tour 3 of 4: press Check, then look for the second-opinion offer.')}
    syncGuard();render()
    document.querySelector('.input-panel')?.scrollIntoView({behavior:'smooth',block:'start'})
    document.querySelector<HTMLTextAreaElement>('#message-input')?.focus({preventScroll:true})
  }))
  document.querySelector<HTMLTextAreaElement>('#message-input')?.addEventListener('input',e=>{input=(e.target as HTMLTextAreaElement).value;const wasBlocked=guardActive;syncGuard();if(wasBlocked&&!guardActive){render();return}const count=document.querySelector('#char-count');if(count)count.textContent=`${input.length} / 6000`;const button=document.querySelector<HTMLButtonElement>('#analyze');if(button)button.disabled=input.trim().length<10||findSecrets(input).length>0||busy;if(findSecrets(input).length)render()})
  document.querySelectorAll<HTMLElement>('[data-example]').forEach(el=>el.addEventListener('click',()=>{const i=Number(el.dataset.example);if(Number.isInteger(i)&&examples[i]){input=examples[i].text;result=null;previousResult=null;errorMessage='';tourStep=null;syncGuard()}render();document.querySelector<HTMLTextAreaElement>('#message-input')?.focus({preventScroll:true})}))
  document.querySelector('#menu-toggle')?.addEventListener('click',()=>{menuOpen=!menuOpen;render()})
  document.querySelector<HTMLInputElement>('#privacy-toggle')?.addEventListener('change',e=>{privacyOnly=(e.target as HTMLInputElement).checked;render()})
  document.querySelector<HTMLInputElement>('#save-raw')?.addEventListener('change',e=>{saveRaw=(e.target as HTMLInputElement).checked})
  document.querySelector('#redact-input')?.addEventListener('click',()=>{input=redactSecrets(input);syncGuard();render();document.querySelector<HTMLTextAreaElement>('#message-input')?.focus({preventScroll:true})})
  document.querySelector('#analyze')?.addEventListener('click',()=>void runAnalysis())
  document.querySelector('#escalate')?.addEventListener('click',()=>{if(confirm('Send this message to Firebase AI Logic for a cloud second opinion? The message leaves this device.')) void runAnalysis('ONLY_IN_CLOUD','User requested a cloud second opinion')})
  document.querySelector('#cloud-fallback')?.addEventListener('click',()=>{if(confirm('The message will be sent to Firebase AI Logic in the cloud. Continue?'))void runAnalysis('ONLY_IN_CLOUD','User approved cloud fallback')})
  document.querySelector('#copy-summary')?.addEventListener('click',()=>{if(result)void navigator.clipboard.writeText(`Jeda safe summary\nRisk: ${riskName(result.verdict.risk)}\n${result.verdict.summary}\nRecommended: ${result.verdict.recommendation}\nRan: ${result.source} (${result.latencyMs} ms)\nNo message text included. Heuristic guidance, not a guarantee.`).then(()=>toast('Safe summary copied'))})
  document.querySelector('#clear-history')?.addEventListener('click',()=>void doClearHistory())
  document.querySelector('#run-eval')?.addEventListener('click',()=>void runEvaluation())
  document.querySelector('#download-eval')?.addEventListener('click',downloadEvaluation)
  for(const id of ['close-onboarding','close-onboarding-cta'])document.querySelector(`#${id}`)?.addEventListener('click',dismissOnboarding)
}
function toast(message:string){const el=document.createElement('div');el.className='toast';el.textContent=message;document.body.append(el);setTimeout(()=>el.remove(),2400)}
async function runAnalysis(forcedMode?: 'ONLY_IN_CLOUD', overrideReason?: string) {
  const secrets=findSecrets(input);if(secrets.length){syncGuard();input=redactSecrets(input,secrets);syncGuard();errorMessage='A possible recovery phrase or private key was detected. It was redacted and not sent or stored.';render();return}
  const selected=getEffectiveRoute(input.length,privacyOnly)
  const mode=forcedMode??selected.mode
  const reason=overrideReason??(mode==='ONLY_IN_CLOUD'?selected.reason:mode==='ONLY_ON_DEVICE'?selected.reason:'Device preferred by Firebase hybrid inference')
  if(mode!=='ONLY_ON_DEVICE'&&!appCheckReady){cloudFallbackAvailable=false;errorMessage='Cloud-capable inference is disabled until Firebase App Check is configured.';render();return}
  cloudFallbackAvailable=false
  busy=true;errorMessage='';checkingMode=mode;checkingStartedAt=performance.now();lifecycle=mode==='ONLY_IN_CLOUD'?'Preparing cloud model':'Preparing on-device model';render();startCheckingTimer()
  try {
    const analyzed=await analyze(input,mode,(progress)=>{
      lifecycle=`Downloading on-device model ${Math.round(progress*100)}%`
      const status=document.querySelector('#inference-status')
      if(status)status.textContent=lifecycle
      const checking=document.querySelector('#checking-lifecycle')
      if(checking)checking.textContent=lifecycle
      const diagnostics=document.querySelector('#model-status')
      if(diagnostics)diagnostics.textContent=lifecycle
    })
    const newResult={...analyzed,reason:analyzed.source==='cloud'&&mode==='PREFER_ON_DEVICE'?'Local model unavailable; SDK cloud fallback':reason}
    previousResult=forcedMode==='ONLY_IN_CLOUD'?result:null
    result=newResult
    if(newResult.source==='on-device'||newResult.source==='cloud'){runs[newResult.source]++;lastPath=newResult.source}
    animateResult=true
    lifecycle=analyzed.source==='on-device'?'Ready':'Unavailable or cloud selected'
    try { await saveHistory({risk:result.verdict.risk,source:result.source,latencyMs:result.latencyMs,...(saveRaw?{raw:input}:{})}) } catch { /* History is non-blocking; the analysis remains available. */ }
  } catch(error) {
    const message=error instanceof Error?error.message:'Analysis failed.'
    lifecycle=message.toLowerCase().includes('device')?'Unavailable':'Error'
    const failedSource=(error as Error&{inferenceSource?:string}).inferenceSource
    cloudFallbackAvailable=!forcedMode&&currentPolicy.escalationEnabled&&appCheckReady&&(mode==='ONLY_ON_DEVICE'||(mode==='PREFER_ON_DEVICE'&&failedSource==='on-device'))
    errorMessage=cloudFallbackAvailable?(mode==='ONLY_ON_DEVICE'?'The local model is unavailable. Your message was not sent. You can explicitly approve one cloud fallback below.':'The on-device response could not be validated. Your message was not sent to cloud. You can explicitly approve one cloud second opinion below.'):message
  } finally {window.clearInterval(checkingTimer);busy=false;render();animateResult=false}
}
async function refreshHistory(){try{historyItems=await loadHistory()}catch{errorMessage='History could not be loaded. Configure Firebase Auth and Firestore rules.'}}
async function doClearHistory(){if(!confirm('Clear all saved check history for this anonymous account?'))return;try{await clearHistory();historyItems=[];render()}catch{errorMessage='History could not be cleared.';render()}}
function safeEvaluationError(error:unknown){
  const message=error instanceof Error?error.message.toLowerCase():''
  if(message.includes('device')||message.includes('prompt'))return 'On-device model unavailable'
  if(message.includes('app check'))return 'App Check required'
  if(message.includes('json')||message.includes('verdict')||message.includes('response'))return 'Invalid model response'
  return 'Request failed'
}
function downloadEvaluation(){
  if(!evaluationReport)return
  const blob=new Blob([JSON.stringify(evaluationReport,null,2)],{type:'application/json'})
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url
  link.download='jeda-evaluation-results.json'
  link.click()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}
async function runEvaluation(){
  if(!confirm('Run 40 synthetic cases through PREFER_ON_DEVICE and ONLY_IN_CLOUD? This sends synthetic text in the cloud-only pass, for any preferred-mode fallback, and for each low-confidence on-device second opinion (up to 40 more requests). Continue?'))return
  const button=document.querySelector<HTMLButtonElement>('#run-eval')
  if(button){button.disabled=true;button.textContent='Preparing preferred on-device model…'}
  try {
    let initializationError:string|null=null
    try {
      await initializeOnDevice('PREFER_ON_DEVICE',(progress)=>{if(button)button.textContent=`Preparing on-device model ${Math.round(progress*100)}%…`})
    } catch(error) { initializationError=safeEvaluationError(error) }
    const response=await fetch('/eval/cases.json')
    if(!response.ok)throw new Error('Evaluation cases could not be loaded.')
    const cases=await response.json() as {id:string;label:'scam'|'benign';category:string;text:string}[]
    const scamCount=cases.filter(item=>item.label==='scam').length
    const benignCount=cases.filter(item=>item.label==='benign').length
    const scamCategories=new Set(cases.filter(item=>item.label==='scam').map(item=>item.category))
    if(cases.length!==40||scamCount!==20||benignCount!==20||scamCategories.size<5)throw new Error('The evaluation corpus must contain 40 cases: 20 scam and 20 benign across at least five scam categories.')
    const outputs:EvaluationOutput[]=[]
    const modes=['PREFER_ON_DEVICE','ONLY_IN_CLOUD'] as const
    let escalationCount=0
    let baselineRuns=0
    for(const item of cases){
      for(const mode of modes){
        baselineRuns++
        const stage=mode==='PREFER_ON_DEVICE'?'preferred':'cloud-only'
        if(button)button.textContent=`Evaluating ${baselineRuns} / ${cases.length*modes.length} baseline runs; ${escalationCount} second opinions…`
        try{
          const out=await analyze(item.text,mode)
          const actual=['high','critical'].includes(out.verdict.risk)?'scam':'benign'
          const lowConfidence=isLowConfidence(out.verdict,currentPolicy.lowConfidenceThreshold)
          outputs.push({id:item.id,category:item.category,mode,stage,path:out.source,expected:item.label,actual,latencyMs:out.latencyMs,uncertainty:out.verdict.uncertainty,lowConfidence})
          if(mode==='PREFER_ON_DEVICE'&&out.source==='on-device'&&lowConfidence){
            escalationCount++
            try{
              const secondOpinion=await analyze(item.text,'ONLY_IN_CLOUD')
              const secondActual=['high','critical'].includes(secondOpinion.verdict.risk)?'scam':'benign'
              outputs.push({id:item.id,category:item.category,mode:'ONLY_IN_CLOUD',stage:'second-opinion',path:secondOpinion.source,expected:item.label,actual:secondActual,latencyMs:secondOpinion.latencyMs,uncertainty:secondOpinion.verdict.uncertainty,lowConfidence:isLowConfidence(secondOpinion.verdict,currentPolicy.lowConfidenceThreshold)})
            }catch(error){outputs.push({id:item.id,category:item.category,mode:'ONLY_IN_CLOUD',stage:'second-opinion',path:'unknown',expected:item.label,error:safeEvaluationError(error)})}
          }
        }catch(error){outputs.push({id:item.id,category:item.category,mode,stage,path:'unknown',expected:item.label,error:safeEvaluationError(error)})}
      }
    }
    const summarize=(rows:EvaluationOutput[]):EvaluationMetrics=>{
      const successful=rows.filter(row=>row.actual!==undefined&&row.error===undefined)
      const positive=successful.filter(row=>row.expected==='scam')
      const falseNegatives=positive.filter(row=>row.actual==='benign').length
      const times=successful.map(row=>row.latencyMs!).sort((a,b)=>a-b)
      const middle=Math.floor(times.length/2)
      const p50=times.length?(times.length%2?times[middle]:(times[middle-1]+times[middle])/2):null
      return{cases:rows.length,completed:successful.length,errors:rows.length-successful.length,accuracy:successful.length?successful.filter(row=>row.expected===row.actual).length/successful.length:null,falseNegativeRate:positive.length?falseNegatives/positive.length:null,p50LatencyMs:p50}
    }
    const preferredRows=outputs.filter(row=>row.stage==='preferred')
    const cloudOnlyRows=outputs.filter(row=>row.stage==='cloud-only')
    const fallbackCount=preferredRows.filter(row=>row.path==='cloud').length
    evaluationReport={generatedAt:new Date().toISOString(),firebaseSdk:'13.4.0',model:CLOUD_MODEL,browser:navigator.userAgent,syntheticOnly:true,caseCount:cases.length,initializationError,classificationRule:'high and critical count as scam; low and medium count as benign',modeResults:{preferred:summarize(preferredRows),cloudOnly:summarize(cloudOnlyRows)},actualSource:{onDevice:summarize(outputs.filter(row=>row.path==='on-device')),cloud:summarize(outputs.filter(row=>row.path==='cloud')),unknown:summarize(outputs.filter(row=>row.path==='unknown'))},fallbackCount,fallbackRate:preferredRows.length?fallbackCount/preferredRows.length:null,escalationCount,escalationRate:preferredRows.length?escalationCount/preferredRows.length:null,outputs}
    page='evaluation'
    toast('Evaluation complete. Review the measured report before downloading or recording it.')
  }catch(error){toast(error instanceof Error?`Evaluation could not run: ${error.message}`:'Evaluation could not run. Confirm Firebase and App Check setup.')}finally{render()}
}
app.addEventListener('focusin',()=>{pendingFocus=null})
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!onboardingDismissed){dismissOnboarding();return}if(menuOpen){menuOpen=false;render();document.querySelector<HTMLButtonElement>('#menu-toggle')?.focus();return}}})
document.addEventListener('keydown',e=>{const t=e.target as HTMLElement;if(!onboardingDismissed)return;if(e.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(t.tagName)&&page==='scan'){e.preventDefault();document.getElementById('check')?.scrollIntoView({behavior:'smooth',block:'start'});window.setTimeout(()=>document.querySelector<HTMLTextAreaElement>('#message-input')?.focus({preventScroll:true}),450)}})
void (async()=>{render();currentPolicy=await getPolicy();render();if(configured)void loadHistory().then(items=>{historyItems=items;render()}).catch(()=>{})})()
