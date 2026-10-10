import { NextResponse } from "next/server";
import { seedDatabase } from "@/scripts/seed/seed-database";

export async function POST(request: Request) {
  const secret = process.env.SEED_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: 'Seeding is disabled.' }, { status: 404 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await seedDatabase());
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Seeding failed" },
      { status: 500 },
    );
  }
}
