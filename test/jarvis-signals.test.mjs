import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync } from 'node:fs';

// Use in-memory DB for tests
process.env.JARVIS_DB_PATH = ':memory:';

const { ingestObservation, getRecentObservations, normalizeScore } =
  await import('../lib/jarvis/signals.mjs');

describe('normalizeScore', () => {
  it('clamps values between 0 and 1', () => {
    assert.equal(normalizeScore(0, 0, 100), 0);
    assert.equal(normalizeScore(100, 0, 100), 1);
    assert.equal(normalizeScore(50, 0, 100), 0.5);
    assert.equal(normalizeScore(150, 0, 100), 1); // clamp
  });

  it('returns 0 when min === max', () => {
    assert.equal(normalizeScore(5, 5, 5), 0);
  });
});

describe('ingestObservation', () => {
  it('inserts a row and returns the inserted id', () => {
    const id = ingestObservation({
      topicId: 'ai-llms',
      source: 'hackernews',
      score: 0.75,
      volume: 42,
      rawData: { query: 'LLM' },
    });
    assert.ok(typeof id === 'number' && id > 0);
  });

  it('rejects unknown source values', () => {
    assert.throws(() => {
      ingestObservation({ topicId: 'ai-llms', source: 'unknown', score: 0.5, volume: 1, rawData: {} });
    }, /invalid source/i);
  });
});

describe('getRecentObservations', () => {
  it('returns observations within the given day window', () => {
    ingestObservation({ topicId: 'ai-llms', source: 'arxiv', score: 0.6, volume: 10, rawData: {} });
    const rows = getRecentObservations('ai-llms', 30);
    assert.ok(rows.length >= 1);
    assert.ok(rows.every(r => r.source && r.score != null));
  });

  it('returns empty array for unknown topic', () => {
    const rows = getRecentObservations('nonexistent-topic', 30);
    assert.deepEqual(rows, []);
  });
});
