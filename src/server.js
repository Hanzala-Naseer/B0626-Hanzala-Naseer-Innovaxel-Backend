// require("dotenv").config();

const app = require("./app");
const prisma = require("./config/prisma");

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log("Database connected successfully");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
}

// ✅ IMPORTANT: prevent server start during tests
if (process.env.NODE_ENV !== "test") {
  startServer();
}

module.exports = app;