import { NextResponse } from "next/server";
import { seedDatabase } from "@/scripts/seed/seed-database";

export async function POST() {
  try {
    return NextResponse.json(await seedDatabase());
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Seeding failed" },
      { status: 500 },
    );
  }
}
