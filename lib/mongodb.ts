import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/carelink";

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  let globalWithMongo = global as typeof globalThis & {
    _mongoClient?: MongoClient;
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClient) {
    globalWithMongo._mongoClient = new MongoClient(uri);
    globalWithMongo._mongoClientPromise = globalWithMongo._mongoClient.connect();
  }
  client = globalWithMongo._mongoClient;
  clientPromise = globalWithMongo._mongoClientPromise!;
} else {
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

export { client };
export default clientPromise;
