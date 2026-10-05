/** Minimal GitHub Actions integration: annotations, step outputs and the job summary. */
import { appendFile } from 'node:fs/promises'

export const inActions = process.env.GITHUB_ACTIONS === 'true'

function escapeData(text: string): string {
  return text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

export function warn(message: string): void {
  if (inActions) console.log(`::warning::${escapeData(message)}`)
  else console.warn(`warning: ${message}`)
}

export function error(message: string): void {
  if (inActions) console.log(`::error::${escapeData(message)}`)
  else console.error(`error: ${message}`)
}

export async function setOutput(name: string, value: string): Promise<void> {
  const file = process.env.GITHUB_OUTPUT
  if (file) await appendFile(file, `${name}=${value}\n`)
  else console.log(`output ${name}=${value}`)
}

export async function appendSummary(markdown: string): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY
  if (file) await appendFile(file, markdown)
}
