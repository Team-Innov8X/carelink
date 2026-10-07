import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-utils";
import { getUsersCollection } from "@/lib/models";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in to complete pharmacy onboarding." }, { status: 401 });
    }

    const body = await request.json();
    const { pharmacyName, pharmacyAddress, pharmacyLicenseNumber, pharmacyType, phone } = body;

    if (!pharmacyName?.trim() || !pharmacyAddress?.trim() || !pharmacyLicenseNumber?.trim()) {
      return NextResponse.json(
        { error: "Pharmacy name, address, and license number are required." },
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
          role: "pharmacy",
          pharmacyName: pharmacyName.trim(),
          pharmacyAddress: pharmacyAddress.trim(),
          pharmacyLicenseNumber: pharmacyLicenseNumber.trim(),
          pharmacyType: pharmacyType || "Retail pharmacy",
          ...(phone?.trim() ? { phone: phone.trim() } : {}),
          updatedAt: new Date(),
        },
      }
    );

    return NextResponse.json({
      success: true,
      redirectUrl: "/pharmacy-dashboard",
      message: "Pharmacy details saved successfully.",
    });
  } catch (error) {
    console.error("Failed to complete pharmacy onboarding:", error);
    return NextResponse.json({ error: "Failed to save pharmacy details." }, { status: 500 });
  }
}
