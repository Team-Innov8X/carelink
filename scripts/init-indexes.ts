import { initializeIndexes } from "@/lib/models/db";

async function main() {
  console.log("Initializing database indexes...");
  await initializeIndexes();
  console.log("Indexes initialized successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Index initialization failed:", err);
  process.exit(1);
});
