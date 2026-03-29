// Publications signal — AI company official blogs (RSS) + Google Books volume search
// No API key required for RSS; Google Books API is free with generous rate limits.

import { safeFetch } from '../../utils/fetch.mjs';

// Direct XML fetch for RSS — safeFetch truncates non-JSON to 500 chars
async function fetchXml(url, timeoutMs = 10000) {
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

// AI/ML blogs and publications with working RSS feeds
const AI_BLOGS = [
  { name: 'Hugging Face Blog',        url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'Google DeepMind',          url: 'https://deepmind.google/blog/rss.xml' },
  { name: 'The Gradient',             url: 'https://thegradient.pub/rss/' },
  { name: 'Towards Data Science',     url: 'https://towardsdatascience.com/feed' },
  { name: 'MIT Tech Review AI',       url: 'https://www.technologyreview.com/feed/' },
  { name: 'VentureBeat AI',           url: 'https://venturebeat.com/category/ai/feed/' },
  { name: 'The Batch (DeepLearning)', url: 'https://www.deeplearning.ai/the-batch/feed/' },
];

// Simple RSS title+date extractor (no xml parser dependency)
function parseRssTitles(xml, dayWindow) {
  if (!xml || typeof xml !== 'string') return [];
  const cutoff = new Date(Date.now() - dayWindow * 86400_000);
  const items = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map(m => {
    const block = m[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim() || '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    const link = block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() || '';
    return { title, pubDate, link };
  });
  return items.filter(i => {
    if (!i.pubDate) return true; // include if no date
    return new Date(i.pubDate) >= cutoff;
  });
}

async function fetchBlog({ name, url }, dayWindow) {
  try {
    const xml = await fetchXml(url, 10000);
    const posts = parseRssTitles(xml, dayWindow);
    return { name, posts, count: posts.length };
  } catch (e) {
    return { name, posts: [], count: 0, error: e.message };
  }
}

// Google Books API — proxy for "how much is written about this topic"
async function queryGoogleBooks(query, { dayWindow = 30 } = {}) {
  try {
    const params = new URLSearchParams({
      q: query,
      maxResults: '10',
      orderBy: 'newest',
      printType: 'books',
    });
    const data = await safeFetch(
      `https://www.googleapis.com/books/v1/volumes?${params}`,
      { timeout: 8000 }
    );
    const total = data?.totalItems || 0;
    const items = (data?.items || []).slice(0, 3).map(b => ({
      title: b.volumeInfo?.title,
      published: b.volumeInfo?.publishedDate,
      authors: b.volumeInfo?.authors?.slice(0, 2),
    }));
    return { query, total, items };
  } catch (e) {
    return { query, total: 0, items: [], error: e.message };
  }
}

export async function collect(topics, { dayWindow = 30 } = {}) {
  // Fetch all blogs once (shared across topics)
  const blogResults = await Promise.allSettled(
    AI_BLOGS.map(b => fetchBlog(b, dayWindow))
  );
  const blogs = blogResults
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const results = [];

  // Total posts across all working blogs (activity baseline — all these blogs cover AI)
  const totalBlogPosts = blogs.reduce((s, b) => s + b.posts.length, 0);

  for (const topic of topics) {
    // Keyword matches give a topic-specific signal on top of baseline activity
    const kwLower = topic.keywords.map(k => k.toLowerCase());
    // Also match the topic name itself (e.g. "agents", "vision") as a broad term
    const broadTerms = [...kwLower, topic.name.toLowerCase()];
    let mentionCount = 0;
    const mentionedPosts = [];

    for (const blog of blogs) {
      for (const post of blog.posts) {
        const titleLower = post.title.toLowerCase();
        if (broadTerms.some(kw => titleLower.includes(kw))) {
          mentionCount++;
          mentionedPosts.push({ source: blog.name, ...post });
        }
      }
    }

    // Google Books for top keyword
    const booksResult = await queryGoogleBooks(topic.keywords[0]);
    const booksScore = Math.min(1, (booksResult.total || 0) / 5000); // 5000 books = 1.0

    // Blog score: baseline activity (30%) + keyword matches (70%)
    // Baseline ensures score > 0 when AI ecosystem is active even without exact keyword hits
    const baselineScore = Math.min(1, totalBlogPosts / 50) * 0.3;
    const keywordScore = Math.min(1, mentionCount / 5) * 0.7;
    const blogScore = baselineScore + keywordScore;
    const score = blogScore * 0.7 + booksScore * 0.3;

    results.push({
      topicId: topic.id,
      source: 'publications',
      score: Math.round(score * 10000) / 10000,
      volume: mentionCount + (booksResult.total || 0),
      rawData: {
        blogMentions: mentionedPosts.slice(0, 5),
        topBooks: booksResult.items,
        dayWindow,
      },
    });

    await new Promise(r => setTimeout(r, 200));
  }

  return results;
}
