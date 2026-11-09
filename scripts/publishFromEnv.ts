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

  // Which feed to publish — must match a shortname in src/algos/.
  // Override with FEED=pittsburgh to publish the keyword feed instead.
  const FEEDS: Record<string, { name: string; desc: string }> = {
    'for-you': {
      name: 'For You (jack)',
      desc: 'A personal feed, tuned to my taste. Ranked by a model trained on ~63k of my own likes.',
    },
    pittsburgh: {
      name: 'Pittsburgh',
      desc: 'Posts from across Bluesky that mention Pittsburgh.',
    },
  }
  const rkey = process.env.FEED ?? 'for-you'
  const meta = FEEDS[rkey]
  if (!meta) throw new Error(`Unknown feed "${rkey}" — expected one of ${Object.keys(FEEDS).join(', ')}`)

  await agent.api.com.atproto.repo.putRecord({
    repo: agent.session?.did ?? '',
    collection: ids.AppBskyFeedGenerator,
    rkey,
    record: {
      did: feedGenDid,
      displayName: meta.name,
      description: meta.desc,
      createdAt: new Date().toISOString(),
      contentMode: AppBskyFeedDefs.CONTENTMODEUNSPECIFIED,
    },
  })

  console.log(`All done 🎉 Published "${meta.name}"`)
  console.log(`  record:  at://${agent.session?.did}/${ids.AppBskyFeedGenerator}/${rkey}`)
  console.log(`  service: ${feedGenDid}`)
  console.log(`  view:    https://bsky.app/profile/${agent.session?.handle}/feed/${rkey}`)
}

run()
