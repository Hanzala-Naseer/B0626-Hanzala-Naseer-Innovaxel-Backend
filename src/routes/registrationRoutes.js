const express = require("express");
const registrationController = require("../controllers/registrationController");

const router = express.Router();

router.post("/", registrationController.registerUser);
router.delete("/:id", registrationController.cancelRegistration);

module.exports = router;