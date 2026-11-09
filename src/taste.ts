import fs from 'fs'
import path from 'path'

// Taste model trained on Jack's Twitter archive (Nov 2020 export):
// 62,840 liked tweets as positives vs. ~13.5k live Bluesky firehose posts as
// negatives. Naive Bayes over word unigrams + bigrams + a few style features.
// Held-out AUC ≈ 0.79; at the default threshold it keeps ~7% of posts he
// actually liked while admitting ~0.2% of generic firehose posts (~30x lift).
//
// An earlier hand-written keyword scorer was tried and discarded: it separated
// his likes from generic posts by only ~2x, because his taste is carried by
// register and voice, not topic words. See scripts/trainTaste.py to retrain.

type Model = { threshold: number; weights: Record<string, number> }

// Not in git: the trained model is personal data derived from Jack's likes.
// Regenerate it locally with `python3 scripts/trainTaste.py`.
const MODEL_PATH = path.join(__dirname, 'taste-model.json')
if (!fs.existsSync(MODEL_PATH)) {
  throw new Error(
    `Missing ${MODEL_PATH}.\n` +
      `The taste model is intentionally not committed (it is personal data).\n` +
      `Regenerate it with:  python3 scripts/trainTaste.py`,
  )
}
const model: Model = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf-8'))

// Must mirror tokens() in scripts/trainTaste.py, or the weights won't line up.
const ARTIFACTS = new Set([
  'tweet', 'tweets', 'tweeting', 'tweeted', 'retweet', 'retweets', 'rt',
  'twitter', 'tl', 'timeline', 'dm', 'dms', 'subtweet', 'quote',
  'amp', 'quot', 'gt', 'lt', 'nbsp',
])

const tokenize = (text: string): string[] => {
  const t = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@\w+/g, ' ')
  const matched: string[] = t.match(/[a-z0-9']+/g) || []
  const ws = matched.filter((w) => w.length <= 20 && !ARTIFACTS.has(w))
  const out: string[] = [...ws]
  for (let i = 0; i + 1 < ws.length; i++) out.push(`${ws[i]}_${ws[i + 1]}`)

  const n = ws.length
  if (n <= 8) out.push('__short__')
  else if (n >= 40) out.push('__long__')
  if (/[😭😂💀🤣]/u.test(text)) out.push('__laughemoji__')
  if (text.includes('?')) out.push('__question__')
  if (/\b[A-Z]{4,}\b/.test(text)) out.push('__caps__')
  return out
}

// Light topic tags — not used for scoring, just so captured posts are
// legible when tuning the feed.
const TOPICS: [string, RegExp][] = [
  ['pittsburgh', /\b(pittsburgh|pgh|yinz|burgh|sheetz|steelers|pirates|penguins)\b/i],
  ['music', /\b(album|song|band|concert|vinyl|spotify|tour)\b/i],
  ['rap', /\b(rap|rapper|mixtape|kanye|drake|bladee|thug)\b/i],
  ['film/tv', /\b(movie|film|episode|season|netflix|letterboxd)\b/i],
  ['politics', /\b(trump|biden|election|senate|congress|police|protest)\b/i],
  ['food', /\b(pizza|sandwich|taco|coffee|beer|bodega|diner)\b/i],
  ['party', /\b(weed|stoned|drunk|hungover|bar)\b/i],
  ['tech', /\b(internet|google|computer|apple|iphone|app|ai)\b/i],
]

// Bot-spam penalties. These target *promotional behaviour*, not crudeness —
// his archive is full of crude jokes and those should still rank. What gets
// punished is follow-bait, hashtag stuffing, and paid-solicitation patterns,
// which mimic casual register well enough to fool the taste model.
const SPAM: [RegExp, number][] = [
  [/(#\w+[\s,]*){5,}/, -12], // hashtag stuffing
  [/\b(follow me|follow back|my new account|dm me|check my bio|link in bio)\b/i, -12],
  [/\b(onlyfans|cashapp|venmo|telegram|whatsapp)\b/i, -10],
  [/\b(subscribe|promo code|discount code|click here|sign up now)\b/i, -8],
  [/(https?:\/\/\S+.*){3,}/, -6], // link spam
]

export type Scored = { score: number; topics: string[] }

export const scorePost = (text: string): Scored => {
  let score = 0
  for (const tok of new Set(tokenize(text))) {
    const w = model.weights[tok]
    if (w !== undefined) score += w
  }
  for (const [re, penalty] of SPAM) if (re.test(text)) score += penalty

  const topics = TOPICS.filter(([, re]) => re.test(text)).map(([n]) => n)
  return { score: Math.round(score * 100) / 100, topics }
}

// Higher = pickier. 5 gives roughly a few hundred posts/hour off the firehose.
export const SCORE_THRESHOLD = process.env.TASTE_THRESHOLD
  ? parseFloat(process.env.TASTE_THRESHOLD)
  : 5
