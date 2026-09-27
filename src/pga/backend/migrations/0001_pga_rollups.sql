PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS daily_metrics (
  day_ist TEXT NOT NULL,
  metric TEXT NOT NULL,
  dimension_type TEXT NOT NULL DEFAULT '',
  dimension_value TEXT NOT NULL DEFAULT '',
  value REAL NOT NULL,
  precision TEXT NOT NULL CHECK (precision IN ('exact', 'estimated', 'unknown')),
  sampled INTEGER NOT NULL DEFAULT 0 CHECK (sampled IN (0, 1)),
  data_through_ms INTEGER,
  schema_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (day_ist, metric, dimension_type, dimension_value)
);

CREATE INDEX IF NOT EXISTS daily_metrics_metric_day
  ON daily_metrics(metric, day_ist);

CREATE TABLE IF NOT EXISTS rollup_runs (
  day_ist TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('running', 'complete', 'failed')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT,
  data_through_ms INTEGER,
  schema_version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backend_health (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
