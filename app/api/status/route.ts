import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  let database: "connected" | "unavailable" = "connected";
  try {
    const client = await clientPromise;
    await client.db().command({ ping: 1 });
  } catch {
    database = "unavailable";
  }
  return NextResponse.json({
    service: "CareLink Emergency Backend API",
    status: database === "connected" ? "online" : "degraded",
    database,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: "/api/auth/*",
      seed: "/api/seed",
      holds: {
        create: "POST /api/holds",
        list: "GET /api/holds",
        confirm: "POST /api/holds/[id]/confirm",
        cancel: "POST /api/holds/[id]/cancel",
      },
      hospitalRequests: {
        list: "GET /api/hospital-requests",
        accept: "POST /api/hospital-requests/[id]/accept",
      },
      notifications: {
        list: "GET /api/notifications",
        markRead: "PATCH /api/notifications/[id]",
      },
    },
  }, { status: database === "connected" ? 200 : 503 });
}
