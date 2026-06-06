const { Sequelize } = require("sequelize");
const dotenv = require("dotenv");

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

const sequelize = new Sequelize(databaseUrl);

// console.log("DATABASE FILE LOADED");
// console.log(sequelize);

module.exports = sequelize;
