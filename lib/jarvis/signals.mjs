import { getDb } from '../db/index.mjs';

const VALID_SOURCES = new Set(['hackernews', 'arxiv', 'patents', 'publications']);

export function normalizeScore(value, min, max) {
  if (min === max) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function ingestObservation({ topicId, source, score, volume, rawData }) {
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`Invalid source "${source}". Must be one of: ${[...VALID_SOURCES].join(', ')}`);
  }
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO signal_observations (topic_id, source, observed_at, score, volume, raw_data)
    VALUES (?, ?, datetime('now'), ?, ?, ?)
  `);
  const result = stmt.run(topicId, source, score, volume, JSON.stringify(rawData));
  return result.lastInsertRowid;
}

export function ingestBatch(observations) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO signal_observations (topic_id, source, observed_at, score, volume, raw_data)
    VALUES (?, ?, datetime('now'), ?, ?, ?)
  `);
  const insertMany = db.transaction((rows) => {
    for (const obs of rows) {
      if (!VALID_SOURCES.has(obs.source)) continue;
      stmt.run(obs.topicId, obs.source, obs.score, obs.volume, JSON.stringify(obs.rawData || {}));
    }
  });
  insertMany(observations);
}

export function getRecentObservations(topicId, periodDays) {
  const db = getDb();
  return db.prepare(`
    SELECT id, topic_id, source, observed_at, score, volume, raw_data
    FROM signal_observations
    WHERE topic_id = ?
      AND observed_at >= datetime('now', ? || ' days')
    ORDER BY observed_at DESC
  `).all(topicId, `-${periodDays}`).map(row => ({
    ...row,
    raw_data: JSON.parse(row.raw_data || '{}'),
  }));
}

export function getObservationsBySource(topicId, source, periodDays) {
  const db = getDb();
  return db.prepare(`
    SELECT id, topic_id, source, observed_at, score, volume
    FROM signal_observations
    WHERE topic_id = ? AND source = ?
      AND observed_at >= datetime('now', ? || ' days')
    ORDER BY observed_at ASC
  `).all(topicId, source, `-${periodDays}`);
}
