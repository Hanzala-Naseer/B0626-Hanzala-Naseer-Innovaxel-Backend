const express = require("express");

const eventRoutes = require("./routes/eventRoutes");

const registrationRoutes = require("./routes/registrationRoutes");

const errorHandler = require("./middlewares/errorHandler");


const app = express();

app.use(express.json());

app.use("/events", eventRoutes);
app.use("/registrations", registrationRoutes);


app.use(errorHandler);


module.exports = app;