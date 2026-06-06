// const { Event, Registration } = require("../models");
// const { Op } = require("sequelize");
// const createEvent = async ({ name, totalSeats, eventDate }) => {
//   const existingEvent = await Event.findOne({
//     where: { name },
//   });

//   if (existingEvent) {
//     throw new Error("Event name already exists");
//   }

//   if (totalSeats <= 0) {
//     throw new Error("Total seats must be greater than 0");
//   }

//   if (new Date(eventDate) <= new Date()) {
//     throw new Error("Event date must be in the future");
//   }

//   const event = await Event.create({
//     name,
//     totalSeats,
//     eventDate,
//   });

//   return event;
// };


// const getEvents = async (query) => {
//   const where = {};

//   if (query.upcoming === "true") {
//     where.eventDate = {
//       [Op.gt]: new Date(),
//     };
//   }

//   const events = await Event.findAll({
//     where,
//     include: [
//       {
//         model: Registration,
//       },
//     ],
//     order: [
//       [
//         "eventDate",
//         query.sort === "desc" ? "DESC" : "ASC",
//       ],
//     ],
//   });

//   return events.map((event) => {
//     const totalRegistrations = event.Registrations.length;

//     return {
//       id: event.id,
//       name: event.name,
//       totalSeats: event.totalSeats,
//       eventDate: event.eventDate,
//       totalRegistrations,
//       availableSeats:
//         event.totalSeats - totalRegistrations,
//     };
//   });
// };
// module.exports = {
//   createEvent,
//   getEvents
// };



const { Event, Registration } = require("../models");
const { Op } = require("sequelize");

const createEvent = async ({ name, totalSeats, eventDate }) => {
  const existingEvent = await Event.findOne({ where: { name } });

  if (existingEvent) {
    throw new Error("Event name already exists");
  }

  if (!totalSeats || totalSeats <= 0) {
    throw new Error("Total seats must be greater than 0");
  }

  if (new Date(eventDate) <= new Date()) {
    throw new Error("Event date must be in the future");
  }

  return await Event.create({
    name,
    totalSeats,
    eventDate,
  });
};

const getEvents = async (query) => {
  const where = {};

  if (query.upcoming === "true") {
    where.eventDate = { [Op.gt]: new Date() };
  }

  const events = await Event.findAll({
    where,
    include: [{ model: Registration }],
    order: [["eventDate", query.sort === "desc" ? "DESC" : "ASC"]],
  });

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    totalSeats: event.totalSeats,
    eventDate: event.eventDate,
    totalRegistrations: event.Registrations.length,
    availableSeats: event.totalSeats - event.Registrations.length,
  }));
};

module.exports = {
  createEvent,
  getEvents,
};