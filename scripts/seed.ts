/**
 * CLI entry point for the demo data generator (loads .env.local first).
 * Usage: npm run db:seed
 */
import "dotenv/config";
import { seedDemo } from "../src/db/seed";

seedDemo()
  .then((result) => {
    console.log(`[mma-os] demo data ready — gym ${result.orgId} with ${result.members} members`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
