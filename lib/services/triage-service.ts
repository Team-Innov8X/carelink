import type { Collection } from "mongodb";

export type TriageUrgency = "critical" | "high" | "moderate" | "low" | "assessing";

export type TriageCategory =
  | "cardiac_arrest"
  | "trauma"
  | "respiratory_distress"
  | "stroke_symptoms"
  | "severe_bleeding"
  | "allergic_reaction"
  | "burns"
  | "other";

export interface TriageMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date | string;
  urgency?: TriageUrgency;
  category?: TriageCategory | null;
  shouldEscalate?: boolean;
}

export interface TriageConversation {
  _id: string; // conversationId
  userId?: string;
  messages: TriageMessage[];
  questionCount: number;
  urgency?: TriageUrgency;
  category?: TriageCategory | null;
  shouldEscalate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TriageLog {
  _id?: string;
  conversationId: string;
  userId?: string;
  input: string;
  history: Array<{ role: string; content: string }>;
  output: {
    reply: string;
    urgency: TriageUrgency;
    category: TriageCategory | null;
    shouldEscalate: boolean;
  };
  shouldEscalate: boolean;
  provider: string;
  timestamp: Date;
}

// In-memory fallback in case Mongo is unavailable (or during test environments)
const memoryConversations = new Map<string, TriageConversation>();
const memoryLogs: TriageLog[] = [];

async function getMongoClient() {
  if (process.env.NODE_ENV === "test" || !process.env.MONGODB_URI) return null;
  try {
    const mod = await import("../mongodb").catch(() => import("@/lib/mongodb"));
    const fn = (mod as { default?: () => Promise<unknown> }).default || mod;
    return typeof fn === "function" ? await fn() : null;
  } catch {
    return null;
  }
}

async function getTriageConversationsCollection(): Promise<Collection<TriageConversation> | null> {
  try {
    const client = await getMongoClient() as { db: () => { collection: (name: string) => unknown } } | null;
    if (!client) return null;
    return client.db().collection("triageConversations") as Collection<TriageConversation>;
  } catch {
    return null;
  }
}

async function getTriageLogsCollection(): Promise<Collection<TriageLog> | null> {
  try {
    const client = await getMongoClient() as { db: () => { collection: (name: string) => unknown } } | null;
    if (!client) return null;
    return client.db().collection("triageLogs") as Collection<TriageLog>;
  } catch {
    return null;
  }
}

export async function getConversation(conversationId: string): Promise<TriageConversation | null> {
  const collection = await getTriageConversationsCollection();
  if (collection) {
    try {
      const doc = await collection.findOne({ _id: conversationId });
      if (doc) return doc;
    } catch (e) {
      console.warn("Error querying MongoDB for triage conversation:", e);
    }
  }
  return memoryConversations.get(conversationId) ?? null;
}

export async function saveConversation(conversation: TriageConversation): Promise<void> {
  // Always update in-memory cache
  memoryConversations.set(conversation._id, { ...conversation, updatedAt: new Date() });

  const collection = await getTriageConversationsCollection();
  if (collection) {
    try {
      await collection.updateOne(
        { _id: conversation._id },
        {
          $set: {
            messages: conversation.messages,
            questionCount: conversation.questionCount,
            urgency: conversation.urgency,
            category: conversation.category,
            shouldEscalate: conversation.shouldEscalate,
            userId: conversation.userId,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: conversation.createdAt || new Date(),
          },
        },
        { upsert: true }
      );
    } catch (e) {
      console.warn("Error persisting triage conversation to MongoDB:", e);
    }
  }
}

export async function logClassification(log: TriageLog): Promise<void> {
  memoryLogs.unshift(log);
  if (memoryLogs.length > 200) memoryLogs.pop();

  const collection = await getTriageLogsCollection();
  if (collection) {
    try {
      await collection.insertOne({
        ...log,
        timestamp: log.timestamp || new Date(),
      });
    } catch (e) {
      console.warn("Error persisting triage log to MongoDB:", e);
    }
  }
}

export async function getRecentTriageLogs(limit = 20): Promise<TriageLog[]> {
  const collection = await getTriageLogsCollection();
  if (collection) {
    try {
      const docs = await collection.find({}).sort({ timestamp: -1 }).limit(limit).toArray();
      if (docs.length > 0) return docs;
    } catch (e) {
      console.warn("Error querying triage logs from MongoDB:", e);
    }
  }
  return memoryLogs.slice(0, limit);
}
