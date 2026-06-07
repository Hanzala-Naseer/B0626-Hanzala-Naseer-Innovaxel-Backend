

require("dotenv").config({ path: ".env.test", override: true });

const url = process.env.DATABASE_URL ?? "";

if (!url) throw new Error("DATABASE_URL is not set. Check .env.test exists.");
if (url.includes("neon.tech") || url.includes("neon.db"))
  throw new Error("DATABASE_URL is pointing at Neon production! Use local DB in .env.test.");

console.log("[Jest] ✓ .env.test loaded — using local test database");
console.log("[Jest] ✓ DATABASE_URL:", url);