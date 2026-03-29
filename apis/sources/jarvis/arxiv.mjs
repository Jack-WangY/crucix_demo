// arXiv API — academic signal detection
// No API key required. https://arxiv.org/help/api

const BASE = 'https://export.arxiv.org/api/query';

// arXiv categories most relevant to AI signals
const AI_CATS = ['cs.AI', 'cs.LG', 'cs.CL', 'cs.CV', 'cs.RO', 'stat.ML'];

// Direct XML fetch — safeFetch truncates non-JSON to 500 chars which breaks XML parsing
async function fetchXml(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Crucix/1.0' },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

export async function searchArxiv(query, { dayWindow = 30, maxResults = 20 } = {}) {
  // arXiv API doesn't support date filtering directly — use submittedDate sort + client-side filter
  const params = new URLSearchParams({
    search_query: `all:${query} AND (cat:${AI_CATS.join(' OR cat:')})`,
    sortBy: 'submittedDate',
    sortOrder: 'descending',
    max_results: String(maxResults),
    start: '0',
  });

  try {
    const xml = await fetchXml(`${BASE}?${params}`);

    if (!xml || typeof xml !== 'string') return { query, total: 0, papers: [], normScore: 0 };

    // Parse entries from Atom XML
    const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
      const entry = m[1];
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim().replace(/\s+/g, ' ') || '';
      const published = entry.match(/<published>(.*?)<\/published>/)?.[1] || '';
      const id = entry.match(/<id>(.*?)<\/id>/)?.[1] || '';
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim().slice(0, 200) || '';
      return { title, published, id, summary };
    });

    // Filter to dayWindow
    const cutoff = new Date(Date.now() - dayWindow * 86400_000);
    const recent = entries.filter(e => e.published && new Date(e.published) >= cutoff);

    // Score: volume of recent papers, normalised (20 papers in window = score 1.0)
    const normScore = Math.min(1, recent.length / 20);

    return {
      query,
      total: recent.length,
      papers: recent.slice(0, 5),
      normScore,
    };
  } catch (e) {
    return { query, total: 0, papers: [], normScore: 0, error: e.message };
  }
}

export async function collect(topics, { dayWindow = 30 } = {}) {
  const results = [];

  for (const topic of topics) {
    const queries = topic.keywords.slice(0, 2); // arXiv API is slower
    const fetched = await Promise.allSettled(
      queries.map(kw => searchArxiv(kw, { dayWindow }))
    );

    const valid = fetched
      .filter(r => r.status === 'fulfilled' && !r.value.error)
      .map(r => r.value);

    if (valid.length === 0) continue;

    const avgScore = valid.reduce((s, v) => s + v.normScore, 0) / valid.length;
    const totalVolume = valid.reduce((s, v) => s + v.total, 0);
    const topPapers = valid.flatMap(v => v.papers).slice(0, 5);

    results.push({
      topicId: topic.id,
      source: 'arxiv',
      score: Math.round(avgScore * 10000) / 10000,
      volume: totalVolume,
      rawData: { queries, topPapers, dayWindow },
    });

    await new Promise(r => setTimeout(r, 500)); // arXiv rate limit: 1 req/3s recommended
  }

  return results;
}
