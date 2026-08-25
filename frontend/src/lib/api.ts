import { clearToken, getToken } from './auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4001/api'

export class UnauthorizedError extends Error {}

export interface Track {
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
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  })

  const body = await response.json().catch(() => ({}))

  if (response.status === 401) {
    // No token means this was a login attempt itself - a 401 there means
    // wrong credentials, not an expired session, so surface the real message.
    if (!token) {
      throw new Error(body.error || 'Invalid username or password')
    }
    clearToken()
    throw new UnauthorizedError('Session expired, please log in again')
  }

  if (!response.ok) {
    throw new Error(body.error || `Request failed: ${response.status}`)
  }

  return body as T
}

export async function login(username: string, password: string): Promise<string> {
  const { token } = await request<{ token: string }>('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  })
  return token
}

export async function fetchTracks(): Promise<Track[]> {
  const { tracks } = await request<{ tracks: Track[] }>('/tracks')
  return tracks
}

export async function fetchAudioUrl(trackId: string): Promise<string> {
  const { url } = await request<{ url: string }>(`/tracks/${encodeURIComponent(trackId)}/audio-url`)
  return url
}
