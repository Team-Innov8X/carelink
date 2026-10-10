import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/carelink";

const globalWithMongo = globalThis as typeof globalThis & {
  _careLinkMongoClient?: MongoClient;
  _careLinkMongoClientPromise?: Promise<MongoClient>;
};

if (!globalWithMongo._careLinkMongoClient) {
  globalWithMongo._careLinkMongoClient = new MongoClient(uri);
  globalWithMongo._careLinkMongoClientPromise = globalWithMongo._careLinkMongoClient.connect();
}

const client = globalWithMongo._careLinkMongoClient;
const clientPromise = globalWithMongo._careLinkMongoClientPromise!;

export { client };
export default clientPromise;
