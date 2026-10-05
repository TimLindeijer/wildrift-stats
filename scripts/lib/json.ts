/**
 * Deterministic, diff-friendly JSON: containers that fit within `maxWidth` columns are written on
 * one line, larger ones are expanded one entry per line. Snapshot rows therefore become one line per
 * champion, which keeps the daily git diffs readable.
 */
export function formatJson(value: unknown, maxWidth = 120): string {
  return `${format(value, '', 0, maxWidth)}\n`
}

function format(value: unknown, indent: string, prefixLength: number, maxWidth: number): string {
  const inline = JSON.stringify(value) as string | undefined
  if (inline === undefined) return 'null'
  if (value === null || typeof value !== 'object') return inline
  if (indent.length + prefixLength + inline.length <= maxWidth) return inline

  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((item) => inner + format(item, inner, 0, maxWidth))
    return `[\n${items.join(',\n')}\n${indent}]`
  }

  const entries = Object.entries(value).filter(([, item]) => item !== undefined)
  if (entries.length === 0) return '{}'
  const items = entries.map(([key, item]) => {
    const keyText = `${JSON.stringify(key)}: `
    return inner + keyText + format(item, inner, keyText.length, maxWidth)
  })
  return `{\n${items.join(',\n')}\n${indent}}`
}

/** Key-order-independent JSON for equality checks. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  )
}
