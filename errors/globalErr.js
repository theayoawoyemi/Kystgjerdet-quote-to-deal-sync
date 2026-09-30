// imports
const OperationalErr = require("./operationalErr");

// global error class
class GlobalErr extends OperationalErr {
  constructor(message, statusCode) {
    super(message, statusCode);
  }

  // normalise error
  normaliseErr = (err) => {
    if (err.isOperational) {
      err.message = err.message || "fatal! something went wrong on the server";
      err.status = err.status || "error";
      err.statusCode = err.statusCode || 500;
    } else {
      err.message = "fatal! something went wrong on the server";
      err.status = "error";
      err.statusCode = 500;
    }
  };

  // generate error
  generateErr = (err) => {
    const errDetails = {
      message: err.message,
      status: err.status,
      stack: err.stack,
      err,
    };

    const environment = process.env.NODE_ENV;
    const excluded = ["stack", "err"];

    if (environment === "production")
      excluded.forEach((e) => delete errDetails[e]);

    return errDetails;
  };

  // send error
  sendErr = (err, res) => {
    console.log(err.stack);
    res.status(err.statusCode).json(this.generateErr(err));
  };

  // handle error
  handleErr = () => {
    return (err, req, res, next) => {
      // normalise error
      this.normaliseErr(err);

      // validation error
      if (this.testValidation(err)) err = this.handleValidation(err);
      if (this.testDuplicate(err)) err = this.handleDuplicate(err);
      if (this.testInvalidID(err)) err = this.handleInvalidID(err);
      if (err.name === "JsonWebTokenError") err = this.handleInvalidToken(err);
      if (err.name === "TokenExpiredError") err = this.handleExpiredToken(err);

      // send error
      this.sendErr(err, res);
    };
  };
}

// exports
module.exports = GlobalErr;
