import dotenv from 'dotenv'
import { AtpAgent, AppBskyFeedDefs } from '@atproto/api'
import { ids } from '../src/lexicon/lexicons'

// Non-interactive publish: reads credentials from .env so they never
// appear in the terminal, chat, or logs.
//   BLUESKY_HANDLE=yourname.bsky.social
//   BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
const run = async () => {
  dotenv.config()

  const handle = process.env.BLUESKY_HANDLE
  const password = process.env.BLUESKY_APP_PASSWORD
  if (!handle || !password) {
    console.error(
      'Missing BLUESKY_HANDLE and/or BLUESKY_APP_PASSWORD in .env — add them and re-run.',
    )
    process.exit(1)
  }
  if (!process.env.FEEDGEN_SERVICE_DID && !process.env.FEEDGEN_HOSTNAME) {
    throw new Error('Please provide a hostname in the .env file')
  }

  const feedGenDid =
    process.env.FEEDGEN_SERVICE_DID ?? `did:web:${process.env.FEEDGEN_HOSTNAME}`

  const agent = new AtpAgent({ service: 'https://bsky.social' })
  await agent.login({ identifier: handle, password })

  await agent.api.com.atproto.repo.putRecord({
    repo: agent.session?.did ?? '',
    collection: ids.AppBskyFeedGenerator,
    rkey: 'pittsburgh', // must match the algorithm shortname
    record: {
      did: feedGenDid,
      displayName: 'Pittsburgh',
      description:
        'Posts from across Bluesky that mention Pittsburgh. A simple keyword feed.',
      createdAt: new Date().toISOString(),
      contentMode: AppBskyFeedDefs.CONTENTMODEUNSPECIFIED,
    },
  })

  console.log('All done 🎉 Feed published as:', `at://${agent.session?.did}/${ids.AppBskyFeedGenerator}/pittsburgh`)
}

run()
