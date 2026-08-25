import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { authRouter } from './routes/auth.routes'
import { tracksRouter } from './routes/tracks.routes'

const app = express()
const PORT = Number(process.env.PORT) || 3001
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'

app.use(cors({ origin: ALLOWED_ORIGIN }))
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
app.use('/api', authRouter)
app.use('/api', tracksRouter)

app.listen(PORT, () => {
  console.log(`skyharp-3d backend listening on port ${PORT}`)
})
