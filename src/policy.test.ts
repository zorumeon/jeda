import { describe, expect, it } from 'vitest'
import { DEFAULTS, isInferenceModeName, isLowConfidence, isVerdict, parseVerdict, routeInput } from './policy'
import syntheticCases from '../public/eval/cases.json'
const valid = { risk:'high', summary:'Requests an unsafe wallet approval.', flags:[{category:'approval_drainer',explanation:'Requests unlimited token spending.'}], recommendation:'Do not approve; verify the spender independently.', uncertainty:0.2 }
describe('routing policy',()=>{
 it('prefers the hybrid mode for short messages',()=>expect(routeInput(100,false)).toEqual({mode:'PREFER_ON_DEVICE',reason:'Preferred on-device; SDK may use cloud fallback if unavailable'}))
 it('routes oversized messages to explicit cloud mode',()=>expect(routeInput(DEFAULTS.maxOnDeviceChars+1,false).mode).toBe('ONLY_IN_CLOUD'))
 it('never selects cloud when privacy mode is enabled',()=>expect(routeInput(9000,true).mode).toBe('ONLY_ON_DEVICE'))
 it('respects the configured cloud preference for short inputs',()=>expect(routeInput(100,false,1800,'PREFER_IN_CLOUD').mode).toBe('PREFER_IN_CLOUD'))
 it('recognizes all four Firebase inference modes',()=>expect(['PREFER_ON_DEVICE','ONLY_ON_DEVICE','PREFER_IN_CLOUD','ONLY_IN_CLOUD'].every(isInferenceModeName)).toBe(true))
 it('rejects unknown inference modes',()=>expect(isInferenceModeName('ON_DEVICE')).toBe(false))
})
describe('verdict validation',()=>{
 it('accepts a bounded schema',()=>expect(isVerdict(valid)).toBe(true))
 it('rejects unknown risk values and oversized summaries',()=>expect(isVerdict({...valid,risk:'certain'})).toBe(false))
 it('parses fenced JSON safely',()=>expect(parseVerdict('```json\n'+JSON.stringify(valid)+'\n```')).toEqual(valid))
 it('rejects malformed JSON',()=>expect(()=>parseVerdict('not json')).toThrow())
 it('flags ambiguous model outcomes for review',()=>expect(isLowConfidence({...valid,flags:[]})).toBe(true))
 it('treats medium risk as low confidence even with many flags',()=>expect(isLowConfidence({...valid,risk:'medium',flags:[...valid.flags,...valid.flags]})).toBe(true))
 it('uses the objective flag-count and uncertainty thresholds',()=>expect(isLowConfidence({...valid,risk:'low',flags:[...valid.flags,{category:'urgency_pressure',explanation:'Creates pressure.'}],uncertainty:0.54})).toBe(false))
 it('flags uncertainty at the configured boundary',()=>expect(isLowConfidence({...valid,uncertainty:0.55})).toBe(true))
 it('treats an invalid verdict as low confidence',()=>expect(isLowConfidence(null)).toBe(true))
})
describe('synthetic evaluation corpus',()=>{
 it('contains 40 labeled cases with at least five scam categories',()=>{
  const scams=syntheticCases.filter(item=>item.label==='scam')
  expect(syntheticCases).toHaveLength(40)
  expect(scams).toHaveLength(20)
  expect(syntheticCases.filter(item=>item.label==='benign')).toHaveLength(20)
  expect(new Set(scams.map(item=>item.category)).size).toBeGreaterThanOrEqual(5)
 })
})
