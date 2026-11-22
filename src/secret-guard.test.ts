import { describe, expect, it } from 'vitest'
import { findSecrets, redactSecrets } from './secret-guard'
import { examples } from './examples'
import syntheticCases from '../public/eval/cases.json'

// First 28 words of the BIP-39 English list. Only used as realistic-looking test input; none of these are real wallets.
const WORDS = 'abandon ability able about above absent absorb abstract absurd abuse access accident acid acoustic acquire across act action actor actress actual adapt add addict address adjust admit adult'.split(' ')
const words = (count: number) => WORDS.slice(0, count)
const kinds = (text: string) => findSecrets(text).map((match) => match.kind)

// Layouts wallets use when they display a recovery phrase.
const LAYOUTS: Array<[name: string, format: (word: string, index: number) => string, separator: string]> = [
  ['dot-numbered', (w, i) => `${i + 1}. ${w}`, ' '],
  ['paren-numbered', (w, i) => `(${i + 1}) ${w}`, ' '],
  ['bracket-numbered, one-per-line', (w, i) => `${i + 1}) ${w}`, '\n'],
  ['colon-numbered with leading zero', (w, i) => `${String(i + 1).padStart(2, '0')}: ${w}`, '\n'],
  ['numbered-without-space', (w, i) => `${i + 1}.${w}`, ' '],
  ['comma-separated', (w) => w, ', '],
  ['semicolon-separated', (w) => w, '; '],
  ['one-per-line', (w) => w, '\n'],
]

describe('recovery phrase detection', () => {
  it.each([12, 15, 18, 21, 24])('blocks a %i-word phrase (every BIP-39 length)', (count) => {
    expect(kinds(words(count).join(' '))).toEqual(['recovery phrase'])
  })
  it('does not flag eleven plain words', () => expect(findSecrets(words(11).join(' '))).toHaveLength(0))
  it('blocks phrases longer than 24 words and redacts all of them', () => {
    const text = words(28).join(' ')
    expect(redactSecrets(text)).toBe('[RECOVERY PHRASE REDACTED]')
  })
  it('blocks phrases that are case-insensitive', () => expect(kinds(words(12).join(' ').toUpperCase())).toEqual(['recovery phrase']))
  for (const [name, format, separator] of LAYOUTS) {
    it(`blocks a ${name} phrase`, () => expect(kinds(words(12).map(format).join(separator))).toEqual(['recovery phrase']))
  }
  it('still blocks a phrase when extra words surround it', () => {
    const text = `my seed is ${words(12).join(' ')} please help`
    expect(findSecrets(text)).toHaveLength(1)
    expect(redactSecrets(text)).not.toContain('abandon')
    expect(redactSecrets(text)).not.toContain('accident')
  })
  it('keeps text before and after the phrase', () => {
    const redacted = redactSecrets(`Hello. ${words(24).join(' ')}. Thanks.`)
    expect(redacted).toBe('Hello. [RECOVERY PHRASE REDACTED]. Thanks.')
  })
  it('does not flag ordinary short scam-style messages', () => {
    expect(findSecrets('Hello, this is Alex from support. We noticed unusual activity. Please verify your wallet now.')).toHaveLength(0)
    expect(findSecrets('Please verify the support team through the official website before approving anything')).toHaveLength(0)
  })
})

describe('private key detection', () => {
  it('detects a 0x-prefixed 64-hex value', () => expect(kinds(`key 0x${'a'.repeat(64)}`)).toEqual(['private key']))
  it('detects a bare 64-hex value', () => expect(kinds('b'.repeat(64))).toEqual(['private key']))
  it('also blocks a 64-hex transaction hash, which is indistinguishable from a key', () => expect(kinds(`tx 0x${'ab12'.repeat(16)}`)).toEqual(['private key']))
  it('does not flag shorter hex values such as addresses', () => expect(findSecrets(`0x${'a'.repeat(40)}`)).toHaveLength(0))
  it('redacts matches without retaining their contents', () => {
    const text = `bad ${'b'.repeat(64)} end`
    expect(redactSecrets(text)).toBe('bad [PRIVATE KEY REDACTED] end')
  })
})

describe('combined and edge inputs', () => {
  it('reports a key and a phrase separately and redacts both', () => {
    const text = `k ${'c'.repeat(64)} ${words(12).join(' ')}`
    expect(kinds(text)).toEqual(['private key', 'recovery phrase'])
    expect(redactSecrets(text)).toBe('k [PRIVATE KEY REDACTED] [RECOVERY PHRASE REDACTED]')
  })
  it('returns non-overlapping matches', () => {
    const matches = findSecrets(`${'d'.repeat(64)} ${words(24).join(' ')}`)
    for (let i = 1; i < matches.length; i++) expect(matches[i].start).toBeGreaterThanOrEqual(matches[i - 1].end)
  })
  it('handles an empty string', () => expect(findSecrets('')).toEqual([]))
  it('stays fast on very long adversarial input', () => {
    const started = Date.now()
    findSecrets('abc,'.repeat(50000) + '1')
    findSecrets('abc 1 '.repeat(40000))
    expect(Date.now() - started).toBeLessThan(2000)
  })
})

describe('wordlist matching and false positives', () => {
  // Each of these used to be blocked as a "recovery phrase" because it has 12+ uninterrupted words of 3-8 letters.
  const PROSE = [
    'We recovered your lost crypto. Pay a refundable 0.2 ETH gas deposit first and our recovery agent will return your funds today.',
    'Please verify the contract address from the official project website before you approve',
    'Never share your recovery phrase with anyone claiming support from this wallet team',
    'This airdrop message asks users like you whose wallets hold tokens right now to approve spending',
  ]
  it.each(PROSE)('does not flag ordinary prose: %s', (text) => expect(findSecrets(text)).toHaveLength(0))
  it('does not flag any built-in example message', () => {
    for (const example of examples) expect(findSecrets(example.text), example.label).toHaveLength(0)
  })
  it('does not flag any message in the synthetic evaluation corpus', () => {
    for (const item of syntheticCases) expect(findSecrets(item.text), item.id).toHaveLength(0)
  })
  it('does not flag twelve or more plain words that are not on the wordlist', () => {
    expect(findSecrets('zxcvbn qwerty plugin kernel module router socket thread buffer pixel widget cursor browser')).toHaveLength(0)
  })
  const withTypos = (count: number) => words(12).map((w, i) => (i < count ? 'zzzzzz' : w)).join(' ')
  it('still blocks a 12-word phrase with one or two typos', () => {
    expect(kinds(withTypos(1))).toEqual(['recovery phrase'])
    expect(kinds(withTypos(2))).toEqual(['recovery phrase'])
  })
  it('does not flag twelve words when more than two are off the wordlist (documented tolerance limit)', () => {
    expect(findSecrets(withTypos(3))).toHaveLength(0)
  })
})
