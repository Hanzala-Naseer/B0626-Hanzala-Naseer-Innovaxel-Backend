const errorHandler = (err, req, res, next) => {
  console.error("ERROR:", err.message);

  let statusCode = 500;
  let message = "Internal Server Error";

  // custom known errors
  if (err.message === "Event not found") statusCode = 404;
  else if (err.message === "Registration not found") statusCode = 404;
  else if (err.message === "Event is full") statusCode = 409;
  else if (err.message === "User already registered for this event") statusCode = 409;
  else if (err.message.includes("must")) statusCode = 400;

  return res.status(statusCode).json({
    message: err.message || message,
  });
};

module.exports = errorHandler;