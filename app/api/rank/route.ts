import { getDoctorsCollection, getHospitalsCollection, getResourcesCollection } from "@/lib/models";
import { addTravelTimes, rankHospitals } from "@/lib/ranking";
import { requireRole } from "@/lib/auth-utils";
import { expirePendingHolds } from "@/lib/services/hold-service";
import { createRankHandler } from "@/lib/rank-handler";
import clientPromise from "@/lib/mongodb";

const handleRank = createRankHandler({
  authorize: () => requireRole(["ambulance_driver", "driver", "dispatcher", "patient"]),
  expirePendingHolds,
  loadData: async () => {
    const [hospitals, resources, doctors, settings] = await Promise.all([
      (await getHospitalsCollection()).find({ status: { $in: ["active", "busy"] }, ...(process.env.NODE_ENV === "production" ? { isDemo: { $ne: true } } : {}) }).toArray(),
      (await getResourcesCollection()).find({}).toArray(),
      (await getDoctorsCollection()).find({ availability: { $in: ["available", "on_call"] } }).toArray(),
      (await clientPromise).db().collection("carelinkSettings").findOne({ _id: "carelink" } as never),
    ]);
    return {
      hospitals,
      resources,
      doctors,
      settings: settings as { weights?: { resource?: number; travel?: number; freshness?: number } } | null,
    };
  },
  addTravelTimes,
  rankHospitals,
});

export const POST = handleRank;
