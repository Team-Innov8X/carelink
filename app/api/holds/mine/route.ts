import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { expireDueRequests } from "@/lib/holds";
import { getHoldsCollection } from "@/lib/models/db";

export async function GET() {
  const auth = await requireRole("patient");
  if (!auth.authorized) return NextResponse.json({ error: auth.reason }, { status: auth.reason === "UNAUTHENTICATED" ? 401 : 403 });
  await expireDueRequests();
  const holds = await getHoldsCollection();
  const requests = await holds.find({ patientId: auth.user!.id }).sort({ createdAt: -1 }).toArray();
  const positions = new Map<string, number>();
  const allQueued = await holds.find({ status: "queued" }).sort({ hospitalId: 1, seq: 1 }).toArray();
  let previousHospital = "";
  let position = 0;
  for (const queued of allQueued) {
    if (queued.hospitalId !== previousHospital) { previousHospital = queued.hospitalId; position = 0; }
    positions.set(String(queued._id), ++position);
  }
  return NextResponse.json(requests.map((hold) => hold.status === "queued" ? { ...hold, position: positions.get(String(hold._id)) } : hold));
}
