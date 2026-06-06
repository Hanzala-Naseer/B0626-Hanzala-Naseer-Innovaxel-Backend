// const registrationService = require("../services/registrationService");
// const { validateRegisterUser } = require("../validations/registrationValidation");

// const registerUser = async (req, res, next) => {
//   try {
//     const validatedData = validateRegisterUser(req.body);
//     const registration = await registrationService.registerUser(validatedData);

//     res.status(201).json(registration);
//   } catch (error) {
//     // If the service attached a statusCode, use it; otherwise pass to generic handler
//     if (error.statusCode) {
//       return res.status(error.statusCode).json({ message: error.message });
//     }
//     next(error);
//   }
// };

// const cancelRegistration = async (req, res, next) => {
//   try {
//     const result = await registrationService.cancelRegistration(req.params.id);
//     res.status(200).json(result);
//   } catch (error) {
//     if (error.statusCode) {
//       return res.status(error.statusCode).json({ message: error.message });
//     }
//     next(error);
//   }
// };

// module.exports = {
//   registerUser,
//   cancelRegistration,
// };

const registrationService = require("../services/registrationService");
const { validateRegisterUser } = require("../validations/registrationValidation");

const registerUser = async (req, res, next) => {
  try {
    const validatedData = validateRegisterUser(req.body);
    const registration = await registrationService.registerUser(validatedData);
    res.status(201).json(registration);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
};

const cancelRegistration = async (req, res, next) => {
  try {
    const registrationId = parseInt(req.params.id, 10);

    // Only reject genuine non-numbers. Let negatives through to Prisma → 404.
    if (isNaN(registrationId)) {
      return res.status(400).json({ error: "Invalid registration ID" });
    }

    const result = await registrationService.cancelRegistration(registrationId);
    res.status(200).json(result);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
};

module.exports = {
  registerUser,
  cancelRegistration,
};