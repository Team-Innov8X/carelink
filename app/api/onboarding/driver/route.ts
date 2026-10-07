import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-utils";
import { getUsersCollection } from "@/lib/models";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in to complete driver onboarding." }, { status: 401 });
    }

    const body = await request.json();
    const { licenseNumber, vehicleNumber, driverQualification, phone } = body;

    if (!licenseNumber?.trim() || !vehicleNumber?.trim() || !driverQualification?.trim()) {
      return NextResponse.json(
        { error: "Driver license, vehicle number, and qualification are required." },
        { status: 400 }
      );
    }

    const users = await getUsersCollection();
    const userId = session.user.id;
    const filter = ObjectId.isValid(userId) ? { _id: new ObjectId(userId) } : { id: userId };

    await users.updateOne(
      filter as Record<string, unknown>,
      {
        $set: {
          role: "driver",
          licenseNumber: licenseNumber.trim(),
          vehicleNumber: vehicleNumber.trim(),
          driverQualification: driverQualification.trim(),
          ...(phone?.trim() ? { phone: phone.trim() } : {}),
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      redirectUrl: "/driver-dashboard",
      message: "Driver details saved successfully.",
    });
  } catch (error) {
    console.error("Failed to complete driver onboarding:", error);
    return NextResponse.json({ error: "Failed to save driver details." }, { status: 500 });
  }
}
