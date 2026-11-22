export type Risk = 'low' | 'medium' | 'high' | 'critical'
export type InferenceModeName = 'PREFER_ON_DEVICE' | 'ONLY_ON_DEVICE' | 'PREFER_IN_CLOUD' | 'ONLY_IN_CLOUD'
export type Category = 'fake_airdrop' | 'approval_drainer' | 'support_impersonation' | 'recovery_scam' | 'urgency_pressure' | 'fake_giveaway' | 'other'
export type Flag = { category: Category; explanation: string }
export type Verdict = { risk: Risk; summary: string; flags: Flag[]; recommendation: string; uncertainty: number }
export const DEFAULTS = { defaultMode: 'PREFER_ON_DEVICE' as InferenceModeName, maxOnDeviceChars: 1800, escalationEnabled: true, lowConfidenceThreshold: 2 }

export function isInferenceModeName(value: string): value is InferenceModeName {
  return ['PREFER_ON_DEVICE', 'ONLY_ON_DEVICE', 'PREFER_IN_CLOUD', 'ONLY_IN_CLOUD'].includes(value)
}

export function routeInput(length: number, privacyOnly: boolean, max = DEFAULTS.maxOnDeviceChars, defaultMode: InferenceModeName = DEFAULTS.defaultMode) {
  if (privacyOnly) return { mode: 'ONLY_ON_DEVICE' as const, reason: 'Privacy mode is on' }
  if (length > max) return { mode: 'ONLY_IN_CLOUD' as const, reason: 'Input exceeds the on-device length limit' }
  const reason = defaultMode === 'PREFER_ON_DEVICE'
    ? 'Preferred on-device; SDK may use cloud fallback if unavailable'
    : `Remote Config default: ${defaultMode.replaceAll('_', ' ').toLowerCase()}`
  return { mode: defaultMode, reason }
}

export function isLowConfidence(value: unknown, threshold = DEFAULTS.lowConfidenceThreshold): boolean {
  if (!isVerdict(value)) return true
  return value.risk === 'medium' || value.flags.length < threshold || value.uncertainty >= 0.55
}

export function isVerdict(value: unknown): value is Verdict {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const categories = ['fake_airdrop', 'approval_drainer', 'support_impersonation', 'recovery_scam', 'urgency_pressure', 'fake_giveaway', 'other']
  return ['low', 'medium', 'high', 'critical'].includes(String(v.risk)) &&
    typeof v.summary === 'string' && v.summary.length <= 350 &&
    typeof v.recommendation === 'string' && v.recommendation.length <= 500 &&
    typeof v.uncertainty === 'number' && v.uncertainty >= 0 && v.uncertainty <= 1 &&
    Array.isArray(v.flags) && v.flags.length <= 8 && v.flags.every((f) => !!f && typeof f === 'object' && categories.includes(String((f as Flag).category)) && typeof (f as Flag).explanation === 'string' && (f as Flag).explanation.length <= 250)
}

export function parseVerdict(text: string): Verdict {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try { parsed = JSON.parse(cleaned) } catch {
    const start = cleaned.indexOf('{'), end = cleaned.lastIndexOf('}')
    if (start < 0 || end <= start) throw new Error('The model returned unreadable JSON. Try again or request a cloud opinion.')
    try { parsed = JSON.parse(cleaned.slice(start, end + 1)) } catch { throw new Error('The model returned invalid JSON. Try again or request a cloud opinion.') }
  }
  if (!isVerdict(parsed)) throw new Error('The model response did not match the safe verdict format. Try again.')
  return parsed
}
