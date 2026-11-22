import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const inputPath = resolve(process.argv[2] ?? 'jeda-evaluation-results.json')
const resultsPath = resolve('evaluation-results.json')
const report = JSON.parse(await readFile(inputPath, 'utf8'))

if (
  report?.syntheticOnly !== true ||
  report?.caseCount !== 40 ||
  !Array.isArray(report.outputs) ||
  !Number.isInteger(report.escalationCount) ||
  !report.modeResults?.preferred ||
  !report.modeResults?.cloudOnly ||
  !report.actualSource
) {
  throw new Error('Expected a completed 40-case Jeda report with measured baseline and escalation runs.')
}

const preferredRuns = report.outputs.filter((output) => output?.stage === 'preferred')
const cloudOnlyRuns = report.outputs.filter((output) => output?.stage === 'cloud-only')
const secondOpinionRuns = report.outputs.filter((output) => output?.stage === 'second-opinion')
if (
  preferredRuns.length !== 40 ||
  cloudOnlyRuns.length !== 40 ||
  secondOpinionRuns.length !== report.escalationCount ||
  report.outputs.length !== 80 + report.escalationCount
) {
  throw new Error('Report must contain 40 preferred, 40 cloud-only, and every triggered second-opinion run.')
}

const allowedModes = new Set(['PREFER_ON_DEVICE', 'ONLY_IN_CLOUD'])
const allowedStages = new Set(['preferred', 'cloud-only', 'second-opinion'])
const allowedPaths = new Set(['on-device', 'cloud', 'unknown'])
for (const output of report.outputs) {
  if (
    !output?.id ||
    !allowedModes.has(output.mode) ||
    !allowedStages.has(output.stage) ||
    typeof output.category !== 'string' ||
    !allowedPaths.has(output.path) ||
    (output.stage === 'preferred' && output.mode !== 'PREFER_ON_DEVICE') ||
    (output.stage !== 'preferred' && output.mode !== 'ONLY_IN_CLOUD') ||
    !['scam', 'benign'].includes(output.expected) ||
    Object.hasOwn(output, 'text') ||
    Object.hasOwn(output, 'prompt') ||
    Object.hasOwn(output, 'input')
  ) {
    throw new Error('Report contains an invalid run record or raw input. Nothing was written.')
  }
}

let history = []
try {
  history = JSON.parse(await readFile(resultsPath, 'utf8'))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
if (!Array.isArray(history)) throw new Error('evaluation-results.json must contain a JSON array.')

history.push(report)
await writeFile(resultsPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8')
console.info(`Recorded measured run ${report.generatedAt}; ${history.length} run(s) now stored.`)
