const validateRegisterUser = (data) => {
  if (!data.userName || typeof data.userName !== "string" || data.userName.trim() === "") {
    const error = new Error("userName is required");
    error.statusCode = 400;
    throw error;
  }

  if (data.eventId === undefined || data.eventId === null || data.eventId === "") {
    const error = new Error("eventId is required");
    error.statusCode = 400;
    throw error;
  }

  const eventId = Number(data.eventId);

  if (isNaN(eventId) || !Number.isInteger(eventId) || eventId <= 0) {
    const error = new Error("eventId must be a positive integer");
    error.statusCode = 400;
    throw error;
  }

  return {
    userName: data.userName.trim(),
    eventId,
  };
};

module.exports = {
  validateRegisterUser,
};