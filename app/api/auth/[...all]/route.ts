import { auth } from "@/lib/auth";
import { connectMongoClient } from "@/lib/mongodb";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

export async function GET(request: Request) {
  await connectMongoClient();
  return handlers.GET(request);
}

export async function POST(request: Request) {
  await connectMongoClient();
  return handlers.POST(request);
}
