<template>
  <section class="map-page">
    <header class="page-header">
      <h1>Revibed Space Voyage</h1>
      <div class="header-actions">
        <!-- <button type="button" class="ghost-button" :disabled="loading" @click="loadPoints">
          {{ loading ? 'Loading…' : 'Reload' }}
        </button> -->
        <button type="button" class="ghost-button" @click="handleLogout">Log out</button>
      </div>
    </header>

    <div v-if="error" class="error-box">{{ error }}</div>

    <div class="viewport-wrap">
      <div ref="containerRef" class="viewport"></div>
      <div v-if="loading" class="loading-overlay">Loading tracks…</div>
      <div v-if="hovered" class="tooltip" :style="tooltipStyle">
        <strong>{{ hovered.title || hovered.id }}</strong>
        <span v-if="hovered.artist">{{ hovered.artist }}</span>
        <small>{{ hovered.clusterTitle }}</small>
      </div>

    </div>

    <div class="legend">
      <button
        v-for="cluster in legendClusters"
        :key="cluster.slug"
        type="button"
        class="legend-item"
        :class="{ 'legend-item-hidden': hiddenSlugs.has(cluster.slug) }"
        @click="toggleClusterVisibility(cluster.slug)"
      >
        <span class="legend-swatch" :style="{ background: cluster.color }"></span>
        {{ cluster.title }} ({{ countsBySlug[cluster.slug] ?? 0 }})
      </button>
    </div>

    <PlayerBar />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { fetchTracks, UnauthorizedError, type Track } from '../lib/api'
import { clearToken } from '../lib/auth'
import { playerState, playTrack as playTrackInPlayer, setTracks } from '../lib/player'
import PlayerBar from './PlayerBar.vue'

const emit = defineEmits<{ 'logged-out': [] }>()

const CLUSTER_COLORS: Record<string, string> = {
  'rare-groove-atlas': '#B5442E',
  'vinyl-club-memory': '#6E2A8F',
  'island-diaspora-grooves': '#1C8C6E',
  'african-electric-dance': '#D98A1E',
  'synthetic-underground': '#2E5FB0',
  'atmospheric-archives': '#7FA6B0',
  'screen-music-library': '#B08D57',
  'psychedelic-borders': '#A0479B',
  'spiritual-electric-jazz': '#C9A227',
  'the-outer-shelf': '#3A3A3E'
}
const DEFAULT_COLOR = '#999999'
const CLOUD_SPAN = 20
const TRAIL_LINE_WIDTH = 2 // pixels

const containerRef = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const error = ref('')
const points = ref<Track[]>([])
const hovered = ref<Track | null>(null)
const hoverPos = ref({ x: 0, y: 0 })
const hiddenSlugs = ref(new Set<string>())

const legendClusters = computed(() => {
  const bySlug = new Map<string, { slug: string; title: string }>()
  for (const point of points.value) {
    if (!bySlug.has(point.clusterSlug)) {
      bySlug.set(point.clusterSlug, { slug: point.clusterSlug, title: point.clusterTitle })
    }
  }
  return [...bySlug.values()]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((cluster) => ({ ...cluster, color: CLUSTER_COLORS[cluster.slug] || DEFAULT_COLOR }))
})

const countsBySlug = computed(() => {
  const counts: Record<string, number> = {}
  for (const point of points.value) {
    counts[point.clusterSlug] = (counts[point.clusterSlug] ?? 0) + 1
  }
  return counts
})

const visiblePoints = computed(() =>
  points.value.filter((point) => !hiddenSlugs.value.has(point.clusterSlug))
)

const toggleClusterVisibility = (slug: string) => {
  if (hiddenSlugs.value.has(slug)) hiddenSlugs.value.delete(slug)
  else hiddenSlugs.value.add(slug)
  buildPointCloud()
}

const tooltipStyle = computed(() => ({
  left: `${hoverPos.value.x + 12}px`,
  top: `${hoverPos.value.y + 12}px`
}))

let renderer: THREE.WebGLRenderer | undefined
let scene: THREE.Scene | undefined
let camera: THREE.PerspectiveCamera | undefined
let controls: OrbitControls | undefined
let pointCloud: THREE.Points | undefined
let trailLine: Line2 | undefined
let raycaster: THREE.Raycaster | undefined
let animationFrame = 0
let container: HTMLDivElement | undefined
let renderedPoints: Track[] = []
let plottedPositionById = new Map<string, THREE.Vector3>()

function initScene() {
  if (!containerRef.value) return
  container = containerRef.value
  const width = container.clientWidth
  const height = container.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color('#0d0d0f')

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.position.set(0, 0, 28)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(window.devicePixelRatio || 1)
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  raycaster = new THREE.Raycaster()
  raycaster.params.Points = { threshold: 0.4 }

  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  window.addEventListener('resize', onResize)

  animate()
}

function buildPointCloud() {
  if (!scene) return

  if (pointCloud) {
    scene.remove(pointCloud)
    pointCloud.geometry.dispose()
    ;(pointCloud.material as THREE.Material).dispose()
    pointCloud = undefined
  }

  // Bounding box/scale is always computed from the full set, not just the
  // visible subset, so hiding a cluster doesn't re-center or re-scale the
  // remaining points - only the hidden ones disappear.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const point of points.value) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const centerZ = (minZ + maxZ) / 2
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1)
  const scale = CLOUD_SPAN / span

  plottedPositionById = new Map(
    points.value.map((point) => [
      point.id,
      new THREE.Vector3(
        (point.x - centerX) * scale,
        (point.y - centerY) * scale,
        (point.z - centerZ) * scale
      )
    ])
  )
  buildTrailLine()

  renderedPoints = visiblePoints.value
  if (!renderedPoints.length) return

  const positions = new Float32Array(renderedPoints.length * 3)
  const colors = new Float32Array(renderedPoints.length * 3)
  const color = new THREE.Color()

  renderedPoints.forEach((point, index) => {
    positions[index * 3] = (point.x - centerX) * scale
    positions[index * 3 + 1] = (point.y - centerY) * scale
    positions[index * 3 + 2] = (point.z - centerZ) * scale

    color.set(CLUSTER_COLORS[point.clusterSlug] || DEFAULT_COLOR)
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 0.35,
    vertexColors: true,
    sizeAttenuation: true
  })

  pointCloud = new THREE.Points(geometry, material)
  scene.add(pointCloud)
}

function buildTrailLine() {
  if (!scene || !renderer || !container) return

  if (trailLine) {
    scene.remove(trailLine)
    trailLine.geometry.dispose()
    ;(trailLine.material as LineMaterial).dispose()
    trailLine = undefined
  }

  const vertices = playerState.trail
    .map((id) => plottedPositionById.get(id))
    .filter((v): v is THREE.Vector3 => v !== undefined)

  if (vertices.length < 2) return

  const positions = vertices.flatMap((v) => [v.x, v.y, v.z])
  const geometry = new LineGeometry()
  geometry.setPositions(positions)

  const material = new LineMaterial({
    color: 0xe5e5e5,
    linewidth: TRAIL_LINE_WIDTH,
    transparent: true,
    opacity: 0.5
  })
  material.resolution.set(container.clientWidth, container.clientHeight)

  trailLine = new Line2(geometry, material)
  trailLine.computeLineDistances()
  scene.add(trailLine)
}

function raycastPoint(clientX: number, clientY: number): Track | null {
  if (!pointCloud || !container || !camera || !raycaster) return null

  const rect = container.getBoundingClientRect()
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  )
  raycaster.setFromCamera(mouse, camera)
  const intersections = raycaster.intersectObject(pointCloud)

  if (intersections.length && intersections[0].index !== undefined) {
    return renderedPoints[intersections[0].index as number] ?? null
  }

  return null
}

function onPointerMove(event: PointerEvent) {
  if (!container) return

  const point = raycastPoint(event.clientX, event.clientY)
  const rect = container.getBoundingClientRect()

  if (point) {
    hovered.value = point
    hoverPos.value = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    container.style.cursor = 'pointer'
  } else {
    hovered.value = null
    container.style.cursor = 'default'
  }
}

// OrbitControls uses the same pointerdown/pointermove/pointerup sequence to
// rotate the scene, and a native "click" fires after any drag that starts
// and ends on the same element - regardless of how far the mouse moved in
// between. So instead of listening for "click", track the pointer distance
// between down and up ourselves and only treat it as a click (play the
// point under the cursor) when that distance stays under a small threshold.
const CLICK_MOVE_THRESHOLD_PX = 5
let pointerDownPos: { x: number; y: number } | null = null

function onPointerDown(event: PointerEvent) {
  pointerDownPos = { x: event.clientX, y: event.clientY }
}

function onPointerUp(event: PointerEvent) {
  const downPos = pointerDownPos
  pointerDownPos = null
  if (!downPos) return

  const dx = event.clientX - downPos.x
  const dy = event.clientY - downPos.y
  if (Math.sqrt(dx * dx + dy * dy) > CLICK_MOVE_THRESHOLD_PX) return

  const point = raycastPoint(event.clientX, event.clientY)
  if (point) playTrack(point)
}

async function playTrack(track: Track) {
  error.value = ''
  try {
    await playTrackInPlayer(track)
  } catch (caught: any) {
    if (caught instanceof UnauthorizedError) {
      emit('logged-out')
      return
    }
    error.value = caught.message || 'Failed to load track audio'
  }
}

function onResize() {
  if (!container || !renderer || !camera) return

  const width = container.clientWidth
  const height = container.clientHeight
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  if (trailLine) (trailLine.material as LineMaterial).resolution.set(width, height)
}

function animate() {
  animationFrame = requestAnimationFrame(animate)
  controls?.update()
  if (renderer && scene && camera) renderer.render(scene, camera)
}

const loadPoints = async () => {
  loading.value = true
  error.value = ''

  try {
    points.value = await fetchTracks()
    setTracks(points.value)
    buildPointCloud()
  } catch (caught: any) {
    if (caught instanceof UnauthorizedError) {
      emit('logged-out')
      return
    }
    error.value = caught.message || 'Failed to load tracks'
  } finally {
    loading.value = false
  }
}

function handleLogout() {
  clearToken()
  emit('logged-out')
}

watch(
  () => playerState.trail.length,
  () => buildTrailLine()
)

onMounted(() => {
  initScene()
  loadPoints()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('resize', onResize)
  if (container && renderer) {
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    container.removeChild(renderer.domElement)
  }
  pointCloud?.geometry.dispose()
  ;(pointCloud?.material as THREE.Material | undefined)?.dispose()
  trailLine?.geometry.dispose()
  ;(trailLine?.material as LineMaterial | undefined)?.dispose()
  renderer?.dispose()
})
</script>

<style scoped>
.map-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  padding: 1.25rem;
  background: #0d0d0f;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;

  h1 {
    font-size: .9rem;
    font-weight: 400;
    color: #fff;
  }
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.ghost-button {
  padding: 0.4rem 0.8rem;
  border: 1px solid #35353a;
  border-radius: 7px;
  background: transparent;
  color: #d4d4d4;
  font-size: 0.75rem;
  cursor: pointer;
}

.ghost-button:hover {
  background: #1e1e22;
}

.ghost-button:disabled {
  opacity: 0.5;
  cursor: default;
}

.error-box {
  margin-bottom: 1rem;
  padding: 0.75rem;
  border: 1px solid #7f1d1d;
  border-radius: 7px;
  background: rgb(127 29 29 / 20%);
  color: #f87171;
  font-size: 0.8rem;
}

.viewport-wrap {
  position: relative;
  flex: 1;
  overflow: hidden;
  border: 1px solid #26262a;
  border-radius: 10px;
}

.viewport {
  width: 100%;
  height: 100%;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(13 13 15 / 55%);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  pointer-events: none;
}

.tooltip {
  position: absolute;
  z-index: 2;
  display: grid;
  max-width: 16rem;
  padding: 0.5rem 0.65rem;
  border-radius: 7px;
  background: rgb(23 23 23 / 92%);
  color: #fff;
  font-size: 0.72rem;
  pointer-events: none;

  strong {
    overflow: hidden;
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    margin-top: 0.1rem;
    color: #d4d4d4;
  }

  small {
    margin-top: 0.2rem;
    color: #a3a3a3;
  }
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-top: 1rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
  border: 0;
  border-radius: 999px;
  background: none;
  font-size: 0.75rem;
  color: #a3a3a8;
}

.legend-item:hover {
  background: #1e1e22;
}

.legend-item-hidden {
  color: #4a4a4e;
  text-decoration: line-through;
}

.legend-item-hidden .legend-swatch {
  opacity: 0.3;
}

.legend-swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  flex: 0 0 auto;
}
</style>
