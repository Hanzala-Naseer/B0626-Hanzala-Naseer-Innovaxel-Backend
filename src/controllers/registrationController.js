// const registrationService = require("../services/registrationService");

// const registerUser = async (req, res) => {
//   try {
//     const registration = await registrationService.registerUser(req.body);

//     res.status(201).json(registration);
//   } catch (error) {
//     res.status(400).json({
//       message: error.message,
//     });
//   }
// };

// const cancelRegistration = async (req, res) => {
//   try {
//     const result = await registrationService.cancelRegistration(
//       req.params.id
//     );

//     res.status(200).json(result);
//   } catch (error) {
//     res.status(404).json({
//       message: error.message,
//     });
//   }
// };

// module.exports = {
//   registerUser,
//   cancelRegistration,
// };

const registrationService = require("../services/registrationService");

const registerUser = async (req, res, next) => {
  try {
    const registration = await registrationService.registerUser(req.body);
    res.status(201).json(registration);
  } catch (error) {
    next(error);
  }
};

const cancelRegistration = async (req, res, next) => {
  try {
    const result = await registrationService.cancelRegistration(
      req.params.id
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  registerUser,
  cancelRegistration,
};