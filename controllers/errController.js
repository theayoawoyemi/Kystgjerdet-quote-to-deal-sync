// imports
const RouteErr = require("../errors/routeErr");
const GlobalErr = require("../errors/globalErr");

// exports
module.exports = {
  routeErr: new RouteErr(),
  globalErr: new GlobalErr(),
};
