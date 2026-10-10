import { PATCH as updateAvailability } from "../../sos/available/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return updateAvailability(request);
}
