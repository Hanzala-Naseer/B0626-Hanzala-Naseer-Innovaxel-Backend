
// const { DataTypes } = require("sequelize");
// const sequelize = require("../config/database");

// const Registration = sequelize.define(
//   "Registration",
//   {
//     id: {
//       type: DataTypes.INTEGER,
//       autoIncrement: true,
//       primaryKey: true,
//     },
//     userName: {
//       type: DataTypes.STRING,
//       allowNull: false,
//     },
//     registeredAt: {
//       type: DataTypes.DATE,
//       allowNull: false,
//       defaultValue: DataTypes.NOW,
//     },
//     eventId: {
//       type: DataTypes.INTEGER,
//       allowNull: false,
//     },
//   },
//   {
//     indexes: [
//       {
//         unique: true,
//         fields: ["userName", "eventId"],
//       },
//     ],
//   }
// );

// module.exports = Registration;

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Registration = sequelize.define(
  "Registration",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    registeredAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    eventId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    indexes: [
      {
        fields: ["eventId"], // IMPORTANT for performance
      },
      {
        unique: true,
        fields: ["userName", "eventId"], // prevents duplicates
      },
    ],
  }
);

module.exports = Registration;