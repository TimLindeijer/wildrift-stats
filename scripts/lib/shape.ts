/** Helpers for describing unknown JSON responses in logs (used by the history probe). */

/** Compact structural description of a JSON value, e.g. `{ "result": number 0, "data": [{…} ×30] }`. */
export function describeShape(value: unknown, maxDepth = 6, depth = 0): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (depth >= maxDepth) return `[… ×${value.length}]`
    return `[${describeShape(value[0], maxDepth, depth + 1)} ×${value.length}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    if (depth >= maxDepth) return `{… ${keys.length} keys}`
    const record = value as Record<string, unknown>
    const expanded = keys.slice(0, 3).map((key) => `${JSON.stringify(key)}: ${describeShape(record[key], maxDepth, depth + 1)}`)
    const rest = keys.slice(3)
    if (rest.length > 0) {
      const names = rest.slice(0, 20).map((key) => JSON.stringify(key))
      if (rest.length > 20) names.push(`… ${rest.length - 20} more`)
      expanded.push(`+ keys ${names.join(', ')}`)
    }
    return `{ ${expanded.join(', ')} }`
  }
  if (typeof value === 'string') return value.length > 32 ? `string(${value.length})` : `string ${JSON.stringify(value)}`
  return `${typeof value} ${String(value)}`
}

/** Collect date-like values (YYYYMMDD or YYYY-MM-DD) found under keys whose name contains "date". */
export function findDates(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) findDates(item, found)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      const text = typeof item === 'number' ? String(item) : item
      if (/date/i.test(key) && typeof text === 'string' && /^(\d{8}|\d{4}-\d{2}-\d{2})$/.test(text)) {
        found.add(text.replaceAll('-', ''))
      } else {
        findDates(item, found)
      }
    }
  }
  return found
}
