-- Schema for the PostgreSQL backend (DB_DRIVER=postgres).
-- Applied via the K8s schema Job (see k8s/base/schema-job.yaml) or manually
-- with: psql "postgresql://<user>:<pwd>@<host>:<port>/<db>" -f schema.sql

CREATE TABLE IF NOT EXISTS highscore (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(32)  NOT NULL DEFAULT '',
    cloud       VARCHAR(32)  NOT NULL DEFAULT '',
    zone        VARCHAR(32)  NOT NULL DEFAULT '',
    host        VARCHAR(32)  NOT NULL DEFAULT '',
    score       INTEGER      NOT NULL,
    level       INTEGER,
    date        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    referer     TEXT,
    user_agent  TEXT,
    hostname    VARCHAR(255),
    ip_addr     VARCHAR(45)
);

CREATE INDEX IF NOT EXISTS idx_highscore_score ON highscore (score DESC);

CREATE TABLE IF NOT EXISTS userstats (
    id              SERIAL PRIMARY KEY,
    cloud           VARCHAR(32),
    zone            VARCHAR(32),
    host            VARCHAR(32),
    score           INTEGER,
    level           INTEGER,
    lives           INTEGER,
    elapsed_time    INTEGER,
    date            TIMESTAMPTZ NOT NULL DEFAULT now(),
    referer         TEXT,
    user_agent      TEXT,
    hostname        VARCHAR(255),
    ip_addr         VARCHAR(45),
    update_counter  INTEGER NOT NULL DEFAULT 0
);
