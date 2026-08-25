<script setup lang="ts">
import { ref } from 'vue'
import LoginView from './components/LoginView.vue'
import MapView from './components/MapView.vue'
import { getToken } from './lib/auth'

const isAuthenticated = ref(!!getToken())
</script>

<template>
  <MapView v-if="isAuthenticated" @logged-out="isAuthenticated = false" />
  <LoginView v-else @logged-in="isAuthenticated = true" />
</template>
