require("dotenv").config({
  path: process.env.NODE_ENV === "test" ? ".env.test" : ".env",
  override: true,
});

console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("DATABASE_URL:", process.env.DATABASE_URL);

const app = require("./app");
const prisma = require("./config/prisma");
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

if (require.main === module) startServer();

module.exports = app;