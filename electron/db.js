const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

let db;
let dbPath;

async function init(app) {
  dbPath = path.join(app.getPath('userData'), 'database.sqlite');
  const filebuffer = fs.existsSync(dbPath) ? fs.readFileSync(dbPath) : null;

  const SQL = await initSqlJs({
    locateFile: (file) => `./node_modules/sql.js/dist/${file}`,
  });

  db = new SQL.Database(filebuffer);

  db.run(`
    CREATE TABLE IF NOT EXISTS Settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      value TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Arrangement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      data TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS Mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT,
      mapping TEXT,
      actions_json TEXT
    );
  `);
}

function populateInitialData() {
  // Insert some sample data for testing
  db.run('INSERT OR IGNORE INTO Mappings (id, name, type, mapping, actions_json) VALUES (?, ?, ?, ?, ?)', [
    60,
    'Test Macro',
    'noteon',
    'APC64_PAD_A1',
    JSON.stringify([
      {
        daw: 'reaper',
        track: 'DRUMS',
        command: 'volume',
        value: 1.0,
      },
      {
        daw: 'ableton',
        track: 'DRUMS',
        command: 'volume',
        value: 1.0,
      },
    ]),
  ]);

  // Populate Settings table
  db.run('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', ['reaper_port', '9000']);
  db.run('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', ['ableton_port', '9001']);
  db.run('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', ['default_bpm', '120']);
  db.run('INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)', [
    'track_list',
    'DRUMS,BASS,KEYS,VOCALS',
  ]);

  // Populate Arrangements table
  db.run('INSERT OR IGNORE INTO Arrangement (name, data) VALUES (?, ?)', [
    'My Arrangement',
    JSON.stringify({
      blocks: [
        { id: 1, name: 'Intro', length: 8 },
        { id: 2, name: 'Verse', length: 16 },
        { id: 3, name: 'Chorus', length: 16 },
      ],
    }),
  ]);

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function getSettings() {
  const stmt = db.prepare('SELECT key, value FROM Settings');
  const settings = {};
  while (stmt.step()) {
    const row = stmt.getAsObject();
    settings[row.key] = row.value;
  }
  stmt.free();
  return settings;
}

function getDb() {
  return db;
}

module.exports = {
  init,
  populateInitialData,
  getSettings,
  getDb,
};

