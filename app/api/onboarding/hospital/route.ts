import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-utils";
import { getUsersCollection, getHospitalsCollection } from "@/lib/models";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Please sign in to complete hospital onboarding." }, { status: 401 });
    }

    const body = await request.json();
    const { hospitalName, hospitalAddress, hospitalRegistrationNumber, hospitalSpecialties, phone } = body;

    if (!hospitalName?.trim() || !hospitalAddress?.trim() || !hospitalRegistrationNumber?.trim()) {
      return NextResponse.json(
        { error: "Hospital name, address, and registration number are required." },
        { status: 400 }
      );
    }

    const trimmedName = hospitalName.trim();
    const trimmedAddress = hospitalAddress.trim();
    const trimmedReg = hospitalRegistrationNumber.trim();
    const trimmedSpecialties = (hospitalSpecialties || "").trim();
    const trimmedPhone = (phone || "").trim();

    // 1. Update user record
    const users = await getUsersCollection();
    const userId = session.user.id;
    const filter = ObjectId.isValid(userId) ? { _id: new ObjectId(userId) } : { id: userId };

    await users.updateOne(
      filter as Record<string, unknown>,
      {
        $set: {
          role: "hospital_staff",
          hospitalName: trimmedName,
          hospitalAddress: trimmedAddress,
          hospitalRegistrationNumber: trimmedReg,
          hospitalSpecialties: trimmedSpecialties,
          ...(trimmedPhone ? { phone: trimmedPhone } : {}),
          updatedAt: new Date(),
        },
      }
    );

    // 2. Ensure hospital exists in hospitals collection
    const hospitals = await getHospitalsCollection();
    const existingHospital = await hospitals.findOne({
      $or: [{ name: trimmedName }, { code: `HOSP-${trimmedReg.toUpperCase()}` }],
    });

    if (!existingHospital) {
      const now = new Date();
      await hospitals.insertOne({
        name: trimmedName,
        code: `HOSP-${new ObjectId().toHexString().slice(-6).toUpperCase()}`,
        address: {
          street: trimmedAddress,
          city: "New Delhi",
          state: "Delhi",
          zipCode: "110001",
          country: "India",
        },
        location: {
          type: "Point",
          coordinates: [77.209 + (Math.random() - 0.5) * 0.05, 28.6139 + (Math.random() - 0.5) * 0.05],
        },
        contact: {
          phone: trimmedPhone || "+91-11-2345-6789",
          email: session.user.email || "info@hospital.carelink",
          emergencyHotline: trimmedPhone || "+91-11-2345-6790",
        },
        capacitySummary: {
          totalBeds: 50,
          availableBeds: 12,
          totalVentilators: 10,
          availableVentilators: 3,
        },
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      redirectUrl: "/hospital-admin",
      message: "Hospital details saved successfully.",
    });
  } catch (error) {
    console.error("Failed to complete hospital onboarding:", error);
    return NextResponse.json({ error: "Failed to save hospital details." }, { status: 500 });
  }
}
