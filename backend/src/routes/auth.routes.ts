import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { getUsersCollection } from '../db'
import { signToken } from '../auth'

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {}

  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    res.status(400).json({ error: 'username and password are required' })
    return
  }

  try {
    const users = await getUsersCollection()
    const user = await users.findOne({ username })
    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' })
      return
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash)
    if (!passwordMatches) {
      res.status(401).json({ error: 'Invalid username or password' })
      return
    }

    const token = signToken({ sub: user.username, username: user.username })
    res.json({ token })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})
