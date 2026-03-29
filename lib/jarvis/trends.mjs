import { getDb } from '../db/index.mjs';
import { getObservationsBySource } from './signals.mjs';

export const PERIODS = [30, 60, 90, 180];
const SOURCES = ['hackernews', 'arxiv', 'patents', 'publications'];

// Source weights: earlier-stage sources get higher weight for "emerging" detection
const SOURCE_WEIGHT = { hackernews: 0.35, arxiv: 0.30, patents: 0.25, publications: 0.10 };

/**
 * Linear regression slope over a normalised score series.
 * Returns velocity in score-units per observation.
 */
export function computeVelocity(scores) {
  if (scores.length < 2) return 0;
  const n = scores.length;
  const xs = scores.map((_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = scores.reduce((s, v) => s + v, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - meanX) * (scores[i] - meanY), 0);
  const den = xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

export function classifySignalLevel(heatmapScore) {
  if (heatmapScore >= 0.67) return 'high';
  if (heatmapScore >= 0.33) return 'medium';
  return 'low';
}

export function classifyTrendState(heatmapScore, velocity) {
  if (velocity < -0.05) return 'declining';
  if (heatmapScore < 0.33 && velocity >= 0) return 'emerging';
  if (velocity > 0.05) return 'accelerating';
  return 'plateauing';
}

/**
 * Compute and upsert trend summaries for a single topic across all periods.
 * Returns an array of summary objects (one per period).
 */
export function computeTopicTrends(topicId) {
  const db = getDb();
  const results = [];

  for (const days of PERIODS) {
    // Gather observations per source
    const sourceData = {};
    for (const src of SOURCES) {
      const rows = getObservationsBySource(topicId, src, days);
      sourceData[src] = rows;
    }

    // Weighted average score across all sources for this period
    let weightedScore = 0;
    let totalWeight = 0;
    const sourceScores = {};
    for (const src of SOURCES) {
      const rows = sourceData[src];
      if (rows.length === 0) continue;
      const avg = rows.reduce((s, r) => s + r.score, 0) / rows.length;
      sourceScores[src] = { avg, count: rows.length };
      weightedScore += avg * SOURCE_WEIGHT[src];
      totalWeight += SOURCE_WEIGHT[src];
    }
    const heatmapScore = totalWeight > 0 ? weightedScore / totalWeight : 0;

    // Velocity: use hackernews + arxiv (fastest-moving sources) combined score series
    const fastSeries = [
      ...sourceData.hackernews.map(r => ({ t: r.observed_at, s: r.score })),
      ...sourceData.arxiv.map(r => ({ t: r.observed_at, s: r.score })),
    ].sort((a, b) => a.t.localeCompare(b.t)).map(r => r.s);

    const velocity = computeVelocity(fastSeries);
    const signal_level = classifySignalLevel(heatmapScore);
    const trend_state = classifyTrendState(heatmapScore, velocity);

    const summary = {
      topic_id: topicId,
      period_days: days,
      signal_level,
      trend_state,
      velocity: Math.round(velocity * 10000) / 10000,
      heatmap_score: Math.round(heatmapScore * 10000) / 10000,
      sourceScores,
    };

    // Upsert
    db.prepare(`
      INSERT INTO trend_summaries
        (topic_id, period_days, computed_at, signal_level, trend_state, velocity, heatmap_score, data)
      VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)
      ON CONFLICT(topic_id, period_days) DO UPDATE SET
        computed_at = excluded.computed_at,
        signal_level = excluded.signal_level,
        trend_state = excluded.trend_state,
        velocity = excluded.velocity,
        heatmap_score = excluded.heatmap_score,
        data = excluded.data
    `).run(
      topicId, days, signal_level, trend_state,
      summary.velocity, summary.heatmap_score,
      JSON.stringify(summary.sourceScores),
    );

    results.push(summary);
  }

  return results;
}

/**
 * Fetch all current trend summaries for a subject area.
 * Returns { topicId: { 30: summary, 60: summary, 90: summary, 180: summary } }
 */
export function getAreaTrends(areaId) {
  const db = getDb();
  const topics = db.prepare(
    'SELECT id FROM topics WHERE area_id = ? AND enabled = 1 ORDER BY sort_order'
  ).all(areaId);

  const out = {};
  for (const topic of topics) {
    const rows = db.prepare(
      'SELECT * FROM trend_summaries WHERE topic_id = ?'
    ).all(topic.id);
    out[topic.id] = {};
    for (const row of rows) {
      out[topic.id][row.period_days] = {
        signal_level: row.signal_level,
        trend_state: row.trend_state,
        velocity: row.velocity,
        heatmap_score: row.heatmap_score,
        computed_at: row.computed_at,
        summary: row.summary,
        data: JSON.parse(row.data || '{}'),
      };
    }
  }
  return out;
}
