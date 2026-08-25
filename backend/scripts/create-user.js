// Manual account creation for MVP - no self-registration flow.
// Usage: node scripts/create-user.js <username> <password>
require('dotenv').config()
const bcrypt = require('bcryptjs')
const { MongoClient } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const DATABASE_NAME = process.env.DATABASE_NAME || 'skyharp3d'

async function main() {
  const [username, password] = process.argv.slice(2)
  if (!username || !password) {
    console.error('Usage: node scripts/create-user.js <username> <password>')
    process.exit(1)
  }

  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  const users = client.db(DATABASE_NAME).collection('users')
  await users.createIndex({ username: 1 }, { unique: true })

  const passwordHash = await bcrypt.hash(password, 12)
  await users.updateOne(
    { username },
    { $set: { username, passwordHash, createdAt: new Date() } },
    { upsert: true }
  )

  console.log(`User "${username}" created/updated.`)
  await client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
