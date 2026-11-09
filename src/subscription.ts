import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'
import { scorePost, SCORE_THRESHOLD } from './taste'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return

    const ops = await getOpsByType(evt)

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .map((create) => {
        const text = create.record.text ?? ''
        const { score, topics } = scorePost(text)
        const isPittsburgh = /\bpittsburgh\b/i.test(text)
        return { create, text, score, topics, isPittsburgh }
      })
      // keep taste-matching posts, plus anything explicitly about Pittsburgh
      .filter(({ score, isPittsburgh }) => isPittsburgh || score >= SCORE_THRESHOLD)
      .map(({ create, text, score, topics }) => {
        return {
          uri: create.uri,
          cid: create.cid,
          indexedAt: new Date().toISOString(),
          text,
          score,
          topics: topics.join(','),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      for (const post of postsToCreate) {
        console.log(
          `[${post.score}] ${post.topics || '-'} :: ${post.text.replace(/\s+/g, ' ').slice(0, 90)}`,
        )
      }
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
