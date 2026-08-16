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
    .slice(0, params.limit)

  const feed = ranked.map(({ row }) => ({ post: row.uri }))

  // cursor still walks the time axis so paging terminates
  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return { cursor, feed }
}
