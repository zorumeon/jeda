import { BIP39_WORDS } from './bip39-english'

export type SecretMatch = { kind: 'recovery phrase' | 'private key'; start: number; end: number }

/** Shortest BIP-39 mnemonic. Valid lengths are 12, 15, 18, 21 and 24 words; any longer or odd-sized run is still treated as a phrase. */
export const MIN_PHRASE_WORDS = 12
/**
 * In any window of 12 consecutive words, at least this many must be on the English BIP-39 list for the window to count as a phrase.
 * A real phrase scores 12 of 12 and this tolerates two typos. Ordinary English prose scored at most 8 of 12 when this threshold was
 * chosen (about 2 million characters of documentation and licence text, 89 candidate runs), so plain sentences are not blocked.
 */
export const MIN_WORDLIST_HITS = 10

// A BIP-39 word is 3-8 letters. Wallets display phrases in many layouts, so an "item" may carry a numeric label
// ("1. word", "1) word", "(1) word", "01: word", "1 - word") and items may be separated by whitespace, commas, semicolons or pipes.
const LABEL = String.raw`(?:\(?\d{1,2}\s*[.):\-]?\s*)?`
const ITEM = String.raw`${LABEL}[a-z]{3,8}(?![a-z])`
const SEPARATOR = String.raw`[\s,;|]+`
// Candidate runs: 12 or more uninterrupted word-like items. Whether a run really is a phrase is decided against the wordlist below.
const PHRASE_RUN = new RegExp(String.raw`(?<![a-z])${ITEM}(?:${SEPARATOR}${ITEM}){${MIN_PHRASE_WORDS - 1},}`, 'gi')
const WORD_ITEM = new RegExp(String.raw`${LABEL}([a-z]{3,8})(?![a-z])`, 'gi')
// 64 hex characters, with or without 0x. Private keys and transaction hashes look identical, so both are blocked.
const HEX_64 = /\b(?:0x)?[a-fA-F0-9]{64}\b/g

export function findSecrets(input: string): SecretMatch[] {
  const matches: SecretMatch[] = []
  for (const match of input.matchAll(HEX_64)) matches.push({ kind: 'private key', start: match.index!, end: match.index! + match[0].length })
  for (const run of input.matchAll(PHRASE_RUN)) matches.push(...recoveryPhraseRanges(run[0], run.index!))
  return mergeOverlaps(matches)
}

/**
 * Inside one candidate run, find every window of 12 consecutive words with enough wordlist hits, merge overlapping windows (so 25+ word
 * pastes are covered in full) and extend each range over directly adjacent wordlist words (so extra words glued to a phrase are redacted too).
 * Runs of ordinary prose never reach the threshold and produce no match. Not a checksum validator and English only.
 */
function recoveryPhraseRanges(run: string, offset: number): SecretMatch[] {
  const items = [...run.matchAll(WORD_ITEM)].map((m) => ({
    start: offset + m.index!,
    end: offset + m.index! + m[0].length,
    listed: BIP39_WORDS.has(m[1].toLowerCase()),
  }))
  const hits = [0]
  for (const item of items) hits.push(hits[hits.length - 1] + (item.listed ? 1 : 0))
  const ranges: Array<[first: number, last: number]> = []
  for (let first = 0; first + MIN_PHRASE_WORDS <= items.length; first++) {
    const last = first + MIN_PHRASE_WORDS - 1
    if (hits[last + 1] - hits[first] < MIN_WORDLIST_HITS) continue
    const previous = ranges[ranges.length - 1]
    if (previous && first <= previous[1] + 1) previous[1] = last
    else ranges.push([first, last])
  }
  return ranges.map(([first, last]) => {
    while (first > 0 && items[first - 1].listed) first--
    while (last < items.length - 1 && items[last + 1].listed) last++
    return { kind: 'recovery phrase' as const, start: items[first].start, end: items[last].end }
  })
}

function mergeOverlaps(matches: SecretMatch[]): SecretMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: SecretMatch[] = []
  for (const match of sorted) {
    const last = merged[merged.length - 1]
    if (last && match.start < last.end) last.end = Math.max(last.end, match.end)
    else merged.push({ ...match })
  }
  return merged
}

export function redactSecrets(input: string, matches = findSecrets(input)) {
  let result = input
  for (const match of [...matches].sort((a, b) => b.start - a.start)) result = `${result.slice(0, match.start)}[${match.kind.toUpperCase()} REDACTED]${result.slice(match.end)}`
  return result
}
