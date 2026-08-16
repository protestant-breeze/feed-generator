// Sanity-check the taste scorer against ground truth: posts Jack actually
// liked on Twitter should score higher than generic Bluesky posts.
import fs from 'fs'
import { scorePost, SCORE_THRESHOLD } from '../src/taste'

const D =
  '/Users/jackboyle/Library/CloudStorage/GoogleDrive-jackdboyle@gmail.com/My Drive/00_LIBRARY/Personal/Twitter Files/data/'

const load = (fn: string) => {
  const raw = fs.readFileSync(D + fn, 'utf-8')
  return JSON.parse(raw.slice(raw.indexOf('=') + 1))
}

const likes: string[] = load('like.js').map((d: any) => d.like.fullText)

// baseline = generic posts already captured off the firehose
let baseline: string[] = []
try {
  const Database = require('better-sqlite3')
  const db = new Database('db.sqlite', { readonly: true })
  baseline = db
    .prepare('select text from post where text is not null limit 5000')
    .all()
    .map((r: any) => r.text)
} catch {
  // migration 002 not applied yet, or no captured posts — skip the baseline
}

const stats = (name: string, texts: string[]) => {
  const scores = texts.map((t) => scorePost(t).score)
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const pass = scores.filter((s) => s >= SCORE_THRESHOLD).length
  console.log(
    `${name.padEnd(22)} n=${String(texts.length).padStart(6)}  mean=${mean.toFixed(2).padStart(6)}  >=${SCORE_THRESHOLD}: ${((pass / texts.length) * 100).toFixed(1)}%`,
  )
  return mean
}

console.log(`threshold = ${SCORE_THRESHOLD}\n`)
const a = stats('HIS LIKES (truth)', likes)
const b = baseline.length ? stats('generic firehose', baseline) : NaN
if (baseline.length) console.log(`\nseparation: ${(a - b).toFixed(2)} points`)
else console.log('\n(no baseline text in db yet — run the collector first)')

console.log('\n=== highest-scoring liked tweets ===')
likes
  .map((t) => ({ t, ...scorePost(t) }))
  .sort((x, y) => y.score - x.score)
  .slice(0, 8)
  .forEach((r) =>
    console.log(`  [${r.score}] ${r.topics.join(',')} :: ${r.t.replace(/\s+/g, ' ').slice(0, 95)}`),
  )
