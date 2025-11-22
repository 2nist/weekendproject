-- SQLite schema for library and analysis

PRAGMA foreign_keys = ON;

-- Projects table: represents imported songs
CREATE TABLE IF NOT EXISTS Projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE,
  title TEXT,
  artist TEXT,
  bpm INTEGER,
  key_signature TEXT,
  audio_path TEXT,
  midi_path TEXT,
  analysis_id INTEGER,
  status TEXT,
  metadata_json TEXT,
  created_at TEXT
);

-- Assets table for library-managed files
CREATE TABLE IF NOT EXISTS Assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  type TEXT, -- 'audio' | 'midi' | 'thumbnail'
  file_path TEXT,
  created_at TEXT,
  FOREIGN KEY(project_id) REFERENCES Projects(id) ON DELETE CASCADE
);

-- Analysis cache table
CREATE TABLE IF NOT EXISTS AnalysisCache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER,
  version TEXT,
  analysis_json TEXT,
  created_at TEXT,
  FOREIGN KEY(project_id) REFERENCES Projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_assets_project_id ON Assets(project_id);
CREATE INDEX IF NOT EXISTS idx_analysiscache_project_id ON AnalysisCache(project_id);
