<template>
  <div class="player-bar">
    <div class="transport">
      <button type="button" class="icon-button" :disabled="!hasHistory" title="Previous" @click="prev">⏮</button>
      <button
        type="button"
        class="icon-button play-button"
        :disabled="!hasTrack"
        :title="playerState.playing ? 'Pause' : 'Play'"
        @click="toggle"
      >
        {{ playerState.loading ? '…' : playerState.playing ? '⏸' : '▶' }}
      </button>
      <button type="button" class="icon-button" :disabled="!hasTrack" title="Next" @click="next">⏭</button>
    </div>

    <div class="track-info">
      <strong v-if="currentTrack">{{ currentTrack.title || currentTrack.id }}</strong>
      <strong v-else class="placeholder">No track playing</strong>
      <span v-if="currentTrack?.artist">{{ currentTrack.artist }}</span>
    </div>

    <div class="seek">
      <span class="time">{{ formatTime(playerState.seek) }}</span>
      <div class="seek-bar" :class="{ disabled: !hasTrack }" @click="onSeekClick">
        <div class="seek-bar-fill" :style="{ width: `${seekPercent}%` }"></div>
      </div>
      <span class="time">{{ formatTime(playerState.duration) }}</span>
    </div>

    <div class="volume">
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        :value="playerState.volume"
        @input="onVolumeInput"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { currentTrack, next, playerState, prev, seekTo, setVolume, toggle } from '../lib/player'

const hasTrack = computed(() => !!currentTrack.value)
const hasHistory = computed(() => playerState.history.length > 0)

const seekPercent = computed(() => {
  if (!playerState.duration) return 0
  return (playerState.seek / playerState.duration) * 100
})

function onSeekClick(event: MouseEvent) {
  if (!hasTrack.value) return
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  seekTo((event.clientX - rect.left) / rect.width)
}

function onVolumeInput(event: Event) {
  setVolume(Number((event.target as HTMLInputElement).value))
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}
</script>

<style scoped>
.player-bar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 1.25rem;
  height: 4.5rem;
  margin-top: 1rem;
  padding: 0 1rem;
  border: 1px solid #26262a;
  border-radius: 10px;
  background: #17171a;
}

.transport {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 0.5rem;
}

.icon-button {
  display: grid;
  place-items: center;
  width: 2.1rem;
  height: 2.1rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #e5e5e5;
  font-size: 0.9rem;
  cursor: pointer;
}

.icon-button:hover:not(:disabled) {
  background: #232327;
}

.icon-button:disabled {
  opacity: 0.35;
  cursor: default;
}

.play-button {
  width: 2.6rem;
  height: 2.6rem;
  background: #4c6ef5;
  color: #fff;
}

.play-button:hover:not(:disabled) {
  background: #3b5bdb;
}

.track-info {
  display: grid;
  flex: 0 0 auto;
  min-width: 10rem;
  max-width: 14rem;

  strong {
    overflow: hidden;
    font-size: 0.8rem;
    color: #fff;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .placeholder {
    color: #6a6a70;
    font-weight: 400;
  }

  span {
    overflow: hidden;
    font-size: 0.72rem;
    color: #a3a3a8;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.seek {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.time {
  flex: 0 0 auto;
  color: #8a8a90;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
}

.seek-bar {
  position: relative;
  flex: 1 1 auto;
  height: 4px;
  border-radius: 999px;
  background: #2a2a2e;
  cursor: pointer;
}

.seek-bar.disabled {
  cursor: default;
}

.seek-bar-fill {
  height: 100%;
  border-radius: 999px;
  background: #4c6ef5;
}

.volume {
  flex: 0 0 auto;
  width: 6rem;

  input[type='range'] {
    width: 100%;
    accent-color: #4c6ef5;
  }
}
</style>
