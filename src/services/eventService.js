const prisma = require("../config/prisma");

const createEvent = async ({ name, totalSeats, eventDate }) => {
  const existingEvent = await prisma.event.findUnique({
    where: { name },
  });

 if (existingEvent) {
  const err = new Error("Event name already exists");
  err.statusCode = 409;
  throw err;
}

if (!totalSeats || totalSeats <= 0) {
  const err = new Error("Total seats must be greater than 0");
  err.statusCode = 400;
  throw err;
}

if (new Date(eventDate) <= new Date()) {
  const err = new Error("Event date must be in the future");
  err.statusCode = 400;
  throw err;
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

const getEventById = async (id) => {
  const eventId = Number(id);

  if (isNaN(eventId)) {
    const err = new Error("Invalid event id");
    err.statusCode = 400;
    throw err;
  }

  const event = await prisma.event.findUnique({
    where: {
      id: eventId,
    },
    include: {
      _count: {
        select: {
          registrations: true,
        },
      },
    },
  });

  if (!event) {
    const err = new Error("Event not found");
    err.statusCode = 404;
    throw err;
  }

  return {
    id: event.id,
    name: event.name,
    totalSeats: event.totalSeats,
    availableSeats: event.availableSeats,
    eventDate: event.eventDate,
    totalRegistrations: event._count.registrations,
  };
};
module.exports = {
  createEvent,
  getEvents,
  getEventById
};