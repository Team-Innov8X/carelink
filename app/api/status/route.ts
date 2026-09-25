import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    service: "CareLink Emergency Backend API",
    status: "online",
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
    },
  });
}
