const registrationService = require("../services/registrationService");
const { validateRegisterUser } = require("../validations/registrationValidation");

const registerUser = async (req, res, next) => {
  try {
    const validatedData = validateRegisterUser(req.body);
    const registration = await registrationService.registerUser(validatedData);

    res.status(201).json(registration);
  } catch (error) {
    // If the service attached a statusCode, use it; otherwise pass to generic handler
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    next(error);
  }
};

const cancelRegistration = async (req, res, next) => {
  try {
    const result = await registrationService.cancelRegistration(req.params.id);
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