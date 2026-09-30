const router = require("express").Router({ mergeParams: true });
const workflowController = require("../controllers/workflowController");

router.route("/quote-deal-sync").post(workflowController.sync);

module.exports = router;
