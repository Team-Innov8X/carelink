import { NextResponse } from "next/server";
import { seedDatabase } from "@/scripts/seed/seed-database";

export async function POST(request: Request) {
  const secret = process.env.SEED_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: 'Seeding is disabled.' }, { status: 404 });
  if (request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  try {
    const url = new URL(request.url);
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    if (url.searchParams.get('lat') === null || url.searchParams.get('lng') === null) return NextResponse.json({ success: false, error: 'Provide lat and lng to seed demo data near the presenter.' }, { status: 400 });
    return NextResponse.json(await seedDatabase(lat, lng));
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Seeding failed" },
      { status: 500 },
    );
  }
}
