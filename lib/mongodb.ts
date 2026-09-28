import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/carelink";
const globalWithMongo = globalThis as typeof globalThis & {
  _mongoClient?: MongoClient;
  _mongoClientUri?: string;
  _mongoClientPromise?: Promise<MongoClient>;
};

// Reuse one pool through Next.js hot reloads and server module reuse.
if (!globalWithMongo._mongoClient || globalWithMongo._mongoClientUri !== uri) {
  globalWithMongo._mongoClient = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8_000,
    connectTimeoutMS: 8_000,
  });
  globalWithMongo._mongoClientUri = uri;
  globalWithMongo._mongoClientPromise = undefined;
}

export let client = globalWithMongo._mongoClient!;

/**
 * Establish the shared connection on demand. Clear a failed connect promise so
 * the next request can retry after a transient Atlas/network problem instead
 * of inheriting a permanently rejected promise for the lifetime of dev mode.
 */
export async function connectMongo() {
  const mongoClient = globalWithMongo._mongoClient!;
  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = mongoClient.connect().catch((error: unknown) => {
      if (globalWithMongo._mongoClient === mongoClient) {
        // A failed initial TLS/server-selection handshake can leave this
        // MongoClient's topology closed. Replace the client itself so later
        // requests can recover after network access is restored.
        void mongoClient.close().catch(() => undefined);
        const replacement = new MongoClient(uri, {
          maxPoolSize: 10,
          serverSelectionTimeoutMS: 8_000,
          connectTimeoutMS: 8_000,
        });
        globalWithMongo._mongoClient = replacement;
        client = replacement;
        globalWithMongo._mongoClientPromise = undefined;
      }
      throw error;
    });
  }
  return globalWithMongo._mongoClientPromise;
}

export default connectMongo;
