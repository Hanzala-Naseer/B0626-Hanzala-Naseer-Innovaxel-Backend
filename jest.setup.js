
// const path = require("path");
// const dotenv = require("dotenv");

// dotenv.config({
//   path: path.resolve(__dirname, ".env.test"),
//   override: true, 
// });


// const url = process.env.DATABASE_URL ?? "";

// const PROD_URL_FINGERPRINTS = [
//   "neon.tech",
//   "neon.db",
// ];

// const looksLikeProd = PROD_URL_FINGERPRINTS.some((fp) => url.includes(fp));

// if (looksLikeProd) {
//   throw new Error(
//     "\n\n🚨  [JEST SAFETY ABORT]\n" +
//       "DATABASE_URL is pointing at your Neon PRODUCTION database!\n" +
//       "Make sure .env.test exists and contains your LOCAL PostgreSQL URL.\n" +
//       `Detected URL prefix: ${url.slice(0, 50)}...\n`
//   );
// }

// if (!url) {
//   throw new Error(
//     "\n\n🚨  [JEST SAFETY ABORT]\n" +
//       "DATABASE_URL is not set at all after loading .env.test.\n" +
//       "Check that .env.test exists at the project root and is not empty.\n"
//   );
// }

// console.log("[Jest] ✓ .env.test loaded — using local test database");
// console.log(
//   "[Jest] ✓ DATABASE_URL:",
//   url.replace(/:\/\/.*@/, "://<credentials>@")
// );

require("dotenv").config({ path: ".env.test", override: true });

const url = process.env.DATABASE_URL ?? "";

if (!url) throw new Error("DATABASE_URL is not set. Check .env.test exists.");
if (url.includes("neon.tech") || url.includes("neon.db"))
  throw new Error("DATABASE_URL is pointing at Neon production! Use local DB in .env.test.");

console.log("[Jest] ✓ .env.test loaded — using local test database");
console.log("[Jest] ✓ DATABASE_URL:", url);