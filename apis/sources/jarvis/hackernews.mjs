// HN Algolia API — early signal detection via HN posts + comments
// No API key required. https://hn.algolia.com/api

import { safeFetch } from '../../utils/fetch.mjs';

const BASE = 'https://hn.algolia.com/api/v1';

/**
 * Search HN for a query within a date window.
 * Returns { hits, total, avgScore } where avgScore is normalised 0–1 based on points.
 */
export async function searchHN(query, { dayWindow = 30, maxHits = 50 } = {}) {
  const after = Math.floor((Date.now() - dayWindow * 86400_000) / 1000);
  const params = new URLSearchParams({
    query,
    tags: 'story',
    numericFilters: `created_at_i>${after}`,
    hitsPerPage: String(maxHits),
  });

  try {
    const data = await safeFetch(`${BASE}/search?${params}`, { timeout: 8000 });
    const hits = (data?.hits || []).map(h => ({
      title: h.title,
      url: h.url,
      points: h.points || 0,
      comments: h.num_comments || 0,
      author: h.author,
      created: new Date(h.created_at_i * 1000).toISOString(),
    }));

    const maxPoints = hits.reduce((m, h) => Math.max(m, h.points), 1);
    const avgPoints = hits.length > 0
      ? hits.reduce((s, h) => s + h.points, 0) / hits.length
      : 0;

    return {
      query,
      total: data?.nbHits || 0,
      hits: hits.slice(0, 10), // keep top 10 for raw_data
      avgPoints,
      normScore: Math.min(1, avgPoints / 100), // 100 points = score of 1.0
    };
  } catch (e) {
    return { query, total: 0, hits: [], avgPoints: 0, normScore: 0, error: e.message };
  }
}

/**
 * Collect HN signals for an array of topics.
 * topics: [{ id, name, keywords: string[] }]
 * Returns array of { topicId, source, score, volume, rawData }
 */
export async function collect(topics, { dayWindow = 30 } = {}) {
  const results = [];

  for (const topic of topics) {
    // Use the top 3 keywords to avoid rate limits
    const queries = topic.keywords.slice(0, 3);
    const fetched = await Promise.allSettled(
      queries.map(kw => searchHN(kw, { dayWindow }))
    );

    const valid = fetched
      .filter(r => r.status === 'fulfilled' && !r.value.error)
      .map(r => r.value);

    if (valid.length === 0) continue;

    const avgScore = valid.reduce((s, v) => s + v.normScore, 0) / valid.length;
    const totalVolume = valid.reduce((s, v) => s + v.total, 0);
    const topHits = valid.flatMap(v => v.hits).sort((a, b) => b.points - a.points).slice(0, 5);

    results.push({
      topicId: topic.id,
      source: 'hackernews',
      score: Math.round(avgScore * 10000) / 10000,
      volume: totalVolume,
      rawData: { queries, topHits, dayWindow },
    });

    // Polite delay between topics
    await new Promise(r => setTimeout(r, 300));
  }

  return results;
}
