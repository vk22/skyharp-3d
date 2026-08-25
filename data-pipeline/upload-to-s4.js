// Phase 1, step 4: upload each track's audio file to MEGA S4 (S3-compatible)
// and fill in manifest.json's audioUrl. Not run yet - needs credentials in
// .env (copy .env.example) and a confirmed bucket/access policy first.
//
// Usage: node upload-to-s4.js
//
// Required env vars (see .env.example):
//   S4_ENDPOINT     e.g. https://s3.<region>.s4.mega.io  (confirm exact host in the MEGA S4 dashboard)
//   S4_ACCESS_KEY
//   S4_SECRET_KEY
//   S4_BUCKET
//   S4_REGION       usually required by the S3 SDK even for S3-compatible providers; use whatever MEGA S4 expects
//   S4_PUBLIC_READ  "true" to build public object URLs directly, "false" to store just the key
//                    and let the (future) backend mint signed URLs on request
const fs = require('fs')
const path = require('path')
const { S3Client, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3')
require('dotenv').config()

const MANIFEST_PATH = __dirname + '/manifest.json'

const REQUIRED_ENV = ['S4_ENDPOINT', 'S4_ACCESS_KEY', 'S4_SECRET_KEY', 'S4_BUCKET', 'S4_REGION']

function assertEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key])
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`)
  }
}

const CONTENT_TYPE_BY_EXTENSION = {
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.aiff': 'audio/aiff',
  '.aif': 'audio/aiff',
  '.mp3': 'audio/mpeg'
}

function buildObjectKey(track) {
  const extension = path.extname(track.filename || track.localAudioPath || '') || '.audio'
  return `audio/${track.id}${extension}`
}

function resolveContentType(extension) {
  return CONTENT_TYPE_BY_EXTENSION[extension.toLowerCase()] || 'application/octet-stream'
}

function buildPublicUrl(objectKey) {
  // Path-style URL; MEGA S4 may also expose virtual-hosted-style - confirm
  // in their dashboard/docs once the bucket exists.
  return `${process.env.S4_ENDPOINT}/${process.env.S4_BUCKET}/${objectKey}`
}

async function objectExists(client, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: process.env.S4_BUCKET, Key: key }))
    return true
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) return false
    throw error
  }
}

async function main() {
  assertEnv()

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'))
  const client = new S3Client({
    endpoint: process.env.S4_ENDPOINT,
    region: process.env.S4_REGION,
    credentials: {
      accessKeyId: process.env.S4_ACCESS_KEY,
      secretAccessKey: process.env.S4_SECRET_KEY
    },
    forcePathStyle: true
  })

  let uploaded = 0
  let skippedExisting = 0
  let failed = 0

  for (const [index, track] of manifest.entries()) {
    if (!track.localAudioPath || !fs.existsSync(track.localAudioPath)) {
      console.error(`[${index + 1}/${manifest.length}] MISSING FILE for ${track.id}: ${track.localAudioPath}`)
      failed += 1
      continue
    }

    const objectKey = buildObjectKey(track)
    const extension = path.extname(track.filename || track.localAudioPath || '')

    try {
      if (await objectExists(client, objectKey)) {
        skippedExisting += 1
      } else {
        const body = fs.readFileSync(track.localAudioPath)
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.S4_BUCKET,
            Key: objectKey,
            Body: body,
            ContentType: resolveContentType(extension)
          })
        )
        uploaded += 1
      }

      track.audioUrl = process.env.S4_PUBLIC_READ === 'true' ? buildPublicUrl(objectKey) : null
      track.audioKey = objectKey
    } catch (error) {
      console.error(`[${index + 1}/${manifest.length}] FAILED for ${track.id}:`, error.message)
      failed += 1
    }

    if ((index + 1) % 25 === 0) {
      console.log(`Progress: ${index + 1}/${manifest.length}`)
    }
  }

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))
  console.log(`Done. Uploaded: ${uploaded}, already present: ${skippedExisting}, failed: ${failed}`)
  if (process.env.S4_PUBLIC_READ !== 'true') {
    console.log('S4_PUBLIC_READ was not "true" - audioUrl left null, audioKey set for backend-side signing.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
