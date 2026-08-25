// Phase 1, step 1: pull the curated catalog out of revibed-archiver's Mongo
// (revibedclusters db) - seed tracks + curator-accepted reviews only, never
// rejected/hard-negative tracks (those explicitly don't belong in the
// listenable catalog). Writes tracks-raw.json with embeddings included, so
// compute-umap.py can fit coordinates from it.
const fs = require('fs')
const { MongoClient } = require('mongodb')
require('dotenv').config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const DATABASE_NAME = 'revibedclusters'
const OUTPUT_PATH = __dirname + '/tracks-raw.json'

async function main() {
  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  const db = client.db(DATABASE_NAME)

  const clusters = await db
    .collection('musicclusters')
    .find(
      {},
      {
        projection: {
          slug: 1,
          title: 1,
          'allTracks.id': 1,
          'allTracks.metadata': 1,
          'allTracks.file': 1,
          'allTracks.features': 1
        }
      }
    )
    .toArray()

  const seedTracks = clusters.flatMap((cluster) =>
    (cluster.allTracks ?? [])
      .filter((track) => Array.isArray(track.features?.clapEmbedding) && track.features.clapEmbedding.length)
      .map((track) => ({
        id: track.id,
        clusterSlug: cluster.slug,
        clusterTitle: cluster.title,
        artist: track.metadata?.artist ?? null,
        title: track.metadata?.title ?? null,
        album: track.metadata?.album ?? null,
        localAudioPath: track.file?.path ?? null,
        filename: track.file?.filename ?? null,
        bpm: track.features?.bpm ?? null,
        tempoClass: track.features?.tempoClass ?? null,
        genreProbabilities: track.features?.genreProbabilities ?? null,
        mood: track.features?.mood ?? null,
        embedding: track.features.clapEmbedding
      }))
  )

  const clusterTitleBySlug = new Map(clusters.map((c) => [c.slug, c.title]))
  const acceptedReviews = await db
    .collection('musicclusterreviews')
    .find(
      { decision: 'accepted', assignedClusterSlug: { $exists: true, $nin: [null, ''] } },
      {
        projection: {
          trackId: 1,
          assignedClusterSlug: 1,
          'track.metadata': 1,
          'track.file': 1,
          'track.features': 1
        }
      }
    )
    .toArray()

  const acceptedTracks = acceptedReviews
    .filter(
      (review) =>
        Array.isArray(review.track?.features?.clapEmbedding) && review.track.features.clapEmbedding.length
    )
    .map((review) => ({
      id: review.trackId,
      clusterSlug: review.assignedClusterSlug,
      clusterTitle: clusterTitleBySlug.get(review.assignedClusterSlug) ?? review.assignedClusterSlug,
      artist: review.track?.metadata?.artist ?? null,
      title: review.track?.metadata?.title ?? null,
      album: review.track?.metadata?.album ?? null,
      localAudioPath: review.track?.file?.path ?? null,
      filename: review.track?.file?.filename ?? null,
      bpm: review.track?.features?.bpm ?? null,
      tempoClass: review.track?.features?.tempoClass ?? null,
      genreProbabilities: review.track?.features?.genreProbabilities ?? null,
      mood: review.track?.features?.mood ?? null,
      embedding: review.track.features.clapEmbedding
    }))

  // A track could in theory be both a seed and an accepted review (unlikely
  // but not impossible) - de-dupe by id, keep the first occurrence.
  const byId = new Map()
  for (const track of [...seedTracks, ...acceptedTracks]) {
    if (!byId.has(track.id)) byId.set(track.id, track)
  }
  const tracks = [...byId.values()]

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(tracks))
  console.log(`Exported ${tracks.length} tracks (${seedTracks.length} seed + ${acceptedTracks.length} accepted, deduped) to ${OUTPUT_PATH}`)

  const byCluster = {}
  for (const track of tracks) byCluster[track.clusterTitle] = (byCluster[track.clusterTitle] || 0) + 1
  console.log('By cluster:', byCluster)

  await client.close()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
