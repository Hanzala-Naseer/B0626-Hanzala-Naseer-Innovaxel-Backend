const Event = require("./Event");
const Registration = require("./Registration");

Event.hasMany(Registration, {
  foreignKey: "eventId",
  onDelete: "CASCADE",
});

Registration.belongsTo(Event, {
  foreignKey: "eventId",
});

module.exports = {
  Event,
  Registration,
};