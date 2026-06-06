// const errorHandler = (err, req, res, next) => {
//   console.error("ERROR:", err);

//   // Default values
//   let statusCode = err.statusCode || 500;
//   let message = err.message || "Internal Server Error";

//   // Handle known business errors
//   if (message === "Event not found") statusCode = 404;
//   else if (message === "Registration not found") statusCode = 404;
//   else if (message === "Event is full") statusCode = 409;
//   else if (message === "User already registered for this event") statusCode = 409;

//   return res.status(statusCode).json({
//     message,
//   });
// };

// module.exports = errorHandler;


const errorHandler = (err, req, res, next) => {
  console.error("ERROR:", err);

  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // These are redundant (service already sets statusCode) but kept as fallback.
  if (message === "Event not found") statusCode = 404;
  else if (message === "Registration not found") statusCode = 404;
  else if (message === "Event is full") statusCode = 409;
  else if (message === "User already registered for this event") statusCode = 409;

  // CRITICAL: Always return { error } to match controller format and test expectations.
  return res.status(statusCode).json({
    error: message,
  });
};

module.exports = errorHandler;