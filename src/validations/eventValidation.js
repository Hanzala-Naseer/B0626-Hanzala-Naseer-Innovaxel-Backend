const validateCreateEvent = (data) => {
  const allowedFields = ["name", "totalSeats", "eventDate"];

  const extraFields = Object.keys(data).filter(
    (key) => !allowedFields.includes(key)
  );

  if (extraFields.length > 0) {
    const error = new Error(
      `Unknown field(s): ${extraFields.join(", ")}`
    );
    error.statusCode = 400;
    throw error;
  }

  const errors = [];

  if (
    !data.name ||
    typeof data.name !== "string" ||
    data.name.trim() === ""
  ) {
    errors.push("name is required");
  } else {
    const name = data.name.trim();

    if (/^\d+$/.test(name)) {
      errors.push("event name cannot contain only numbers");
    }
  }

  if (
    data.totalSeats === undefined ||
    data.totalSeats === null ||
    data.totalSeats === ""
  ) {
    errors.push("totalSeats is required");
  } else {
    const num = Number(data.totalSeats);

    if (isNaN(num)) {
      errors.push("totalSeats must be a valid number");
    } else {
      if (!Number.isInteger(num)) {
        errors.push("totalSeats must be an integer");
      }

      if (num <= 0) {
        errors.push("totalSeats must be greater than 0");
      }
    }
  }

  if (!data.eventDate || typeof data.eventDate !== "string") {
    errors.push("eventDate is required");
  } else {
    const isValidFormat = /^\d{4}-\d{2}-\d{2}$/.test(data.eventDate);

    if (!isValidFormat) {
      errors.push(
        "Invalid format. Use YYYY-MM-DD (e.g. 2026-07-01)"
      );
    } else {
      const date = new Date(data.eventDate);

      if (isNaN(date.getTime())) {
        errors.push("Invalid event date");
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (date <= today) {
          errors.push("Event date must be in the future");
        }
      }
    }
  }

  if (errors.length > 0) {
    const error = new Error(errors[0]);
    error.statusCode = 400;
    throw error;
  }

  return {
    name: data.name.trim(),
    totalSeats: Number(data.totalSeats),
    eventDate: data.eventDate,
  };
};

module.exports = {
  validateCreateEvent,
};