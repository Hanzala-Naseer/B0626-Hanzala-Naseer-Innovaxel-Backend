const eventService = require("../services/eventService");
const { validateCreateEvent } = require("../validations/eventValidation");

const createEvent = async (req, res, next) => {
  try {
    const validatedData = validateCreateEvent(req.body);

    const event = await eventService.createEvent(validatedData);

    res.status(201).json(event);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

const getEvents = async (req, res, next) => {
  try {
    const events = await eventService.getEvents(req.query);
    res.status(200).json(events);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    next(error);
  }
};

const getEventById = async (req, res, next) => {
  try {
    const event = await eventService.getEventById(req.params.id);
    res.status(200).json(event);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
      });
    }
    next(error);
  }
};

module.exports = {
  createEvent,
  getEvents,
  getEventById
};