// const { Event, Registration } = require("../models");
// const sequelize= require("../config/database");

// const registerUser = async ({ userName, eventId }) => {
//   const transaction = await sequelize.transaction();

//   try {
//     const event = await Event.findByPk(eventId, {
//       transaction,
//       lock: transaction.LOCK.UPDATE,
//     });

//     if (!event) {
//       throw new Error("Event not found");
//     }

//     const existingRegistration = await Registration.findOne({
//       where: {
//         userName,
//         eventId,
//       },
//       transaction,
//     });

//     if (existingRegistration) {
//       throw new Error("User already registered for this event");
//     }

//     const registrationCount = await Registration.count({
//       where: {
//         eventId,
//       },
//       transaction,
//     });

//     if (registrationCount >= event.totalSeats) {
//       throw new Error("Event is full");
//     }

//     const registration = await Registration.create(
//       {
//         userName,
//         eventId,
//       },
//       {
//         transaction,
//       }
//     );

//     await transaction.commit();

//     return registration;
//   } catch (error) {
//     await transaction.rollback();
//     throw error;
//   }
// };


// const cancelRegistration = async (registrationId) => {
//   const registration = await Registration.findByPk(registrationId);

//   if (!registration) {
//     throw new Error("Registration not found");
//   }

//   await registration.destroy();

//   return {
//     message: "Registration cancelled successfully",
//   };
// };

// module.exports = {
//   registerUser,
//   cancelRegistration
// };

const { Event, Registration } = require("../models");
const sequelize = require("../config/database");

const registerUser = async ({ userName, eventId }) => {
  const transaction = await sequelize.transaction();

  try {
    const event = await Event.findByPk(eventId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!event) {
      throw new Error("Event not found");
    }

    const existing = await Registration.findOne({
      where: { userName, eventId },
      transaction,
    });

    if (existing) {
      throw new Error("User already registered for this event");
    }

    const count = await Registration.count({
      where: { eventId },
      transaction,
    });

    if (count >= event.totalSeats) {
      throw new Error("Event is full");
    }

    const registration = await Registration.create(
      { userName, eventId },
      { transaction }
    );

    await transaction.commit();
    return registration;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};

const cancelRegistration = async (registrationId) => {
  const registration = await Registration.findByPk(registrationId);

  if (!registration) {
    throw new Error("Registration not found");
  }

  await registration.destroy();

  return {
    message: "Registration cancelled successfully",
  };
};

module.exports = {
  registerUser,
  cancelRegistration,
};