// Jarvis LLM analyzer — generates narrative summaries and validates trend classifications
// Uses the same LLM provider already configured in crucix.config.mjs

import { createLLMProvider } from '../llm/index.mjs';
import { getDb } from '../db/index.mjs';
import config from '../../crucix.config.mjs';

let _llm = null;

function getLLM() {
  if (_llm) return _llm;
  if (!config.llm?.provider || !config.llm?.apiKey) return null;
  _llm = createLLMProvider(config.llm);
  return _llm;
}

const SYSTEM_PROMPT = `You are Jarvis, an intelligence analyst specialising in technology signal detection.
You receive structured signal data about a topic and produce concise assessments.
Be specific, factual, and brief. Output JSON only — no markdown, no prose outside the JSON.`;

/**
 * Generate a 1-2 sentence narrative summary for a topic's trend data.
 * Updates the trend_summaries.summary column in SQLite.
 */
export async function analyzeTopicTrend(topicId, topicName, trendData, rawSignals) {
  const llm = getLLM();
  if (!llm) return null;

  const prompt = `Analyze this intelligence signal for topic: "${topicName}"

Trend data (30/60/90/180 day periods):
${JSON.stringify(trendData, null, 2)}

Top signals (sample):
${JSON.stringify(rawSignals?.slice(0, 5), null, 2)}

Return JSON: { "summary": "<2 sentence assessment of current momentum and direction>", "confidence": "low|medium|high" }`;

  try {
    // llm.complete() signature: complete(systemPrompt, userMessage, opts)
    const result = await llm.complete(SYSTEM_PROMPT, prompt, {});
    const parsed = JSON.parse(result.text.trim());

    // Persist summary to DB for each period
    if (parsed.summary) {
      const db = getDb();
      db.prepare(`
        UPDATE trend_summaries SET summary = ? WHERE topic_id = ?
      `).run(parsed.summary, topicId);
    }

    return parsed;
  } catch (e) {
    return { summary: null, error: e.message };
  }
}

/**
 * Run autonomous analysis for all topics in a subject area.
 * Throttled to avoid LLM rate limits.
 */
export async function analyzeArea(areaId, trendsMap, signalsByTopic = {}) {
  const llm = getLLM();
  if (!llm) return { skipped: true, reason: 'LLM not configured' };

  const db = getDb();
  const topics = db.prepare(
    'SELECT id, name FROM topics WHERE area_id = ? AND enabled = 1'
  ).all(areaId);

  const analyses = {};
  for (const topic of topics) {
    const trendData = trendsMap[topic.id] || {};
    const rawSignals = signalsByTopic[topic.id] || [];
    analyses[topic.id] = await analyzeTopicTrend(topic.id, topic.name, trendData, rawSignals);
    await new Promise(r => setTimeout(r, 1000)); // 1s between LLM calls
  }

  return analyses;
}
