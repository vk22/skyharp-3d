import { Collection, Db, MongoClient } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'
const DATABASE_NAME = process.env.DATABASE_NAME || 'skyharp3d'

export interface UserDocument {
  username: string
  passwordHash: string
  createdAt: Date
}

let client: MongoClient | undefined
let databasePromise: Promise<Db> | undefined

function getDatabase(): Promise<Db> {
  if (!databasePromise) {
    client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    databasePromise = client.connect().then((connected) => connected.db(DATABASE_NAME))
  }
  return databasePromise
}

export async function getUsersCollection(): Promise<Collection<UserDocument>> {
  const db = await getDatabase()
  const collection = db.collection<UserDocument>('users')
  await collection.createIndex({ username: 1 }, { unique: true })
  return collection
}

export async function closeDb(): Promise<void> {
  await client?.close()
  client = undefined
  databasePromise = undefined
}
