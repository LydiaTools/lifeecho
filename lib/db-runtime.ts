import { env } from 'cloudflare:workers';

export type StageInput = {
  ageLabel: string;
  title: string;
  memory: string;
  value: string;
  stageType?: 'past' | 'present';
};

let initialized = false;

function d1() {
  if (!env.DB) throw new Error('D1 binding DB is unavailable');
  return env.DB;
}

export async function ensureSchema() {
  if (initialized) return;
  const db = d1();
  await db.batch([
    db.prepare('PRAGMA foreign_keys = ON'),
    db.prepare(`CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      current_age INTEGER NOT NULL,
      consent_version TEXT NOT NULL DEFAULT '2026-08-31',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS life_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      stage_order INTEGER NOT NULL,
      age_label TEXT NOT NULL,
      title TEXT NOT NULL,
      memory TEXT NOT NULL,
      value TEXT NOT NULL,
      stage_type TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS councils (
      id TEXT PRIMARY KEY,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      category TEXT NOT NULL,
      responses_json TEXT NOT NULL,
      synthesis_json TEXT NOT NULL,
      action_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS council_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      council_id TEXT NOT NULL UNIQUE REFERENCES councils(id) ON DELETE CASCADE,
      helpfulness INTEGER NOT NULL,
      would_return INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS council_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
      stage_key TEXT NOT NULL,
      user_message TEXT NOT NULL,
      stage_reply TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS product_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
      visitor_hash TEXT NOT NULL,
      event_name TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_life_stages_profile_order ON life_stages(profile_id, stage_order)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_councils_profile_created ON councils(profile_id, created_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_turns_council_created ON council_turns(council_id, created_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_events_name_created ON product_events(event_name, created_at)'),
  ]);
  initialized = true;
}

export async function visitorHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function findProfile(hash: string) {
  await ensureSchema();
  return d1()
    .prepare('SELECT id, name, current_age, created_at, updated_at FROM profiles WHERE visitor_hash = ?')
    .bind(hash)
    .first<{ id: number; name: string; current_age: number; created_at: string; updated_at: string }>();
}

export async function loadStages(profileId: number) {
  const rows = await d1()
    .prepare(`SELECT id, age_label, title, memory, value, stage_type
      FROM life_stages WHERE profile_id = ? ORDER BY stage_order ASC`)
    .bind(profileId)
    .all<{ id: number; age_label: string; title: string; memory: string; value: string; stage_type: string }>();
  return rows.results;
}

export async function recordEvent(
  hash: string,
  eventName: string,
  payload: Record<string, unknown> = {},
  profileId?: number,
) {
  await ensureSchema();
  await d1()
    .prepare(`INSERT INTO product_events (profile_id, visitor_hash, event_name, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)`)
    .bind(profileId ?? null, hash, eventName, JSON.stringify(payload), new Date().toISOString())
    .run();
}

export function database() {
  return d1();
}
