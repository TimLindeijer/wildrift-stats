import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

function isNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

/** Read and parse a JSON file; returns undefined when the file does not exist. */
export async function readJsonFile(path: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isNotFound(error)) return undefined
    throw error
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${(error as Error).message}`, { cause: error })
  }
}

export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

/** Write `content` unless the file already has exactly this content. Returns true if written. */
export async function writeIfChanged(path: string, content: string): Promise<boolean> {
  try {
    if ((await readFile(path, 'utf8')) === content) return false
  } catch (error) {
    if (!isNotFound(error)) throw error
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  return true
}

/** File names in a directory, or [] when it does not exist. */
export async function listFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((entry) => entry.isFile()).map((entry) => entry.name)
  } catch (error) {
    if (isNotFound(error)) return []
    throw error
  }
}
