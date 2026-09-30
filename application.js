// Imports
const express = require("express");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const cors = require("cors");

//Controllers
const errController = require("./controllers/errController");
const workflowRouter = require("./routes/workflowRoute");
const quoteRouter = require("./routes/quoteRoute");

// App setup
const app = express();

// Global Middlewares

// Cross origin
app.use(cors());

// Development logging
app.use(morgan("dev"));

// Parsing body ( json ) into object req.body
app.use(express.json({ type: "application/json" }));

// Parsing body ( url encoded data ) into object
app.use(bodyParser.urlencoded({ extended: true }));

// Parsing incoming cookies
app.use(cookieParser());

// Serving static files
// app.use(express.static(__dirname + "/public"));
// app.use(express.static(path.join(__dirname, "client")));

// Route middlewares
app.use("/workflow", workflowRouter);
app.use("/quote", quoteRouter);

app.all("*", errController.routeErr.handleInvalidRoute());

// Global error handler
app.use(errController.globalErr.handleErr());

// exports
module.exports = app;
