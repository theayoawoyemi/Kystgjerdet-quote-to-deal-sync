// async error handler

class CatchAsyncErr {
  constructor(asyncFn) {
    this.asyncFn = asyncFn;
  }

  // catch err
  catch = () => {
    return (req, res, next) => {
      this.asyncFn(req, res, next).catch((err) => next(err));
    };
  };
}

// exports
module.exports = CatchAsyncErr;
