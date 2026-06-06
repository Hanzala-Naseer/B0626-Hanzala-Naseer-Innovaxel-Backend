const prisma = require("../config/prisma");

const registerUser = async ({ userName, eventId }) => {
  const eId = Number(eventId);

  const event = await prisma.event.findUnique({
    where: { id: eId },
  });

  if (!event) {
    const err = new Error("Event not found");
    err.statusCode = 404;
    throw err;
  }

  const existing = await prisma.registration.findUnique({
    where: {
      userName_eventId: { userName, eventId: eId },
    },
  });

  if (existing) {
    const err = new Error("User already registered for this event");
    err.statusCode = 409;
    throw err;
  }

  const updated = await prisma.event.updateMany({
    where: {
      id: eId,
      availableSeats: { gt: 0 },
    },
    data: {
      availableSeats: { decrement: 1 },
    },
  });

  if (updated.count === 0) {
    const err = new Error("Event is full");
    err.statusCode = 409;
    throw err;
  }

  try {
    return await prisma.registration.create({
      data: { userName, eventId: eId },
    });
  } catch (error) {
    await prisma.event.update({
      where: { id: eId },
      data: { availableSeats: { increment: 1 } },
    });

    if (error.code === "P2002") {
      const err = new Error("User already registered for this event");
      err.statusCode = 409;
      throw err;
    }
    throw error;
  }
};

const cancelRegistration = async (registrationId) => {
  const id = Number(registrationId);

  // Only reject NaN. Let negatives reach Prisma (they'll return null → 404).
  if (isNaN(id)) {
    const err = new Error("Invalid registration ID");
    err.statusCode = 400;
    throw err;
  }

  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUnique({
      where: { id },
    });

    if (!registration) {
      const err = new Error("Registration not found");
      err.statusCode = 404;
      throw err;
    }

    await tx.registration.delete({ where: { id } });

    await tx.event.update({
      where: { id: registration.eventId },
      data: { availableSeats: { increment: 1 } },
    });

    return { message: "Registration cancelled successfully" };
  });
};

module.exports = {
  registerUser,
  cancelRegistration,
};