-- Subject areas (e.g. "AI Signals", "Biotech Signals")
CREATE TABLE IF NOT EXISTS subject_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Topics within a subject area (e.g. "LLMs", "Agents", "Vision Models")
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  area_id TEXT NOT NULL REFERENCES subject_areas(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  keywords TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- Raw signal observations (append-only time-series)
CREATE TABLE IF NOT EXISTS signal_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  source TEXT NOT NULL,           -- 'hackernews' | 'arxiv' | 'patents' | 'publications'
  observed_at TEXT NOT NULL,      -- ISO timestamp
  score REAL NOT NULL DEFAULT 0,  -- normalised 0-1
  volume INTEGER NOT NULL DEFAULT 0,
  raw_data TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_obs_topic_source_date
  ON signal_observations(topic_id, source, observed_at);

-- Computed trend summaries (one row per topic × period, upserted each sweep)
CREATE TABLE IF NOT EXISTS trend_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id TEXT NOT NULL,
  period_days INTEGER NOT NULL,   -- 30 | 60 | 90 | 180
  computed_at TEXT NOT NULL,
  signal_level TEXT NOT NULL DEFAULT 'low',   -- 'low' | 'medium' | 'high'
  trend_state TEXT NOT NULL DEFAULT 'emerging', -- 'emerging' | 'accelerating' | 'plateauing' | 'declining'
  velocity REAL NOT NULL DEFAULT 0,
  heatmap_score REAL NOT NULL DEFAULT 0,
  summary TEXT,                   -- LLM-generated narrative (nullable)
  data TEXT NOT NULL DEFAULT '{}'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_trend_topic_period
  ON trend_summaries(topic_id, period_days);
