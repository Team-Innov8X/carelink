import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/carelink";

const globalWithMongo = globalThis as typeof globalThis & {
  _careLinkMongoClient?: MongoClient;
  _careLinkMongoClientPromise?: Promise<MongoClient>;
};

if (!globalWithMongo._careLinkMongoClient) {
  globalWithMongo._careLinkMongoClient = new MongoClient(uri);
}

const client = globalWithMongo._careLinkMongoClient;

/**
 * Reconnect after a transient startup/network failure instead of leaving every
 * database-backed route with the same permanently rejected startup promise.
 */
export async function connectMongoClient(): Promise<MongoClient> {
  if (!globalWithMongo._careLinkMongoClientPromise) {
    const attempt = client.connect();
    globalWithMongo._careLinkMongoClientPromise = attempt;
  }
  const attempt = globalWithMongo._careLinkMongoClientPromise;
  try {
    return await attempt;
  } finally {
    // MongoClient.connect() safely returns immediately while already connected;
    // clearing this lets a later request reconnect after a dropped topology.
    if (globalWithMongo._careLinkMongoClientPromise === attempt) {
      globalWithMongo._careLinkMongoClientPromise = undefined;
    }
  }
}

// Preserve the existing `await clientPromise` API while making each await able
// to retry a failed initial connection on the shared MongoClient instance.
const clientPromise = {
  then<TResult1 = MongoClient, TResult2 = never>(
    onfulfilled?: ((value: MongoClient) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return connectMongoClient().then(onfulfilled, onrejected);
  },
} as Promise<MongoClient>;

export { client };
export default clientPromise;
