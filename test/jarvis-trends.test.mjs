import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.JARVIS_DB_PATH = ':memory:';

const { classifyTrendState, classifySignalLevel, computeVelocity } =
  await import('../lib/jarvis/trends.mjs');

describe('classifySignalLevel', () => {
  it('returns low for heatmap score below 0.33', () => {
    assert.equal(classifySignalLevel(0.1), 'low');
    assert.equal(classifySignalLevel(0.32), 'low');
  });
  it('returns medium for scores 0.33–0.66', () => {
    assert.equal(classifySignalLevel(0.33), 'medium');
    assert.equal(classifySignalLevel(0.5), 'medium');
  });
  it('returns high for scores above 0.66', () => {
    assert.equal(classifySignalLevel(0.67), 'high');
    assert.equal(classifySignalLevel(1.0), 'high');
  });
});

describe('computeVelocity', () => {
  it('returns positive velocity for growing series', () => {
    const v = computeVelocity([0.1, 0.2, 0.3, 0.4, 0.5]);
    assert.ok(v > 0, `expected positive velocity, got ${v}`);
  });
  it('returns negative velocity for shrinking series', () => {
    const v = computeVelocity([0.5, 0.4, 0.3, 0.2, 0.1]);
    assert.ok(v < 0, `expected negative velocity, got ${v}`);
  });
  it('returns 0 for empty or single-point series', () => {
    assert.equal(computeVelocity([]), 0);
    assert.equal(computeVelocity([0.5]), 0);
  });
});

describe('classifyTrendState', () => {
  it('marks emerging for low base + positive velocity', () => {
    assert.equal(classifyTrendState(0.15, 0.4), 'emerging');
  });
  it('marks accelerating for medium/high base + strong positive velocity', () => {
    assert.equal(classifyTrendState(0.6, 0.5), 'accelerating');
  });
  it('marks plateauing for high score + near-zero velocity', () => {
    assert.equal(classifyTrendState(0.7, 0.02), 'plateauing');
  });
  it('marks declining for negative velocity', () => {
    assert.equal(classifyTrendState(0.5, -0.3), 'declining');
  });
});
