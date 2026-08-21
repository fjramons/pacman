"use strict";

process.env.NODE_ENV = "test";
// This suite exercises the preserved Mongo adapter specifically (the
// default DB_DRIVER is now "postgres" - see test/postgres/ for that path).
process.env.DB_DRIVER = "mongo";

const { expect } = require("chai");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const supertest = require("supertest");

describe("Route integration (Mongo adapter)", function () {
  let replSet;
  let Database;
  let app;
  let request;

  before(async function () {
    this.timeout(60000);
    // Re-assert here (not just at module load): mocha requires every
    // spec file up front, so a sibling suite's after() hook running
    // between file loads and this hook could have reset it.
    process.env.DB_DRIVER = "mongo";

    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });

    const uri = replSet.getUri();
    const url = new URL(uri);

    process.env.MONGO_SERVICE_HOST = url.hostname;
    process.env.MY_MONGO_PORT = url.port;
    process.env.MONGO_DATABASE = "pacman";
    process.env.MONGO_USE_SSL = "false";
    process.env.MONGO_VALIDATE_SSL = "true";

    const replicaSetName = url.searchParams.get("replicaSet");
    if (replicaSetName) {
      process.env.MONGO_REPLICA_SET = replicaSetName;
    }

    delete require.cache[require.resolve("../lib/config")];
    delete require.cache[require.resolve("../lib/database")];
    delete require.cache[require.resolve("../lib/db")];
    delete require.cache[require.resolve("../lib/db/mongo-adapter")];
    delete require.cache[require.resolve("../app")];

    Database = require("../lib/database");
    app = require("../app");
    await Database.connect(app);
    request = supertest(app);
  });

  after(async function () {
    if (Database) {
      await Database.disconnect();
    }
    if (replSet) {
      await replSet.stop();
    }

    delete process.env.MONGO_SERVICE_HOST;
    delete process.env.MY_MONGO_PORT;
    delete process.env.MONGO_DATABASE;
    delete process.env.MONGO_USE_SSL;
    delete process.env.MONGO_VALIDATE_SSL;
    delete process.env.MONGO_REPLICA_SET;
    delete process.env.DB_DRIVER;
  });

  beforeEach(async function () {
    const db = await Database.getDb(app);
    await db.collection("highscore").deleteMany({});
    await db.collection("userstats").deleteMany({});
  });

  describe("Highscore routes", function () {
    it("returns an empty list when there are no highscores", async function () {
      const response = await request.get("/highscores/list").expect(200);

      expect(response.body).to.be.an("array").that.is.empty;
    });

    it("inserts a highscore and returns success", async function () {
      const response = await request
        .post("/highscores")
        .type("form")
        .send({
          name: "Colin",
          cloud: "",
          zone: "",
          host: "",
          score: "100",
          level: "1",
        })
        .expect(200);

      expect(response.body).to.include({
        name: "Colin",
        zone: "",
        score: 100,
        level: 1,
        rs: "success",
      });

      const db = await Database.getDb(app);
      const stored = await db
        .collection("highscore")
        .findOne({ name: "Colin" });
      expect(stored).to.exist;
      expect(stored.score).to.equal(100);
    });

    it("returns highscores sorted in descending order", async function () {
      const scores = [50, 200, 150];
      for (let i = 0; i < scores.length; i++) {
        await request
          .post("/highscores")
          .type("form")
          .send({
            name: `Player ${i + 1}`,
            cloud: "",
            zone: "",
            host: "",
            score: String(scores[i]),
            level: "1",
          })
          .expect(200);
      }

      const response = await request.get("/highscores/list").expect(200);
      expect(response.body).to.have.length(3);

      const returnedScores = response.body.map(function (entry) {
        return entry.score;
      });

      expect(returnedScores).to.deep.equal([200, 150, 50]);
    });
  });

  describe("User routes", function () {
    it("creates a user ID and retrieves live stats", async function () {
      const idResponse = await request.get("/user/id").expect(200);
      const rawUserId = idResponse.body;
      const userId =
        typeof rawUserId === "string" ? rawUserId : rawUserId && rawUserId.$oid;

      expect(userId).to.be.a("string").with.lengthOf(24);

      const updateResponse = await request
        .post("/user/stats")
        .type("form")
        .send({
          userId,
          cloud: "cloudy",
          zone: "zone-1",
          host: "host-1",
          score: "250",
          level: "3",
          lives: "2",
          elapsedTime: "120",
        })
        .expect(200);

      expect(updateResponse.body).to.deep.equal({ rs: "success" });

      const statsResponse = await request.get("/user/stats").expect(200);
      expect(statsResponse.body).to.be.an("array").with.lengthOf(1);

      const stats = statsResponse.body[0];
      expect(stats).to.include({
        cloud: "cloudy",
        zone: "zone-1",
        host: "host-1",
        score: 250,
        level: 3,
        lives: 2,
        et: 120,
        txncount: 1,
      });
    });
  });
});
