const express = require("express");

const eventRoutes = require("./routes/eventRoutes");

const registrationRoutes = require("./routes/registrationRoutes");

const app = express();

app.use(express.json());

app.use("/events", eventRoutes);
app.use("/registrations", registrationRoutes);


module.exports = app;