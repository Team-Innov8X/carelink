import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    service: "CareLink Emergency Backend API",
    status: "online",
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: "/api/auth/*",
      seed: "/api/seed",
    },
  });
}
