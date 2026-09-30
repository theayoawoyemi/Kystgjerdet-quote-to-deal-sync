// imports
const AppErr = require("./appErr");

// route error class
class RouteErr extends AppErr {
  // handle invalid route
  handleInvalidRoute = () => {
    return (req, res, next) => {
      const { originalUrl, method } = req;
      const message = `cannot perform ${method} to ${originalUrl}, not found!`;
      const statusCode = 404;
      next(new AppErr(message, statusCode));
    };
  };
}

// exports
module.exports = RouteErr;
