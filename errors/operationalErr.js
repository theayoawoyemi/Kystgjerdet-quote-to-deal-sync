// imports
const AppErr = require("./appErr");

// Operational error class
class OperationalErr {
  constructor() {
    this.VALIDATION_REGEX = /validation/gi;
  }

  // Test errors
  testDuplicate = (err) => err.code === 11000;
  testInvalidID = (err) => err.kind === "ObjectId";
  testValidation = (err) => {
    return this.VALIDATION_REGEX.test(err._message);
  };

  // handle validation error
  handleValidation = (err) => {
    const statusCode = 400;
    let message = [];

    for (let key in err.errors) {
      message.push(`${err.errors[key].properties.message} `);
    }
    message = message[0];
    return new AppErr(message, statusCode);
  };

  // handle duplicate error
  handleDuplicate = (err) => {
    const statusCode = 400;
    let message = [`duplicate value supplied`];
    for (let key in err.keyValue) {
      message.push(`${err.keyValue[key]}`);
    }
    message = message.join(" ");
    return new AppErr(message, statusCode);
  };

  // Handle cast error
  handleInvalidID = (err) => {
    const statusCode = 400;
    const message = `invalid id supplied`;
    return new AppErr(message, statusCode);
  };

  // Handle invalid token
  handleInvalidToken = () => {
    const statusCode = 401;
    const message = "Invalid token sent";
    return new AppErr(message, statusCode);
  };

  // Handle invalid token
  handleExpiredToken = () => {
    const statusCode = 401;
    const message = "Token expired";
    return new AppErr(message, statusCode);
  };
}

// exports
module.exports = OperationalErr;
