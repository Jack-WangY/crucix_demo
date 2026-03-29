import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
const DB_PATH = process.env.JARVIS_DB_PATH
  || join(__dirname, '../../data/jarvis.db');

let _db = null;

export function getDb() {
  if (_db) return _db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.exec(SCHEMA);
  seedDefaultAreas(_db);
  return _db;
}

function seedDefaultAreas(db) {
  const existing = db.prepare('SELECT id FROM subject_areas WHERE id = ?').get('ai-signals');
  if (existing) return;

  const insertArea = db.prepare(
    'INSERT INTO subject_areas (id, name, description, enabled) VALUES (?, ?, ?, 1)'
  );
  const insertTopic = db.prepare(
    'INSERT INTO topics (id, area_id, name, keywords, sort_order) VALUES (?, ?, ?, ?, ?)'
  );

  db.transaction(() => {
    insertArea.run('ai-signals', 'AI Signals',
      'Artificial intelligence research, tooling, and adoption signals');

    const topics = [
      { id: 'ai-llms',       name: 'Large Language Models', kw: ['LLM','GPT','Claude','Gemini','language model','transformer','fine-tuning'], ord: 0 },
      { id: 'ai-agents',     name: 'AI Agents',             kw: ['AI agent','autonomous agent','agentic','tool use','ReAct'], ord: 1 },
      { id: 'ai-vision',     name: 'Vision & Multimodal',   kw: ['vision model','multimodal','image generation','diffusion','Stable Diffusion'], ord: 2 },
      { id: 'ai-infra',      name: 'AI Infrastructure',     kw: ['GPU cluster','CUDA','inference','vLLM','AI chip','TPU','training infra'], ord: 3 },
      { id: 'ai-reasoning',  name: 'Reasoning & Planning',  kw: ['chain of thought','reasoning','planning','tree of thought','o1'], ord: 4 },
      { id: 'ai-safety',     name: 'AI Safety & Alignment', kw: ['AI safety','alignment','red teaming','constitutional AI','interpretability'], ord: 5 },
      { id: 'ai-robotics',   name: 'Robotics & Embodied',   kw: ['robotics','embodied AI','manipulation','robot learning'], ord: 6 },
      { id: 'ai-enterprise', name: 'Enterprise AI',         kw: ['enterprise AI','RAG','vector database','MLOps','AI governance'], ord: 7 },
    ];

    for (const t of topics) {
      insertTopic.run(t.id, 'ai-signals', t.name, JSON.stringify(t.kw), t.ord);
    }
  })();
}
