import { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import { AppContext } from '../config'

// Jack's personal feed. Ranks by taste score (derived from his Twitter
// archive — see src/taste.ts) with a recency bias, so a great post from an
// hour ago beats a slightly-better post from yesterday.
export const shortname = 'for-you'

const PAGE = 200 // pull a window, then rank in memory

export const handler = async (ctx: AppContext, params: QueryParams) => {
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('score', 'is not', null)
    .orderBy('indexedAt', 'desc')
    .limit(PAGE)

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    builder = builder.where('post.indexedAt', '<', timeStr)
  }
  const res = await builder.execute()

  const now = Date.now()
  const ranked = res
    .map((row) => {
      const ageHrs = (now - new Date(row.indexedAt).getTime()) / 3600000
      // decay ~1 point per 6h old, so freshness matters but quality wins
      const rank = (row.score ?? 0) - ageHrs / 6
      return { row, rank }
    })
    .sort((a, b) => b.rank - a.rank)

  // Spam accounts post the same thing repeatedly and would otherwise take over
  // the page: cap each author, and drop near-identical text.
  const MAX_PER_AUTHOR = 2
  const perAuthor = new Map<string, number>()
  const seenText = new Set<string>()
  const feed: { post: string }[] = []

  for (const { row } of ranked) {
    if (feed.length >= params.limit) break

    const author = row.uri.split('/')[2]
    const n = perAuthor.get(author) ?? 0
    if (n >= MAX_PER_AUTHOR) continue

    const fingerprint = (row.text ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .slice(0, 80)
    if (fingerprint && seenText.has(fingerprint)) continue

    perAuthor.set(author, n + 1)
    if (fingerprint) seenText.add(fingerprint)
    feed.push({ post: row.uri })
  }

  // cursor still walks the time axis so paging terminates
  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return { cursor, feed }
}
