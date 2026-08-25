import fs from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { requireAuth } from '../auth'

interface ManifestTrack {
  id: string
  clusterSlug: string
  clusterTitle: string
  artist: string | null
  title: string | null
  album: string | null
  x: number
  y: number
  z: number
  bpm: number | null
  tempoClass: string | null
  genreProbabilities: Record<string, number> | null
  mood: Record<string, number> | null
  audioKey: string
}

const MANIFEST_PATH = process.env.MANIFEST_PATH || path.join(__dirname, '..', '..', 'data', 'manifest.json')
const SIGNED_URL_EXPIRY_SECONDS = 60 * 30 // 30 minutes - minted on demand, not baked into the track list

let manifestByIdCache: Map<string, ManifestTrack> | undefined

function loadManifest(): Map<string, ManifestTrack> {
  if (!manifestByIdCache) {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as ManifestTrack[]
    manifestByIdCache = new Map(raw.map((track) => [track.id, track]))
    console.log(`Loaded ${manifestByIdCache.size} tracks from manifest`)
  }
  return manifestByIdCache
}

const s3Client = new S3Client({
  endpoint: process.env.S4_ENDPOINT,
  region: process.env.S4_REGION,
  credentials: {
    accessKeyId: process.env.S4_ACCESS_KEY || '',
    secretAccessKey: process.env.S4_SECRET_KEY || ''
  },
  forcePathStyle: true
})

export const tracksRouter = Router()

tracksRouter.get('/tracks', requireAuth, (_req, res) => {
  const tracks = [...loadManifest().values()].map((track) => ({
    id: track.id,
    clusterSlug: track.clusterSlug,
    clusterTitle: track.clusterTitle,
    artist: track.artist,
    title: track.title,
    album: track.album,
    x: track.x,
    y: track.y,
    z: track.z,
    bpm: track.bpm,
    tempoClass: track.tempoClass,
    genreProbabilities: track.genreProbabilities,
    mood: track.mood
    // audioKey/localAudioPath intentionally omitted - clients get a signed
    // URL on demand via /tracks/:id/audio-url instead.
  }))

  res.json({ tracks })
})

tracksRouter.get('/tracks/:id/audio-url', requireAuth, async (req, res) => {
  const trackId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id
  const track = loadManifest().get(trackId)
  if (!track) {
    res.status(404).json({ error: 'Track not found' })
    return
  }

  try {
    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: process.env.S4_BUCKET, Key: track.audioKey }),
      { expiresIn: SIGNED_URL_EXPIRY_SECONDS }
    )
    res.json({ url, expiresIn: SIGNED_URL_EXPIRY_SECONDS })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})
