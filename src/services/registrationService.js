const prisma = require("../config/prisma");

const registerUser = async ({ userName, eventId }) => {
  const eId = Number(eventId);

  try {
    return await prisma.$transaction(async (tx) => {
      const event = await tx.event.findUnique({
        where: {
          id: eId,
        },
      });

      if (!event) {
        const err = new Error("Event not found");
        err.statusCode = 404;
        throw err;
      }

      const updated = await tx.event.updateMany({
        where: {
          id: eId,
          availableSeats: {
            gt: 0,
          },
        },
        data: {
          availableSeats: {
            decrement: 1,
          },
        },
      });

      if (updated.count === 0) {
        const err = new Error("Event is full");
        err.statusCode = 409;
        throw err;
      }

      return await tx.registration.create({
        data: {
          userName,
          eventId: eId,
        },
      });
    });
  } catch (error) {
    if (error.code === "P2002") {
      await prisma.event.update({
        where: {
          id: eId,
        },
        data: {
          availableSeats: {
            increment: 1,
          },
        },
      });

      const err = new Error(
        "User already registered for this event"
      );
      err.statusCode = 409;
      throw err;
    }

    throw error;
  }
};

const cancelRegistration = async (registrationId) => {
  return prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUnique({
      where: {
        id: Number(registrationId),
      },
    });

    if (!registration) {
      const err = new Error("Registration not found");
      err.statusCode = 404;
      throw err;
    }

    await tx.registration.delete({
      where: {
        id: Number(registrationId),
      },
    });

    await tx.event.update({
      where: {
        id: registration.eventId,
      },
      data: {
        availableSeats: {
          increment: 1,
        },
      },
    });

    return {
      message: "Registration cancelled successfully",
    };
  });
};

module.exports = {
  registerUser,
  cancelRegistration,
};