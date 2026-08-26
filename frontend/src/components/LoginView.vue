<template>
  <div class="login-page">
    <form class="login-card" @submit.prevent="handleSubmit">
      <h1>Space Voyage</h1>
      <!-- <p class="subtitle">Sign in to explore the map</p> -->

      <label>
        Username
        <input v-model="username" type="text" autocomplete="username" required />
      </label>

      <label>
        Password
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>

      <div v-if="error" class="error">{{ error }}</div>

      <button type="submit" :disabled="loading">
        {{ loading ? 'Loging in…' : 'Login' }}
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { login } from '../lib/api'
import { setToken } from '../lib/auth'

const emit = defineEmits<{ 'logged-in': [] }>()

const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleSubmit() {
  loading.value = true
  error.value = ''
  try {
    const token = await login(username.value, password.value)
    setToken(token)
    emit('logged-in')
  } catch (caught: any) {
    error.value = caught.message || 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100vh;
  background: #0d0d0f;
}

.login-card {
  display: grid;
  gap: 0.9rem;
  width: 20rem;
  padding: 2rem;
  border: 1px solid #2a2a2e;
  border-radius: 12px;
  background: #17171a;
}

h1 {
  margin: 0;
  font-size: 1.25rem;
  color: #fff;
  padding: 1rem 0;
  font-weight: 400;;
  text-align: center;
}

.subtitle {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  color: #8a8a90;
  text-align: center;
}

label {
  display: grid;
  gap: 0.3rem;
  font-size: 0.75rem;
  color: #a3a3a8;
}

input {
  padding: 0.55rem 0.65rem;
  border: 1px solid #35353a;
  border-radius: 7px;
  background: #0d0d0f;
  color: #fff;
  font-size: 0.9rem;
}

input:focus {
  outline: none;
  border-color: #6e8fd6;
}

button {
  padding: 0.6rem;
  border: 0;
  border-radius: 7px;
  background: #ebebeb;
  color: #111;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.6;
  cursor: default;
}

.error {
  padding: 0.5rem 0.6rem;
  border-radius: 7px;
  background: rgb(185 28 28 / 15%);
  color: #f87171;
  font-size: 0.75rem;
}
</style>
