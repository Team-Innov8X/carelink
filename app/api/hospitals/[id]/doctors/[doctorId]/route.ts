import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireRole, resolveHospitalId } from "@/lib/auth-utils";
import { getDoctorsCollection } from "@/lib/models";
import { doctorUpdateSchema } from "@/lib/validation";
import { errorResponse, validationError } from "@/lib/api-response";

type Context = { params: Promise<{ id: string; doctorId: string }> };

/**
 * PATCH /api/hospitals/[id]/doctors/[doctorId]
 * Role: hospital (own)
 * Updates a doctor's record and sets updatedAt.
 */
export async function PATCH(req: NextRequest, { params }: Context) {
  try {
    const auth = await requireRole(["hospital", "hospital_staff", "admin"]);
    if (!auth.authorized || !auth.user) {
      return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    }

    const { id, doctorId } = await params;
    if (!id || !doctorId) return errorResponse("Missing parameters", 400);

    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const linkedHospitalId = profile.role === "admin" ? id : await resolveHospitalId(profile);

    const doctorsCol = await getDoctorsCollection();
    const queryDocId = ObjectId.isValid(doctorId) ? new ObjectId(doctorId) : doctorId;

    const existingDoctor = await doctorsCol.findOne({
      $or: [{ _id: queryDocId as ObjectId }, { id: doctorId }],
      hospitalId: id,
    });

    if (!existingDoctor) return errorResponse("Doctor not found for this hospital", 404);

    if (profile.role !== "admin" && linkedHospitalId !== id && linkedHospitalId !== existingDoctor.hospitalId) {
      return errorResponse("You can only modify doctors for your own hospital.", 403);
    }

    let bodyJson: unknown;
    try {
      bodyJson = await req.json();
    } catch {
      return errorResponse("Request body must be valid JSON", 400);
    }

    const parsed = doctorUpdateSchema.safeParse(bodyJson);
    if (!parsed.success) return validationError(parsed.error);

    const now = new Date();
    const updateFields: Record<string, unknown> = {
      updatedAt: now,
    };
    if (parsed.data.name !== undefined) updateFields.name = parsed.data.name;
    if (parsed.data.qualification !== undefined) updateFields.qualification = parsed.data.qualification;
    if (parsed.data.specialization !== undefined) updateFields.specialization = parsed.data.specialization;
    if (parsed.data.availability !== undefined) updateFields.availability = parsed.data.availability;
    if (parsed.data.phone !== undefined) updateFields.phone = parsed.data.phone;
    if (parsed.data.experienceYears !== undefined) updateFields.experienceYears = parsed.data.experienceYears;

    const updated = await doctorsCol.findOneAndUpdate(
      { _id: existingDoctor._id },
      { $set: updateFields },
      { returnDocument: "after" },
    );

    return NextResponse.json({
      success: true,
      doctor: {
        ...updated,
        id: updated?._id?.toString(),
        _id: updated?._id?.toString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update doctor";
    return errorResponse(message, 500);
  }
}

/**
 * DELETE /api/hospitals/[id]/doctors/[doctorId]
 * Role: hospital (own)
 * Deletes a doctor from the hospital roster.
 */
export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const auth = await requireRole(["hospital", "hospital_staff", "admin"]);
    if (!auth.authorized || !auth.user) {
      return errorResponse(auth.reason, auth.reason === "UNAUTHENTICATED" ? 401 : 403);
    }

    const { id, doctorId } = await params;
    if (!id || !doctorId) return errorResponse("Missing parameters", 400);

    const profile = auth.user as typeof auth.user & { role?: string; hospitalId?: string; hospitalName?: string };
    const linkedHospitalId = profile.role === "admin" ? id : await resolveHospitalId(profile);

    const doctorsCol = await getDoctorsCollection();
    const queryDocId = ObjectId.isValid(doctorId) ? new ObjectId(doctorId) : doctorId;

    const existingDoctor = await doctorsCol.findOne({
      $or: [{ _id: queryDocId as ObjectId }, { id: doctorId }],
      hospitalId: id,
    });

    if (!existingDoctor) {
      return errorResponse("Doctor not found for this hospital", 404);
    }

    if (profile.role !== "admin" && linkedHospitalId !== id && linkedHospitalId !== existingDoctor.hospitalId) {
      return errorResponse("You can only delete doctors for your own hospital.", 403);
    }

    const result = await doctorsCol.deleteOne({
      _id: existingDoctor._id,
    });

    if (result.deletedCount === 0) {
      return errorResponse("Doctor not found for this hospital", 404);
    }

    return NextResponse.json({
      success: true,
      message: "Doctor successfully removed from hospital roster.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete doctor";
    return errorResponse(message, 500);
  }
}
