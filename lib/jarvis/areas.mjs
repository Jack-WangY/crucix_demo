import { getDb } from '../db/index.mjs';

export function getAreas() {
  return getDb().prepare('SELECT * FROM subject_areas ORDER BY name').all()
    .map(a => ({ ...a, config: JSON.parse(a.config || '{}'), enabled: !!a.enabled }));
}

export function getArea(id) {
  const row = getDb().prepare('SELECT * FROM subject_areas WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, config: JSON.parse(row.config || '{}'), enabled: !!row.enabled };
}

export function getTopics(areaId) {
  return getDb().prepare(
    'SELECT * FROM topics WHERE area_id = ? ORDER BY sort_order'
  ).all(areaId).map(t => ({ ...t, keywords: JSON.parse(t.keywords || '[]'), enabled: !!t.enabled }));
}

export function createArea({ id, name, description = '', config = {} }) {
  if (!id || !name) throw new Error('id and name are required');
  getDb().prepare(
    'INSERT INTO subject_areas (id, name, description, config) VALUES (?, ?, ?, ?)'
  ).run(id, name, description, JSON.stringify(config));
  return getArea(id);
}

export function updateArea(id, patch) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM subject_areas WHERE id = ?').get(id);
  if (!existing) throw new Error(`Area "${id}" not found`);
  const config = JSON.stringify({ ...JSON.parse(existing.config || '{}'), ...(patch.config || {}) });
  db.prepare(`
    UPDATE subject_areas SET name = ?, description = ?, enabled = ?, config = ? WHERE id = ?
  `).run(
    patch.name ?? existing.name,
    patch.description ?? existing.description,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled,
    config,
    id,
  );
  return getArea(id);
}

export function addTopic(areaId, { id, name, keywords = [] }) {
  if (!id || !name) throw new Error('id and name are required');
  const count = getDb().prepare('SELECT COUNT(*) as n FROM topics WHERE area_id = ?').get(areaId).n;
  getDb().prepare(
    'INSERT INTO topics (id, area_id, name, keywords, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(id, areaId, name, JSON.stringify(keywords), count);
  return getDb().prepare('SELECT * FROM topics WHERE id = ?').get(id);
}

export function updateTopic(id, patch) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM topics WHERE id = ?').get(id);
  if (!existing) throw new Error(`Topic "${id}" not found`);
  db.prepare(`
    UPDATE topics SET name = ?, keywords = ?, enabled = ? WHERE id = ?
  `).run(
    patch.name ?? existing.name,
    JSON.stringify(patch.keywords ?? JSON.parse(existing.keywords)),
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled,
    id,
  );
}
