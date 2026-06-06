const prisma = require("../config/prisma");

const createEvent = async ({ name, totalSeats, eventDate }) => {
  const existingEvent = await prisma.event.findUnique({
    where: { name },
  });

  if (existingEvent) {
    throw new Error("Event name already exists");
  }

  if (!totalSeats || totalSeats <= 0) {
    throw new Error("Total seats must be greater than 0");
  }

  if (new Date(eventDate) <= new Date()) {
    throw new Error("Event date must be in the future");
  }

  return prisma.event.create({
    data: {
      name,
      totalSeats,
      availableSeats: totalSeats,
      eventDate: new Date(eventDate),
    },
  });
};

const getEvents = async (query) => {
  const where = {};

  if (query.upcoming === "true") {
    where.eventDate = {
      gt: new Date(),
    };
  }

  const events = await prisma.event.findMany({
    where,
    include: {
      _count: {
        select: {
          registrations: true,
        },
      },
    },
    orderBy: {
      eventDate: query.sort === "desc" ? "desc" : "asc",
    },
  });

  return events.map((event) => ({
    id: event.id,
    name: event.name,
    totalSeats: event.totalSeats,
    eventDate: event.eventDate,
    totalRegistrations: event._count.registrations,
    availableSeats: event.availableSeats,
  }));
};

module.exports = {
  createEvent,
  getEvents,
};