var express = require("express");
var router = express.Router();
var bodyParser = require("body-parser");
var Database = require("../lib/database");
var baseLogger = require("../lib/logger");

var logger = baseLogger.child({ module: "routes/user" });

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({ extended: false });

function randomLatency(minMs, maxMs) {
  var min = Math.ceil(minMs);
  var max = Math.floor(maxMs);
  var value = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(function (resolve) {
    setTimeout(resolve, value);
  });
}

// middleware that is specific to this router
router.use(function timeLog(req, res, next) {
  logger.debug({ method: req.method, url: req.originalUrl }, "Incoming request");
  next();
});

router.get("/id", async function (req, res, next) {
  logger.info("Handling GET /user/id");
  try {
    await randomLatency(10, 300);
    var userId = await Database.createUser();
    logger.info({ userId }, "Successfully inserted new user ID");
    res.json(userId);
  } catch (err) {
    logger.error({ err }, "Failed to insert new user ID");
    return next(err);
  }
});

router.post("/stats", urlencodedParser, async function (req, res, next) {
  logger.info(
    {
      body: req.body,
      host: req.headers.host,
      userAgent: req.headers["user-agent"],
      referer: req.headers.referer,
    },
    "Handling POST /user/stats"
  );

  var userScore = parseInt(req.body.score, 10);
  var userLevel = parseInt(req.body.level, 10);
  var userLives = parseInt(req.body.lives, 10);
  var userET = parseInt(req.body.elapsedTime, 10);

  try {
    await randomLatency(10, 300);
    var updateResult = await Database.updateUserStats(req.body.userId, {
      cloud: req.body.cloud,
      zone: req.body.zone,
      host: req.body.host,
      score: userScore,
      level: userLevel,
      lives: userLives,
      elapsedTime: userET,
      referer: req.headers.referer,
      user_agent: req.headers["user-agent"],
      hostname: req.hostname,
      ip_addr: req.ip,
    });

    var returnStatus = updateResult.success ? "success" : "error";
    if (returnStatus === "success") {
      logger.info({ userId: req.body.userId }, "Successfully updated user stats");
    }

    res.json({
      rs: returnStatus,
    });
  } catch (err) {
    logger.error({ err }, "Failed to update user stats");
    return next(err);
  }
});

router.get("/stats", async function (req, res, next) {
  logger.info("Handling GET /user/stats");

  try {
    var result = await Database.getAllUserStats();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to fetch user stats");
    return next(err);
  }
});

module.exports = router;
