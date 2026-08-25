// Phase 1, step 3: turn tracks-with-coords.json into the manifest the app
// will actually fetch. audioUrl stays null until upload-to-s4.js fills it in
// - keeping this as a separate step means we can re-run manifest assembly
// without re-fitting UMAP or re-uploading audio.
const fs = require('fs')

const INPUT_PATH = __dirname + '/tracks-with-coords.json'
const OUTPUT_PATH = __dirname + '/manifest.json'

function main() {
  const tracks = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'))

  const manifest = tracks.map((track) => ({
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
    mood: track.mood,
    filename: track.filename,
    localAudioPath: track.localAudioPath,
    audioUrl: null
  }))

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2))
  console.log(`Wrote manifest for ${manifest.length} tracks to ${OUTPUT_PATH}`)
  console.log('audioUrl is null for all tracks - run upload-to-s4.js next to fill it in.')
}

main()
