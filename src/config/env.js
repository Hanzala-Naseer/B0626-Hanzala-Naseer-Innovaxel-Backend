const dotenv = require("dotenv");

// Load test env when testing
if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: ".env.test" });
} else {
  dotenv.config();
}