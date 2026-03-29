// UK Government Publications — GOV.UK Content API
// No API key required. Returns latest publications, press releases, and policy documents.
// Docs: https://www.gov.uk/government/publications

import { safeFetch } from '../utils/fetch.mjs';

const BASE = 'https://www.gov.uk/api/search.json';

// GOV.UK search query options
const FEEDS = [
  { label: 'Latest Publications', params: { order: '-public_timestamp', count: 10 } },
  { label: 'Press Releases', params: { filter_content_store_document_type: 'press_release', order: '-public_timestamp', count: 10 } },
  { label: 'Policy Papers', params: { filter_content_store_document_type: 'policy_paper', order: '-public_timestamp', count: 10 } },
  { label: 'Statistical Releases', params: { filter_content_store_document_type: 'statistics', order: '-public_timestamp', count: 10 } },
  { label: 'Consultations', params: { filter_content_store_document_type: 'open_consultation', order: '-public_timestamp', count: 10 } },
];

function mapResult(r) {
  return {
    title: r.title,
    type: r.content_store_document_type || r.format,
    organisations: (r.organisations || []).map(o => o.title || o.slug),
    published: r.public_timestamp,
    url: r.link ? `https://www.gov.uk${r.link}` : null,
    description: r.description?.slice(0, 280) || null,
  };
}

async function fetchFeed({ label, params }) {
  try {
    const qs = new URLSearchParams(params);
    const data = await safeFetch(`${BASE}?${qs}`, { timeout: 10000 });
    const results = (data?.results || []).map(mapResult);
    return { label, results, total: data?.total || results.length };
  } catch (e) {
    return { label, error: e.message, results: [] };
  }
}

export async function collect() {
  const feeds = await Promise.all(FEEDS.map(f => fetchFeed(f)));

  // Deduplicate across feeds by URL
  const seen = new Set();
  const all = [];
  for (const feed of feeds) {
    for (const r of feed.results) {
      if (r.url && !seen.has(r.url)) {
        seen.add(r.url);
        all.push(r);
      }
    }
  }

  // Sort by published date descending
  all.sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

  return {
    source: 'GOV.UK Publications',
    timestamp: new Date().toISOString(),
    feeds: feeds.map(f => ({ label: f.label, count: f.results.length, error: f.error || null })),
    recent: all.slice(0, 30),
    total: all.length,
  };
}

export async function briefing() {
  return collect();
}

if (process.argv[1]?.endsWith('ukgov.mjs')) {
  const data = await briefing();
  console.log(JSON.stringify(data, null, 2));
}
