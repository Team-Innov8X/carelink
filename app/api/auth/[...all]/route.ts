import { getAuth } from "@/lib/auth";
import connectMongo from "@/lib/mongodb";
import { toNextJsHandler } from "better-auth/next-js";

export const runtime = "nodejs";

async function handle(method: "GET" | "POST", request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  try {
    const mongoStart = Date.now();
    await connectMongo();
    const mongoDuration = Date.now() - mongoStart;

    const authStart = Date.now();
    const handler = toNextJsHandler(getAuth());
    const response = await handler[method](request);
    const authDuration = Date.now() - authStart;

    if (process.env.NODE_ENV !== "production" || mongoDuration > 500 || authDuration > 500) {
      console.log(`[auth-timing] ${method} ${url.pathname} - mongo: ${mongoDuration}ms, auth: ${authDuration}ms, total: ${Date.now() - startedAt}ms`);
    }

    return response;
  } catch (error) {
    console.error(`[auth-error] ${method} ${url.pathname} (${Date.now() - startedAt}ms):`, error);
    return Response.json({ message: "Authentication database is unavailable. Check MongoDB Atlas network access and retry." }, { status: 503 });
  }
}

export const GET = (request: Request) => handle("GET", request);
export const POST = (request: Request) => handle("POST", request);
