import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { getDoctorsCollection, getHospitalsCollection, initializeIndexes } from "@/lib/models";
import { doctorCreateSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/hospitals/[id]/doctors
 * Role: any signed-in user
 * Returns real doctor records from DB for the specified hospital.
 */
export async function GET(_req: NextRequest, { params }: Context) {
  try {
    const auth = await requireRole();
    if (!auth.authorized || !auth.user) {
      return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    }

    const { id } = await params;
    if (!id) return errorResponse("Missing hospital ID", 400);

    await initializeIndexes();
    const doctorsCol = await getDoctorsCollection();

    // Query doctors for this hospital
    const doctors = await doctorsCol
      .find({ hospitalId: id })
      .sort({ updatedAt: -1 })
      .toArray();

    const formatted = doctors.map((doc) => ({
      ...doc,
      id: doc._id?.toString() ?? doc.id,
      _id: doc._id?.toString() ?? doc.id,
    }));

    return NextResponse.json({
      success: true,
      count: formatted.length,
      doctors: formatted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load doctors";
    return errorResponse(message, 500);
  }
}

/**
 * POST /api/hospitals/[id]/doctors
 * Role: hospital (own)
 * Add a new doctor to the hospital roster.
 */
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const auth = await requireRole(["hospital", "hospital_staff", "admin"]);
    if (!auth.authorized || !auth.user) {
      return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    }

    const { id } = await params;
    if (!id) return errorResponse("Missing hospital ID", 400);

    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const hospitalsCol = await getHospitalsCollection();
    const queryId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const hospital = await hospitalsCol.findOne({
      $or: [{ _id: queryId as ObjectId }, { id }, { code: id }],
    });
    if (!hospital) return errorResponse("Hospital not found", 404);

    const linkedHospitalId = profile.role === "admin" ? id : await resolveHospitalId(profile);
    const hospitalDocId = hospital._id?.toString() ?? hospital.id;
    if (profile.role !== "admin" && linkedHospitalId !== id && linkedHospitalId !== hospitalDocId && linkedHospitalId !== hospital.code) {
      return errorResponse("You can only manage doctors for your own hospital.", 403);
    }

    let bodyJson: unknown;
    try {
      bodyJson = await req.json();
    } catch {
      return errorResponse("Request body must be valid JSON", 400);
    }

    const parsed = doctorCreateSchema.safeParse(bodyJson);
    if (!parsed.success) return validationError(parsed.error);

    await initializeIndexes();
    const doctorsCol = await getDoctorsCollection();
    const now = new Date();

    const newDoctor = {
      hospitalId: id,
      name: parsed.data.name,
      qualification: parsed.data.qualification,
      specialization: parsed.data.specialization,
      availability: parsed.data.availability,
      phone: parsed.data.phone,
      experienceYears: parsed.data.experienceYears,
      createdAt: now,
      updatedAt: now,
    };

    const inserted = await doctorsCol.insertOne(newDoctor);
    const createdDoctor = {
      ...newDoctor,
      _id: inserted.insertedId.toString(),
      id: inserted.insertedId.toString(),
    };

    return NextResponse.json(createdDoctor, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create doctor";
    return errorResponse(message, 500);
  }
}
