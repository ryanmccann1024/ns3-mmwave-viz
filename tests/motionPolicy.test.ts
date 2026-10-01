import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : []
  })
}

test('no source file uses transition-all', () => {
  const files = sourceFiles(SRC)
  assert.ok(files.length > 0, 'expected to find source files under src/')
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    assert.ok(
      !text.includes('transition-all'),
      `${relative(ROOT, file)} uses transition-all; use a MOTION preset from src/styles/motion.ts`
    )
  }
})

test('global styles honour reduced motion and show a keyboard focus ring', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8')
  assert.ok(
    css.includes('prefers-reduced-motion'),
    'index.css lacks a prefers-reduced-motion block'
  )
  assert.ok(css.includes(':focus-visible'), 'index.css lacks a :focus-visible rule')
})

test('tailwind config defines the motion duration tokens', async () => {
  const { default: config } = await import('../tailwind.config.js')
  const durations = config.theme.extend.transitionDuration
  assert.equal(durations.fast, '120ms')
  assert.equal(durations.base, '180ms')
  assert.equal(durations.slow, '240ms')
  assert.equal(config.theme.extend.transitionTimingFunction.standard, 'cubic-bezier(0.2, 0, 0, 1)')
})
