// Jarvis — AI Signals Intelligence Brain
// Master source: collects from 4 tiers, persists to SQLite, computes trends.

import { getDb } from '../../lib/db/index.mjs';
import { getTopics } from '../../lib/jarvis/areas.mjs';
import { ingestBatch } from '../../lib/jarvis/signals.mjs';
import { computeTopicTrends, getAreaTrends } from '../../lib/jarvis/trends.mjs';
import { analyzeArea } from '../../lib/jarvis/analyzer.mjs';
import { collect as hnCollect } from './jarvis/hackernews.mjs';
import { collect as arxivCollect } from './jarvis/arxiv.mjs';
import { collect as patentsCollect } from './jarvis/patents.mjs';
import { collect as pubsCollect } from './jarvis/publications.mjs';

const AREA_ID = 'ai-signals';

export async function collect() {
  const topics = getTopics(AREA_ID).filter(t => t.enabled);
  if (topics.length === 0) return { source: 'Jarvis', status: 'no_topics', areas: [] };

  // Run all 4 source tiers in parallel (each internally throttles)
  const [hnResults, arxivResults, patentsResults, pubsResults] = await Promise.allSettled([
    hnCollect(topics, { dayWindow: 30 }),
    arxivCollect(topics, { dayWindow: 30 }),
    patentsCollect(topics, { dayWindow: 90 }),
    pubsCollect(topics, { dayWindow: 30 }),
  ]);

  const allObservations = [
    ...(hnResults.status === 'fulfilled' ? hnResults.value : []),
    ...(arxivResults.status === 'fulfilled' ? arxivResults.value : []),
    ...(patentsResults.status === 'fulfilled' ? patentsResults.value : []),
    ...(pubsResults.status === 'fulfilled' ? pubsResults.value : []),
  ];

  // Persist observations to SQLite
  ingestBatch(allObservations);

  // Compute trend summaries for all topics
  for (const topic of topics) {
    computeTopicTrends(topic.id);
  }

  // Get computed trends
  const trends = getAreaTrends(AREA_ID);

  // Group raw signals by topic for LLM analysis
  const signalsByTopic = {};
  for (const obs of allObservations) {
    if (!signalsByTopic[obs.topicId]) signalsByTopic[obs.topicId] = [];
    signalsByTopic[obs.topicId].push({ source: obs.source, score: obs.score, volume: obs.volume });
  }

  // Async LLM analysis (non-blocking — won't delay sweep)
  analyzeArea(AREA_ID, trends, signalsByTopic).catch(() => {});

  // Build heatmap data for dashboard
  const heatmap = topics.map(topic => {
    const topicTrends = trends[topic.id] || {};
    return {
      id: topic.id,
      name: topic.name,
      periods: {
        30:  topicTrends[30]  || null,
        60:  topicTrends[60]  || null,
        90:  topicTrends[90]  || null,
        180: topicTrends[180] || null,
      },
      latestScore: topicTrends[30]?.heatmap_score ?? 0,
      latestState: topicTrends[30]?.trend_state ?? 'emerging',
      latestLevel: topicTrends[30]?.signal_level ?? 'low',
      summary: topicTrends[30]?.summary ?? null,
    };
  }).sort((a, b) => b.latestScore - a.latestScore);

  // Area-level signal summary
  const highSignals = heatmap.filter(t => t.latestLevel === 'high').length;
  const accelerating = heatmap.filter(t => t.latestState === 'accelerating').length;

  return {
    source: 'Jarvis',
    timestamp: new Date().toISOString(),
    areaId: AREA_ID,
    topicsCount: topics.length,
    observationsIngested: allObservations.length,
    heatmap,
    summary: {
      highSignalTopics: highSignals,
      acceleratingTopics: accelerating,
      topTopic: heatmap[0]?.name ?? null,
    },
    sourceErrors: {
      hackernews: hnResults.status === 'rejected' ? hnResults.reason?.message : null,
      arxiv: arxivResults.status === 'rejected' ? arxivResults.reason?.message : null,
      patents: patentsResults.status === 'rejected' ? patentsResults.reason?.message : null,
      publications: pubsResults.status === 'rejected' ? pubsResults.reason?.message : null,
    },
  };
}

export async function briefing() {
  return collect();
}

if (process.argv[1]?.endsWith('jarvis.mjs')) {
  const data = await collect();
  console.log(JSON.stringify(data, null, 2));
}
