// Animated hero dashboard. Every value is synthetic demo data.
// The element is built once and re-attached after each app re-render, so the canvas animation keeps running without restarting.

const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '1', '0', '0', '0', '1', '0'],
  ';': ['0', '0', '0', '0', '0', '0', '0'],
}

// The model returns flag categories with explanations only, so no per-signal severity is shown here.
const SIGNALS = [
  { label: 'Urgency & pressure', value: 90, level: 'Flagged' },
  { label: 'Fake airdrop', value: 90, level: 'Flagged' },
  { label: 'Approval drainer', value: 90, level: 'Flagged' },
]
const STEPS = ['Secret check', 'Read the signals', 'Explain each flag', 'Offer a safer step']
const STEP_STATE = { done: 'Passed', active: 'Running', next: 'Next' }

type Palette = { ink: string; muted: string; orange: string; blue: string; faint: string }

class Surface {
  ctx: CanvasRenderingContext2D
  w = 0
  h = 0
  constructor(public canvas: HTMLCanvasElement, onResize: () => void) {
    this.ctx = canvas.getContext('2d')!
    new ResizeObserver(() => { this.resize(); onResize() }).observe(canvas)
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = rect.width
    this.h = rect.height
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr))
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr))
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  clear() { this.ctx.clearRect(0, 0, this.w, this.h) }
  dot(x: number, y: number, r: number, color: string, alpha = 1) {
    const c = this.ctx
    c.globalAlpha = alpha
    c.fillStyle = color
    c.beginPath()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.fill()
    c.globalAlpha = 1
  }
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v))
const pad2 = (n: number) => String(n).padStart(2, '0')

function matrixUnits(text: string) {
  let units = 0
  for (const ch of text) units += (GLYPHS[ch]?.[0].length ?? 3) + 1
  return Math.max(1, units - 1)
}

function drawMatrix(s: Surface, text: string, dot: number, x0: number, y0: number, p: Palette, accentIndexes: Set<number> = new Set()) {
  let x = x0
  ;[...text].forEach((ch, index) => {
    const glyph = GLYPHS[ch]
    if (!glyph) { x += dot * 4; return }
    const color = accentIndexes.has(index) ? p.orange : p.ink
    glyph.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const lit = row[c] === '1'
        s.dot(x + c * dot + dot / 2, y0 + r * dot + dot / 2, dot * 0.34, lit ? color : p.faint)
      }
    })
    x += (glyph[0].length + 1) * dot
  })
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  const dark = document.documentElement.dataset.theme === 'dark'
  return {
    ink: v('--ink', '#14161c'),
    muted: v('--muted', '#646a79'),
    orange: v('--brand-orange', '#ff7a30'),
    blue: dark ? '#6f95ff' : v('--brand-blue', '#3b6ef5'),
    faint: dark ? 'rgba(255,255,255,.11)' : 'rgba(20,22,28,.11)',
  }
}

const walletIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>'

function template() {
  const listRow = (i: number, label: string, value: number, right: string, delay: number) =>
    `<li style="--w:${value};--d:${delay}ms"><span class="m-num">${i + 1}</span><span class="m-label">${label}</span><span class="dot-bar" aria-hidden="true"></span><span class="m-val">${right}</span></li>`
  return `<div class="mdash" role="region" aria-label="Animated demo dashboard. All values are synthetic.">
    <div class="mdash-head">
      <span class="mdash-brand"><span class="logo-mark" aria-hidden="true"><i></i><i></i></span>jeda</span>
      <span class="mdash-sub">Demo workspace · simulated, synthetic data</span>
      <span class="mdash-live"><span class="live-dot" aria-hidden="true"></span>Sample data</span>
    </div>
    <div class="mdash-grid">
      <article class="mcard m-b">
        <h3>Now checking</h3>
        <div class="m-sender">
          <span class="sender-tile">${walletIcon}<span class="sender-flag" aria-label="Suspicious sender">!</span></span>
          <div class="sender-meta"><strong>Wallet Rewards</strong><small>Direct message, on device</small><code class="m-chars">0 / 214 characters</code></div>
        </div>
        <canvas class="cv-scan" aria-hidden="true"></canvas>
      </article>
      <article class="mcard m-d">
        <h3>Fake deadline in the message</h3>
        <div class="m-d-body">
          <div class="m-d-count">
            <canvas class="cv-countdown" aria-hidden="true"></canvas>
            <p class="m-caption">The sender wants you to rush. Jeda pauses.</p>
          </div>
          <ol class="m-steps" aria-label="Analysis steps">${STEPS.map(s => `<li><span class="step-dot" aria-hidden="true"></span><span class="step-label">${s}</span><span class="step-state">Next</span></li>`).join('')}</ol>
        </div>
      </article>
      <article class="mcard m-f">
        <h3>Signals found</h3>
        <ol class="m-list m-signals">${SIGNALS.map((s, i) => listRow(i, s.label, s.value, s.level, i * 90)).join('')}</ol>
        <p class="m-caption m-foot">Each flag comes with a plain-language explanation of the trick.</p>
      </article>
      <article class="mcard m-g m-verdict">
        <h3>Verdict</h3>
        <div class="m-verdict-top"><span class="m-risk"><span class="m-risk-dot" aria-hidden="true"></span>High risk</span><code class="m-source">inferenceSource: on-device</code></div>
        <p class="m-next"><span>Safer next step</span>Don&apos;t connect your wallet. Open the project&apos;s official site yourself and check the offer there.</p>
      </article>
    </div>
  </div>`
}

let root: HTMLElement | null = null
let surfaces: Record<'scan' | 'countdown', Surface> | null = null
let refs: { chars: HTMLElement; steps: HTMLElement[]; signals: HTMLElement[] } | null = null
let raf = 0
let startAt = 0
let lastFrame = 0
let visible = true
const textCache = new Map<HTMLElement, string>()
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

function setText(el: HTMLElement, text: string) {
  if (textCache.get(el) === text) return
  textCache.set(el, text)
  el.textContent = text
}

function forceFrame() {
  lastFrame = 0
  requestFrame()
}

function build() {
  const host = document.createElement('div')
  host.innerHTML = template()
  const el = host.firstElementChild as HTMLElement
  const canvas = (cls: string) => new Surface(el.querySelector<HTMLCanvasElement>(`.${cls}`)!, forceFrame)
  surfaces = { scan: canvas('cv-scan'), countdown: canvas('cv-countdown') }
  refs = {
    chars: el.querySelector('.m-chars')!,
    steps: [...el.querySelectorAll<HTMLElement>('.m-steps li')],
    signals: [...el.querySelectorAll<HTMLElement>('.m-signals li')],
  }
  new IntersectionObserver(entries => {
    visible = entries.some(e => e.isIntersecting)
    if (visible) forceFrame()
  }).observe(el)
  new MutationObserver(forceFrame).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-ready')))
  return el
}

function drawScan(s: Surface, t: number, progress: number, p: Palette) {
  const step = 8
  const cols = Math.max(1, Math.floor(s.w / step))
  const rows = Math.max(1, Math.floor(s.h / step))
  const gx = s.w / cols
  const gy = s.h / rows
  const r = Math.min(gx, gy) * 0.3
  const head = progress * cols
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = (i + 0.5) * gx
      const y = (j + 0.5) * gy
      if (i < head) {
        const nearHead = clamp(1 - (head - i) / 8)
        s.dot(x, y, r, p.blue, 0.35 + 0.65 * Math.max(nearHead, 0.25))
      } else {
        const shimmer = 0.5 + 0.5 * Math.sin(i * 0.9 + j * 1.3 + t * 2.2)
        s.dot(x, y, r * 0.85, p.faint, 0.45 + 0.55 * shimmer)
      }
    }
  }
}

function drawCountdown(s: Surface, t: number, p: Palette) {
  const total = 12 * 60
  const left = total - 1 - (Math.floor(t) % total)
  const blink = t % 1 < 0.5
  const text = `${pad2(Math.floor(left / 60))}${blink ? ':' : ';'}${pad2(left % 60)}`
  const dot = Math.min(s.h / 7, s.w / matrixUnits('00:00'))
  const secondFlash = t % 1 < 0.3 ? new Set([4]) : undefined
  drawMatrix(s, text, dot, 0, (s.h - dot * 7) / 2, p, secondFlash)
}

function draw(t: number) {
  if (!surfaces || !refs) return
  const p = readPalette()
  for (const s of Object.values(surfaces)) if (s.w > 0) s.clear()

  const cycle = 7
  const progress = clamp((t % cycle) / (cycle - 1.5))
  if (surfaces.scan.w) drawScan(surfaces.scan, t, progress, p)
  setText(refs.chars, `${Math.round(214 * progress)} / 214 characters`)

  if (surfaces.countdown.w) drawCountdown(surfaces.countdown, t, p)

  const stepIndex = Math.floor(t / 1.5) % (STEPS.length + 2)
  refs.steps.forEach((li, i) => {
    const state = i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'next'
    if (li.dataset.state !== state) {
      li.dataset.state = state
      li.querySelector<HTMLElement>('.step-state')!.textContent = STEP_STATE[state]
    }
  })
  const activeSignal = Math.floor(t / 2.2) % refs.signals.length
  refs.signals.forEach((li, i) => li.classList.toggle('is-active', i === activeSignal))
}

function frame(now: number) {
  raf = 0
  if (!root?.isConnected) return
  const still = reducedMotion.matches
  if (visible && !document.hidden && (lastFrame === 0 || now - lastFrame >= 33)) {
    lastFrame = now
    draw(still ? 60 : (now - startAt) / 1000)
  }
  if (!still) requestFrame()
}

function requestFrame() {
  if (!raf) raf = requestAnimationFrame(frame)
}

export function mountMotionDashboard(slot: HTMLElement) {
  if (!root) {
    root = build()
    startAt = performance.now()
  }
  slot.appendChild(root)
  forceFrame()
}
