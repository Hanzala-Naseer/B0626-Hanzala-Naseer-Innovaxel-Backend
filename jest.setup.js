/**
 * jest.setup.js  (project root)
 *
 * Listed under Jest's "setupFiles" — this runs BEFORE any test module
 * is imported, which means it runs before prisma.js is ever require()'d.
 * That's what makes it the correct place to load environment variables.
 *
 * "setupFilesAfterFramework" is too late — modules are already cached by then.
 * "setupFiles" is the right hook.
 */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({
  path: path.resolve(__dirname, ".env.test"),
  override: true, // win over any shell-exported DATABASE_URL
});

// ─── Safety guard ────────────────────────────────────────────────────────────
// Hard-stop if the URL still looks like production.
// Edit the string below to match a unique part of your Neon URL
// (e.g. your project subdomain like "ep-cool-name-123456.us-east-2.aws.neon.tech")
const url = process.env.DATABASE_URL ?? "";

const PROD_URL_FINGERPRINTS = [
  "neon.tech",
  "neon.db",
  // add more substrings here if your Neon URL has a different pattern
];

const looksLikeProd = PROD_URL_FINGERPRINTS.some((fp) => url.includes(fp));

if (looksLikeProd) {
  throw new Error(
    "\n\n🚨  [JEST SAFETY ABORT]\n" +
      "DATABASE_URL is pointing at your Neon PRODUCTION database!\n" +
      "Make sure .env.test exists and contains your LOCAL PostgreSQL URL.\n" +
      `Detected URL prefix: ${url.slice(0, 50)}...\n`
  );
}

if (!url) {
  throw new Error(
    "\n\n🚨  [JEST SAFETY ABORT]\n" +
      "DATABASE_URL is not set at all after loading .env.test.\n" +
      "Check that .env.test exists at the project root and is not empty.\n"
  );
}

console.log("[Jest] ✓ .env.test loaded — using local test database");
console.log(
  "[Jest] ✓ DATABASE_URL:",
  url.replace(/:\/\/.*@/, "://<credentials>@")
);