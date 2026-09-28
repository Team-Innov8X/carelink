import { getAuth } from "@/lib/auth";
import connectMongo from "@/lib/mongodb";
import { toNextJsHandler } from "better-auth/next-js";

async function handle(method: "GET" | "POST", request: Request) {
  try {
    await connectMongo();
    return toNextJsHandler(getAuth())[method](request);
  } catch {
    return Response.json({ message: "Authentication database is unavailable. Check MongoDB Atlas network access and retry." }, { status: 503 });
  }
}

export const GET = (request: Request) => handle("GET", request);
export const POST = (request: Request) => handle("POST", request);
