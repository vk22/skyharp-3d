import { computed, reactive } from 'vue'
import { Howl } from 'howler'
import { fetchAudioUrl, type Track } from './api'

const MAX_HISTORY = 50

export const playerState = reactive({
  tracks: [] as Track[],
  currentIndex: null as number | null,
  playing: false,
  loading: false,
  volume: 0.6,
  seek: 0,
  duration: 0,
  // Ids of tracks played before the current one, most recent last - lets
  // prev() step back through the actual listening path.
  history: [] as string[]
})

export const currentTrack = computed(() =>
  playerState.currentIndex == null ? null : (playerState.tracks[playerState.currentIndex] ?? null)
)

let howl: Howl | null = null
let seekTimer: ReturnType<typeof setInterval> | null = null
let playbackGeneration = 0

function clearSeekTimer() {
  if (seekTimer) clearInterval(seekTimer)
  seekTimer = null
}

function startSeekTimer() {
  clearSeekTimer()
  seekTimer = setInterval(() => {
    if (howl) playerState.seek = (howl.seek() as number) || 0
  }, 250)
}

function unload() {
  playbackGeneration++
  clearSeekTimer()
  if (howl) {
    howl.unload()
    howl = null
  }
  playerState.seek = 0
  playerState.duration = 0
}

export function setTracks(tracks: Track[]) {
  playerState.tracks = tracks
}

export async function playIndex(index: number) {
  const track = playerState.tracks[index]
  if (!track) return

  unload()
  const generation = playbackGeneration
  playerState.loading = true

  const url = await fetchAudioUrl(track.id).catch((error) => {
    playerState.loading = false
    throw error
  })

  // A newer playIndex()/playTrack() call superseded this one while the
  // signed-URL fetch was in flight - drop the now-stale response.
  if (generation !== playbackGeneration) return

  playerState.currentIndex = index
  howl = new Howl({
    src: [url],
    html5: true,
    volume: playerState.volume,
    onplay: () => {
      playerState.playing = true
      playerState.loading = false
      playerState.duration = howl?.duration() || 0
      startSeekTimer()
    },
    onpause: () => {
      playerState.playing = false
      clearSeekTimer()
    },
    onend: () => next(),
    onloaderror: () => {
      playerState.loading = false
      playerState.playing = false
    },
    onplayerror: () => {
      playerState.loading = false
      playerState.playing = false
    }
  })
  howl.play()
}

// Moving to a new track (by click, or by next()) records where we came from,
// so prev() can retrace the actual listening path rather than just walking
// the catalog backwards.
async function moveTo(index: number) {
  const from = currentTrack.value
  if (from) {
    playerState.history.push(from.id)
    if (playerState.history.length > MAX_HISTORY) playerState.history.shift()
  }
  await playIndex(index)
}

export async function playTrack(track: Track) {
  const index = playerState.tracks.findIndex((t) => t.id === track.id)
  if (index === -1) return

  if (playerState.currentIndex === index && howl) {
    toggle()
    return
  }

  await moveTo(index)
}

export function toggle() {
  if (!howl) return
  if (playerState.playing) howl.pause()
  else howl.play()
}

function squaredDistance(a: Track, b: Track): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}

// Nearest still-unplayed-recently neighbour in the 3D layout - "fly" to the
// most sonically similar track next, rather than the next manifest entry.
function nearestIndex(from: Track, excludeIds: Set<string>): number {
  let bestIndex = -1
  let bestDistance = Infinity

  playerState.tracks.forEach((track, index) => {
    if (track.id === from.id || excludeIds.has(track.id)) return
    const distance = squaredDistance(from, track)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  })

  return bestIndex
}

export async function next() {
  const from = currentTrack.value
  if (!from) return

  // Exclude the track we just came from so next() can't immediately bounce
  // back to it when it's also the closest point to the current track.
  const predecessor = playerState.history[playerState.history.length - 1]
  const excludeIds = predecessor ? new Set([predecessor]) : new Set<string>()

  const index = nearestIndex(from, excludeIds)
  if (index === -1) return
  await moveTo(index)
}

export async function prev() {
  const previousId = playerState.history.pop()
  if (!previousId) return

  const index = playerState.tracks.findIndex((t) => t.id === previousId)
  if (index === -1) return
  await playIndex(index)
}

export function setVolume(volume: number) {
  playerState.volume = Math.max(0, Math.min(1, volume))
  howl?.volume(playerState.volume)
}

export function seekTo(fraction: number) {
  if (!howl || !playerState.duration) return
  const target = playerState.duration * Math.max(0, Math.min(1, fraction))
  howl.seek(target)
  playerState.seek = target
}
