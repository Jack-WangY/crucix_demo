// Jarvis Patents adapter — maps existing USPTO patent data to Jarvis topic signals
// Reuses the existing patents.mjs briefing output; no new API calls needed.

import { briefing as patentsBriefing } from '../patents.mjs';

// Map Jarvis topic IDs to USPTO domain keys in recentPatents
const TOPIC_TO_DOMAIN = {
  'ai-llms':       ['ai'],
  'ai-agents':     ['ai'],
  'ai-vision':     ['ai'],
  'ai-infra':      ['ai', 'semiconductor'],
  'ai-reasoning':  ['ai'],
  'ai-safety':     ['ai'],
  'ai-robotics':   ['ai'],
  'ai-enterprise': ['ai'],
};

export async function collect(topics, { dayWindow = 90 } = {}) {
  const raw = await patentsBriefing();
  if (raw?.status === 'no_key' || raw?.error) return [];

  const results = [];

  for (const topic of topics) {
    const domains = TOPIC_TO_DOMAIN[topic.id] || ['ai'];
    const patents = domains.flatMap(d => raw.recentPatents?.[d] || []);

    // Filter patents matching topic keywords
    const kwLower = topic.keywords.map(k => k.toLowerCase());
    const matching = patents.filter(p => {
      const text = `${p.title || ''} ${p.abstract || ''}`.toLowerCase();
      return kwLower.some(kw => text.includes(kw));
    });

    // Score: matching count / 10 (10 matching patents = 1.0)
    const score = Math.min(1, matching.length / 10);

    results.push({
      topicId: topic.id,
      source: 'patents',
      score: Math.round(score * 10000) / 10000,
      volume: matching.length,
      rawData: {
        topPatents: matching.slice(0, 5).map(p => ({ title: p.title, assignee: p.assignee, date: p.date })),
        dayWindow,
      },
    });
  }

  return results;
}
