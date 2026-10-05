/**
 * Probe Tencent's per-champion endpoint to see whether it returns usable daily history.
 * Never fails: it only prints what it finds.
 *
 *   node scripts/probe-history.ts [--hero 10001 --hero 10002] [--raw-dir .raw]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { describeError, fetchText } from './lib/http.ts'
import { describeShape, findDates } from './lib/shape.ts'
import { HERO_HISTORY_URL, TENCENT_HEADERS } from './lib/tencent.ts'

const { values: args } = parseArgs({
  options: {
    hero: { type: 'string', multiple: true, default: ['10001', '10002'] },
    'raw-dir': { type: 'string' },
  },
  strict: true,
})

for (const heroId of args.hero) {
  const url = `${HERO_HISTORY_URL}?hero_id=${encodeURIComponent(heroId)}`
  console.log(`\n=== ${url}`)
  try {
    const text = await fetchText(url, { headers: TENCENT_HEADERS, retries: 1 })
    console.log(`${text.length} bytes`)
    if (args['raw-dir']) {
      const dir = resolve(args['raw-dir'])
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, `hero_rank_data_v2_${heroId}.json`), text, 'utf8')
    }
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      console.log(`Not JSON. First 500 chars:\n${text.slice(0, 500)}`)
      continue
    }
    console.log(`Shape: ${describeShape(json)}`)
    const dates = [...findDates(json)].sort()
    console.log(
      dates.length > 0
        ? `Dates: ${dates.length} distinct, ${dates[0]} → ${dates.at(-1)}`
        : 'No date fields found',
    )
    console.log(`Preview:\n${text.slice(0, 1500)}`)
  } catch (error) {
    console.log(`Request failed: ${describeError(error)}`)
  }
}
