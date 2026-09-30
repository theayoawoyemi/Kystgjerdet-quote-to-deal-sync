const router = require("express").Router({ mergeParams: true });
const quoteController = require("../controllers/quoteController");

router.route("/action").post(quoteController.updateAction);
router.route("/deal").get(quoteController.getQuoteDealPipeline);

module.exports = router;
