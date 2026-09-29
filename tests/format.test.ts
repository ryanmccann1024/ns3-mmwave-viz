import test from 'node:test'
import assert from 'node:assert/strict'
import { folderLabel, runTimeLabel, shortNumber } from '../src/lib/format.ts'

test('a dated experiment folder splits into name and date', () => {
  assert.deepEqual(folderLabel('2026-09/22/17-48-rl-test-baselines'), {
    name: 'rl-test-baselines',
    date: 'Sep 22, 17:48',
  })
})

test('a seconds field in the folder time is accepted', () => {
  assert.equal(folderLabel('2026-04/19/13-59-28-validation').name, 'validation')
})

test('other layouts fall back to the last path segment', () => {
  assert.deepEqual(folderLabel('fetched/my-run'), { name: 'my-run', date: null })
  assert.deepEqual(folderLabel(''), { name: '', date: null })
})

test('shortNumber rounds by magnitude and marks missing values', () => {
  assert.equal(shortNumber(28.956934523809526), '28.96')
  assert.equal(shortNumber(0.9478467261904762), '0.948')
  assert.equal(shortNumber(1234.56), '1234.6')
  assert.equal(shortNumber(null), 'n/a')
  assert.equal(shortNumber(Number.NaN), 'n/a')
})

test('runTimeLabel reads a bare timestamp folder and ignores named ones', () => {
  assert.equal(runTimeLabel('2026-09/22/17-50-56'), 'Sep 22, 17:50:56')
  assert.equal(runTimeLabel('2026-09/22/17-48-rl-test-baselines'), null)
})
