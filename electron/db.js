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

  // Music Theory Schema Tables
  db.run(`
    CREATE TABLE IF NOT EXISTS AudioAnalysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT,
      file_hash TEXT UNIQUE,
      analysis_timestamp TEXT,
      metadata_json TEXT,
      linear_analysis_json TEXT,
      structural_map_json TEXT,
      arrangement_flow_json TEXT,
      harmonic_context_json TEXT,
      polyrhythmic_layers_json TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS AnalysisSections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_id INTEGER,
      section_id TEXT,
      section_label TEXT,
      section_variant INTEGER,
      harmonic_dna_json TEXT,
      rhythmic_dna_json TEXT,
      melodic_contour_json TEXT,
      FOREIGN KEY (analysis_id) REFERENCES AudioAnalysis(id),
      UNIQUE(analysis_id, section_id)
    );
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_analysis_sections_analysis_id ON AnalysisSections(analysis_id);
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_analysis_sections_label ON AnalysisSections(section_label);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS GenreProfiles (
      genre_name TEXT PRIMARY KEY,
      constraints_json TEXT,
      probability_weights_json TEXT
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS UserSongs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      created_at TEXT,
      structural_map_json TEXT,
      arrangement_flow_json TEXT,
      harmonic_context_json TEXT
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

function saveAnalysis(analysisData) {
  const {
    file_path,
    file_hash,
    metadata,
    linear_analysis,
    structural_map,
    arrangement_flow,
    harmonic_context,
    polyrhythmic_layers,
  } = analysisData;

  console.log('DB: Saving analysis for file_hash:', file_hash);
  console.log('DB: Data sizes:', {
    metadata: JSON.stringify(metadata || {}).length,
    linear_analysis: JSON.stringify(linear_analysis || {}).length,
    structural_map: JSON.stringify(structural_map || {}).length,
    arrangement_flow: JSON.stringify(arrangement_flow || {}).length,
    harmonic_context: JSON.stringify(harmonic_context || {}).length,
  });

  try {
    console.log('DB: Executing analysis save...');

    // Check for existing record
    let existingId = null;
    const existingStmt = db.prepare('SELECT id FROM AudioAnalysis WHERE file_hash = ?');
    existingStmt.bind([file_hash]);
    if (existingStmt.step()) {
      const row = existingStmt.getAsObject();
      existingId = row?.id || null;
    }
    existingStmt.free();

    if (existingId) {
      console.log('DB: Removing existing analysis with ID:', existingId);
      db.run('DELETE FROM AnalysisSections WHERE analysis_id = ?', [existingId]);
      db.run('DELETE FROM AudioAnalysis WHERE id = ?', [existingId]);
    }

    // Insert new record
    db.run(
      `INSERT INTO AudioAnalysis 
       (file_path, file_hash, analysis_timestamp, metadata_json, linear_analysis_json, 
        structural_map_json, arrangement_flow_json, harmonic_context_json, polyrhythmic_layers_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        file_path,
        file_hash,
        new Date().toISOString(),
        JSON.stringify(metadata || {}),
        JSON.stringify(linear_analysis || {}),
        JSON.stringify(structural_map || {}),
        JSON.stringify(arrangement_flow || {}),
        JSON.stringify(harmonic_context || {}),
        JSON.stringify(polyrhythmic_layers || []),
      ],
    );
    
    // Get the inserted ID
    const getIdStmt = db.prepare('SELECT id FROM AudioAnalysis WHERE file_hash = ?');
    getIdStmt.bind([file_hash]);
    let analysisId = null;
    if (getIdStmt.step()) {
      const row = getIdStmt.getAsObject();
      analysisId = row?.id || null;
    }
    getIdStmt.free();

    if (!analysisId) {
      throw new Error('Failed to retrieve analysis ID after insert');
    }
    
    console.log('DB: Analysis saved successfully, ID:', analysisId);
    
    // Persist database to disk
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
      console.log('DB: Database persisted to disk');
    } catch (persistError) {
      console.error('DB: Error persisting database:', persistError);
      // Don't throw - the data is still in memory
    }
    
    if (analysisId) {
      // Save sections (limit to first 50 to avoid performance issues with 954 sections)
      if (structural_map && structural_map.sections) {
        const sectionsToSave = structural_map.sections.slice(0, 50);
        console.log('DB: Saving', sectionsToSave.length, 'sections (limited from', structural_map.sections.length, ')');
        sectionsToSave.forEach((section, idx) => {
          try {
            db.run(
              `INSERT OR REPLACE INTO AnalysisSections 
               (analysis_id, section_id, section_label, section_variant, 
                harmonic_dna_json, rhythmic_dna_json, melodic_contour_json)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                analysisId,
                section.section_id || `section-${idx}`,
                section.section_label || 'unknown',
                section.section_variant || 1,
                JSON.stringify(section.harmonic_dna || {}),
                JSON.stringify(section.rhythmic_dna || {}),
                JSON.stringify(section.melodic_contour || {}),
              ],
            );
          } catch (sectionError) {
            console.error(`DB: Error saving section ${idx}:`, sectionError);
          }
        });
        console.log('DB: Sections saved');
      }

      // Persist database again after sections
      try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
        console.log('DB: Database persisted after sections');
      } catch (persistError) {
        console.error('DB: Error persisting database after sections:', persistError);
      }

      return analysisId;
    }

    console.error('DB: No analysis ID available');
    return null;
  } catch (error) {
    console.error('DB: Error saving analysis:', error);
    throw error;
  }
}

function getAnalysis(fileHash) {
  console.log('DB: Getting analysis for file_hash:', fileHash);
  const stmt = db.prepare('SELECT * FROM AudioAnalysis WHERE file_hash = ?');
  stmt.bind([fileHash]);

  let row = null;

  if (stmt.step()) {
    row = stmt.getAsObject();
    console.log('DB: Got row via step/getAsObject');
  }

  stmt.free();

  if (row && row.id !== undefined) {
    
    let metadata, linear_analysis, structural_map, arrangement_flow, harmonic_context, polyrhythmic_layers;
    
    try {
      metadata = JSON.parse(row.metadata_json || '{}');
      linear_analysis = JSON.parse(row.linear_analysis_json || '{}');
      structural_map = JSON.parse(row.structural_map_json || '{}');
      arrangement_flow = JSON.parse(row.arrangement_flow_json || '{}');
      harmonic_context = JSON.parse(row.harmonic_context_json || '{}');
      polyrhythmic_layers = JSON.parse(row.polyrhythmic_layers_json || '[]');
    } catch (parseError) {
      console.error('DB: Error parsing JSON data:', parseError);
      console.error('DB: Row data:', {
        hasMetadata: !!row.metadata_json,
        metadataLength: (row.metadata_json || '').length,
        hasLinearAnalysis: !!row.linear_analysis_json,
        linearAnalysisLength: (row.linear_analysis_json || '').length,
        hasStructuralMap: !!row.structural_map_json,
        structuralMapLength: (row.structural_map_json || '').length,
      });
      throw parseError;
    }
    
    const analysis = {
      id: row.id,
      file_path: row.file_path || '',
      file_hash: row.file_hash || '',
      analysis_timestamp: row.analysis_timestamp || '',
      metadata,
      linear_analysis,
      structural_map,
      arrangement_flow,
      harmonic_context,
      polyrhythmic_layers,
    };
    
    console.log('DB: Analysis retrieved:', {
      id: analysis.id,
      hasLinearAnalysis: !!analysis.linear_analysis,
      hasStructuralMap: !!analysis.structural_map,
      sectionCount: analysis.structural_map?.sections?.length || 0,
      eventCount: analysis.linear_analysis?.events?.length || 0,
    });
    
    return analysis;
  }

  console.warn('DB: No analysis found for file_hash:', fileHash);
  return null;
}

function getAnalysisSections(analysisId) {
  const stmt = db.prepare('SELECT * FROM AnalysisSections WHERE analysis_id = ?');
  const sections = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    sections.push({
      id: row.id,
      analysis_id: row.analysis_id,
      section_id: row.section_id,
      section_label: row.section_label,
      section_variant: row.section_variant,
      harmonic_dna: JSON.parse(row.harmonic_dna_json || '{}'),
      rhythmic_dna: JSON.parse(row.rhythmic_dna_json || '{}'),
      melodic_contour: JSON.parse(row.melodic_contour_json || '{}'),
    });
  }
  stmt.free();
  return sections;
}

function saveUserSong(songData) {
  const { name, structural_map, arrangement_flow, harmonic_context } = songData;

  db.run(
    `INSERT INTO UserSongs (name, created_at, structural_map_json, arrangement_flow_json, harmonic_context_json)
     VALUES (?, ?, ?, ?, ?)`,
    [
      name,
      new Date().toISOString(),
      JSON.stringify(structural_map),
      JSON.stringify(arrangement_flow),
      JSON.stringify(harmonic_context),
    ],
  );

  const stmt = db.prepare('SELECT id FROM UserSongs WHERE name = ? ORDER BY created_at DESC LIMIT 1');
  const result = stmt.get([name]);
  stmt.free();

  if (result && result.length > 0 && result[0] && result[0].values && result[0].values.length > 0 && result[0].values[0] && result[0].values[0].length > 0) {
    return result[0].values[0][0];
  }

  return null;
}

module.exports = {
  init,
  populateInitialData,
  getSettings,
  getDb,
  saveAnalysis,
  getAnalysis,
  getAnalysisSections,
  saveUserSong,
};

