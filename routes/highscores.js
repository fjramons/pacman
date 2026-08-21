var express = require("express");
var router = express.Router();
var bodyParser = require("body-parser");
var Database = require("../lib/database");
var baseLogger = require("../lib/logger");

var logger = baseLogger.child({ module: "routes/highscores" });

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
  logger.debug(
    { method: req.method, url: req.originalUrl },
    "Incoming request"
  );
  next();
});

router.get("/list", urlencodedParser, async function (req, res, next) {
  logger.info("Handling GET /highscores/list");
  try {
    var result = await Database.getTopHighscores();
    res.json(result);
  } catch (err) {
    logger.error({ err }, "Failed to fetch highscores");
    return next(err);
  }
});

// Accessed at /highscores
router.post("/", urlencodedParser, async function (req, res, next) {
  logger.info(
    {
      body: req.body,
      host: req.headers.host,
      userAgent: req.headers["user-agent"],
      referer: req.headers.referer,
    },
    "Handling POST /highscores"
  );

  var userScore = parseInt(req.body.score, 10);
  var userLevel = parseInt(req.body.level, 10);
  var userName = ((req.body.name ?? "") + "").substring(0, 32);
  var cloud = ((req.body.cloud ?? "") + "").substring(0, 32);
  var zone = ((req.body.zone ?? "") + "").substring(0, 32);
  var host = ((req.body.host ?? "") + "").substring(0, 32);
  var insertDocument = {
    name: userName,
    cloud: cloud,
    zone: zone,
    host: host,
    score: userScore,
    level: userLevel,
    referer: req.headers.referer || "",
    user_agent: req.headers["user-agent"] || "",
    hostname: req.hostname || "",
    ip_addr: req.ip || "",
  };

  try {
    await randomLatency(10, 300);
    var insertResult = await Database.insertHighscore(insertDocument);

    var returnStatus = insertResult.success ? "success" : "error";
    if (returnStatus === "success") {
      logger.info(
        { name: insertDocument.name, score: insertDocument.score },
        "Successfully inserted highscore"
      );
    }

    res.json({
      name: insertDocument.name,
      zone: insertDocument.zone,
      score: insertDocument.score,
      level: insertDocument.level,
      rs: returnStatus,
    });
  } catch (err) {
    logger.error({ err }, "Failed to insert highscore");
    return next(err);
  }
});

module.exports = router;
