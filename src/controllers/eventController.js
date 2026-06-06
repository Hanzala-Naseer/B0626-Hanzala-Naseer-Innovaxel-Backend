const eventService = require("../services/eventService");

const createEvent = async (req, res) => {
  try {
    const event = await eventService.createEvent(req.body);

    res.status(201).json(event);
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

const getEvents = async (req, res) => {
  try {
    const events = await eventService.getEvents(req.query);

    res.status(200).json(events);
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

module.exports = {
  createEvent,
  getEvents,
};