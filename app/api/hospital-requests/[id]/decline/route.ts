import { requireRole } from "@/lib/auth-utils";
import { workflowCollections } from "@/lib/sos";

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext<"/api/hospital-requests/[id]/decline">) {
  const auth = await requireRole(["hospital_staff", "hospital"]);
  if (!auth.authorized || !auth.user) {
    return Response.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const { id } = await context.params;
  const { hospitalRequests, notifications } = await workflowCollections();
  const hospitalRequest = await hospitalRequests.findOne({ _id: id });
  if (!hospitalRequest) return Response.json({ error: "Hospital request not found." }, { status: 404 });

  const profile = auth.user as typeof auth.user & { hospitalId?: string; hospitalName?: string };
  const belongsToHospital = profile.hospitalId === hospitalRequest.hospitalId
    || profile.hospitalName === hospitalRequest.hospitalName;
  if (process.env.NODE_ENV !== "development" && !belongsToHospital) {
    return Response.json({ error: "This request belongs to another hospital." }, { status: 403 });
  }

  const declinedAt = new Date();
  const result = await hospitalRequests.updateOne(
    { _id: id, status: "pending" },
    { $set: { status: "rejected", rejectedAt: declinedAt, updatedAt: declinedAt, rejectedByUserId: auth.user.id } },
  );
  if (result.modifiedCount !== 1) {
    return Response.json({ error: "This request is already being handled or is no longer pending." }, { status: 409 });
  }

  await notifications.updateOne(
    { _id: `hospital-declined-${id}` },
    { $setOnInsert: {
      _id: `hospital-declined-${id}`,
      recipientId: hospitalRequest.patientId,
      type: "hospital_request_declined",
      title: "Hospital declined your request",
      message: `${hospitalRequest.hospitalName} declined your request. You can choose another hospital or send a new request.`,
      relatedRequestId: hospitalRequest.sosRequestId,
      createdAt: declinedAt,
    } },
    { upsert: true },
  );

  return Response.json({ success: true, request: { id, status: "rejected", rejectedAt: declinedAt }, message: "Request declined. The patient was notified." });
}
