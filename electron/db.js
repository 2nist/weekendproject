const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const zlib = require('zlib');
const logger = require('./analysis/logger');

let db;
let dbPath;

// Compression utilities for large data arrays
function compressData(data) {
  if (!data) return null;
  try {
    const jsonString = JSON.stringify(data);
    const compressed = zlib.deflateSync(Buffer.from(jsonString, 'utf8'));
    return compressed.toString('base64');
  } catch (error) {
    logger.warn('DB: Compression failed, storing uncompressed:', error.message);
    return JSON.stringify(data); // Fallback to uncompressed
  }
}

function decompressData(compressedData) {
  if (!compressedData) return null;
  try {
    // Check if data is compressed (base64 encoded)
    const buffer = Buffer.from(compressedData, 'base64');
    const decompressed = zlib.inflateSync(buffer);
    return JSON.parse(decompressed.toString('utf8'));
  } catch (error) {
    // If decompression fails, assume it's uncompressed JSON
    try {
      return JSON.parse(compressedData);
    } catch (parseError) {
      logger.warn('DB: Both compression and JSON parsing failed:', error.message);
      return null;
    }
  }
}

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

  db.run(`CREATE INDEX IF NOT EXISTS idx_audio_analysis_file_hash ON AudioAnalysis(file_hash);`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_audio_analysis_timestamp ON AudioAnalysis(analysis_timestamp);`,
  );

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

  // Projects table for user library
  db.run(`
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
      lyrics_json TEXT,
      metadata_json TEXT,
      created_at TEXT
    );
  `);

  // Ensure schema upgrades for existing DBs: add 'lyrics_json' column if missing
  try {
    const pragma = db.prepare("PRAGMA table_info('Projects')");
    let hasLyrics = false;
    while (pragma.step()) {
      const row = pragma.getAsObject();
      if (row && (row.name === 'lyrics_json' || row.name === 'lyrics')) {
        hasLyrics = true;
        break;
      }
    }
    pragma.free();
    if (!hasLyrics) {
      db.run('ALTER TABLE Projects ADD COLUMN lyrics_json TEXT');
      logger.info('DB: Added missing column lyrics_json to Projects');
    }
  } catch (e) {
    logger.warn(
      'DB: Failed to verify/alter Projects table for lyrics_json column:',
      e?.message || e,
    );
  }
}

function populateInitialData() {
  // Insert some sample data for testing
  db.run(
    'INSERT OR IGNORE INTO Mappings (id, name, type, mapping, actions_json) VALUES (?, ?, ?, ?, ?)',
    [
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
    ],
  );

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

function setSetting(key, value) {
  try {
    db.run('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', [key, String(value)]);
    // Save database to disk
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    return { success: true };
  } catch (error) {
    logger.error('Error setting setting:', error);
    return { success: false, error: error.message };
  }
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

  logger.info('DB: Saving analysis for file_hash:', file_hash);

  // Compress large arrays in linear_analysis to reduce storage size
  const compressedLinearAnalysis = { ...linear_analysis };
  if (linear_analysis?.chroma_frames) {
    logger.debug(
      'DB: Compressing chroma_frames array of length:',
      linear_analysis.chroma_frames.length,
    );
    compressedLinearAnalysis.chroma_frames = compressData(linear_analysis.chroma_frames);
  }
  if (linear_analysis?.mfcc_frames) {
    logger.debug(
      'DB: Compressing mfcc_frames array of length:',
      linear_analysis.mfcc_frames.length,
    );
    compressedLinearAnalysis.mfcc_frames = compressData(linear_analysis.mfcc_frames);
  }
  if (linear_analysis?.events) {
    logger.debug('DB: Compressing events array of length:', linear_analysis.events.length);
    compressedLinearAnalysis.events = compressData(linear_analysis.events);
  }

  logger.debug('DB: Data sizes:', {
    metadata: JSON.stringify(metadata || {}).length,
    linear_analysis: JSON.stringify(compressedLinearAnalysis || {}).length,
    structural_map: JSON.stringify(structural_map || {}).length,
    arrangement_flow: JSON.stringify(arrangement_flow || {}).length,
    harmonic_context: JSON.stringify(harmonic_context || {}).length,
  });

  try {
    logger.info('DB: Executing analysis save...');

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
      logger.debug('DB: Removing existing analysis with ID:', existingId);
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
        JSON.stringify(compressedLinearAnalysis || {}),
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

    logger.info('DB: Analysis saved successfully, ID:', analysisId);

    // Persist database to disk
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
      logger.info('DB: Database persisted to disk');
    } catch (persistError) {
      logger.error('DB: Error persisting database:', persistError);
      // Don't throw - the data is still in memory
    }

    if (analysisId) {
      // Save sections (limit to first 50 to avoid performance issues with 954 sections)
      if (structural_map && structural_map.sections) {
        const sectionsToSave = structural_map.sections.slice(0, 50);
        logger.debug(
          'DB: Saving',
          sectionsToSave.length,
          'sections (limited from',
          structural_map.sections.length,
          ')',
        );
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
            logger.error(`DB: Error saving section ${idx}:`, sectionError);
          }
        });
        logger.debug('DB: Sections saved');
      }

      // Persist database again after sections
      try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
        logger.info('DB: Database persisted after sections');
      } catch (persistError) {
        logger.error('DB: Error persisting database after sections:', persistError);
      }

      return analysisId;
    }

    logger.error('DB: No analysis ID available');
    return null;
  } catch (error) {
    logger.error('DB: Error saving analysis:', error);
    throw error;
  }
}

function getAnalysis(fileHash) {
  logger.debug('DB: Getting analysis for file_hash:', fileHash);
  const stmt = db.prepare('SELECT * FROM AudioAnalysis WHERE file_hash = ?');
  stmt.bind([fileHash]);

  let row = null;

  if (stmt.step()) {
    row = stmt.getAsObject();
    logger.debug('DB: Got row via step/getAsObject');
  }

  stmt.free();

  if (row && row.id !== undefined) {
    let metadata,
      linear_analysis,
      structural_map,
      arrangement_flow,
      harmonic_context,
      polyrhythmic_layers;

    try {
      metadata = JSON.parse(row.metadata_json || '{}');
      linear_analysis = JSON.parse(row.linear_analysis_json || '{}');

      // Decompress large arrays in linear_analysis
      if (linear_analysis?.chroma_frames) {
        linear_analysis.chroma_frames = decompressData(linear_analysis.chroma_frames);
      }
      if (linear_analysis?.mfcc_frames) {
        linear_analysis.mfcc_frames = decompressData(linear_analysis.mfcc_frames);
      }
      if (linear_analysis?.events) {
        linear_analysis.events = decompressData(linear_analysis.events);
      }

      structural_map = JSON.parse(row.structural_map_json || '{}');
      arrangement_flow = JSON.parse(row.arrangement_flow_json || '{}');
      harmonic_context = JSON.parse(row.harmonic_context_json || '{}');
      polyrhythmic_layers = JSON.parse(row.polyrhythmic_layers_json || '[]');
    } catch (parseError) {
      logger.error('DB: Error parsing JSON data:', parseError);
      logger.debug('DB: Row data:', {
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

    logger.debug('DB: Analysis retrieved:', {
      id: analysis.id,
      hasLinearAnalysis: !!analysis.linear_analysis,
      hasStructuralMap: !!analysis.structural_map,
      hasFilePath: !!analysis.file_path,
      filePath: analysis.file_path,
      sectionCount: analysis.structural_map?.sections?.length || 0,
      eventCount: analysis.linear_analysis?.events?.length || 0,
    });

    return analysis;
  }

  logger.warn('DB: No analysis found for file_hash:', fileHash);
  return null;
}

function getAnalysisById(analysisId) {
  logger.debug('DB: Getting analysis by id:', analysisId);
  const stmt = db.prepare('SELECT * FROM AudioAnalysis WHERE id = ?');
  stmt.bind([analysisId]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  if (!row) return null;
  return {
    id: row.id,
    file_path: row.file_path,
    file_hash: row.file_hash,
    metadata: JSON.parse(row.metadata_json || '{}'),
    linear_analysis: (() => {
      const la = JSON.parse(row.linear_analysis_json || '{}');
      // Decompress large arrays
      if (la?.chroma_frames) la.chroma_frames = decompressData(la.chroma_frames);
      if (la?.mfcc_frames) la.mfcc_frames = decompressData(la.mfcc_frames);
      if (la?.events) la.events = decompressData(la.events);
      return la;
    })(),
    structural_map: JSON.parse(row.structural_map_json || '{}'),
    arrangement_flow: JSON.parse(row.arrangement_flow_json || '{}'),
    harmonic_context: JSON.parse(row.harmonic_context_json || '{}'),
    polyrhythmic_layers: JSON.parse(row.polyrhythmic_layers_json || '[]'),
    created_at: row.created_at,
  };
}

// Pagination support for large datasets
function getAnalysisLightweight(fileHash) {
  logger.debug('DB: Getting lightweight analysis for file_hash:', fileHash);
  const stmt = db.prepare(
    'SELECT id, file_path, file_hash, analysis_timestamp, metadata_json FROM AudioAnalysis WHERE file_hash = ?',
  );
  stmt.bind([fileHash]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  if (!row) return null;
  return {
    id: row.id,
    file_path: row.file_path,
    file_hash: row.file_hash,
    analysis_timestamp: row.analysis_timestamp,
    metadata: JSON.parse(row.metadata_json || '{}'),
  };
}

function getAnalysisChromaFrames(analysisId, offset = 0, limit = 1000) {
  const analysis = getAnalysisById(analysisId);
  if (!analysis?.linear_analysis?.chroma_frames) return [];
  return analysis.linear_analysis.chroma_frames.slice(offset, offset + limit);
}

function getAnalysisMfccFrames(analysisId, offset = 0, limit = 1000) {
  const analysis = getAnalysisById(analysisId);
  if (!analysis?.linear_analysis?.mfcc_frames) return [];
  return analysis.linear_analysis.mfcc_frames.slice(offset, offset + limit);
}

function getAnalysisEvents(analysisId, offset = 0, limit = 500) {
  const analysis = getAnalysisById(analysisId);
  if (!analysis?.linear_analysis?.events) return [];
  return analysis.linear_analysis.events.slice(offset, offset + limit);
}

function getMostRecentAnalysis() {
  logger.debug('DB: Getting most recent analysis');
  // AudioAnalysis table uses 'analysis_timestamp' rather than created_at
  const stmt = db.prepare(
    'SELECT * FROM AudioAnalysis ORDER BY COALESCE(analysis_timestamp, id) DESC LIMIT 1',
  );
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  if (!row) return null;
  return {
    id: row.id,
    file_path: row.file_path,
    file_hash: row.file_hash,
    metadata: JSON.parse(row.metadata_json || '{}'),
    linear_analysis: (() => {
      const la = JSON.parse(row.linear_analysis_json || '{}');
      // Decompress large arrays
      if (la?.chroma_frames) la.chroma_frames = decompressData(la.chroma_frames);
      if (la?.mfcc_frames) la.mfcc_frames = decompressData(la.mfcc_frames);
      if (la?.events) la.events = decompressData(la.events);
      return la;
    })(),
    structural_map: JSON.parse(row.structural_map_json || '{}'),
    arrangement_flow: JSON.parse(row.arrangement_flow_json || '{}'),
    harmonic_context: JSON.parse(row.harmonic_context_json || '{}'),
    polyrhythmic_layers: JSON.parse(row.polyrhythmic_layers_json || '[]'),
    created_at: row.analysis_timestamp || null,
  };
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

  const stmt = db.prepare(
    'SELECT id FROM UserSongs WHERE name = ? ORDER BY created_at DESC LIMIT 1',
  );
  const result = stmt.get([name]);
  stmt.free();

  if (
    result &&
    result.length > 0 &&
    result[0] &&
    result[0].values &&
    result[0].values.length > 0 &&
    result[0].values[0] &&
    result[0].values[0].length > 0
  ) {
    return result[0].values[0][0];
  }

  return null;
}

function saveProject(projectData) {
  const { uuid, title, artist, bpm, key_signature, audio_path, midi_path, metadata, status } =
    projectData;

  db.run(
    `INSERT INTO Projects (uuid, title, artist, bpm, key_signature, audio_path, midi_path, analysis_id, status, lyrics_json, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid,
      title || '',
      artist || '',
      bpm || null,
      key_signature || null,
      audio_path || null,
      midi_path || null,
      projectData.analysis_id || null,
      status || 'pending',
      projectData.lyrics_json || null,
      JSON.stringify(metadata || {}),
      new Date().toISOString(),
    ],
  );

  // Persist DB
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);

  const stmt = db.prepare('SELECT id FROM Projects WHERE uuid = ?');
  stmt.bind([uuid]);
  let id = null;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    id = row.id;
  }
  stmt.free();

  return id;
}

function getAllProjects() {
  const stmt = db.prepare('SELECT * FROM Projects ORDER BY created_at DESC');
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id,
      uuid: row.uuid,
      title: row.title,
      artist: row.artist,
      bpm: row.bpm,
      key_signature: row.key_signature,
      audio_path: row.audio_path,
      midi_path: row.midi_path,
      analysis_id: row.analysis_id,
      status: row.status,
      metadata: JSON.parse(row.metadata_json || '{}'),
      lyrics: row.lyrics_json ? JSON.parse(row.lyrics_json) : null,
      created_at: row.created_at,
    });
  }
  stmt.free();
  return results;
}

function getProjectById(projectId) {
  const stmt = db.prepare('SELECT * FROM Projects WHERE id = ?');
  stmt.bind([projectId]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  if (!row) return null;
  return {
    id: row.id,
    uuid: row.uuid,
    title: row.title,
    artist: row.artist,
    bpm: row.bpm,
    key_signature: row.key_signature,
    audio_path: row.audio_path,
    midi_path: row.midi_path,
    analysis_id: row.analysis_id,
    status: row.status,
    metadata: JSON.parse(row.metadata_json || '{}'),
    created_at: row.created_at,
    lyrics: row.lyrics_json ? JSON.parse(row.lyrics_json) : null,
  };
}

function deleteAnalysisById(analysisId) {
  try {
    db.run('DELETE FROM AnalysisSections WHERE analysis_id = ?', [analysisId]);
    db.run('DELETE FROM AudioAnalysis WHERE id = ?', [analysisId]);
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    return true;
  } catch (error) {
    logger.error('DB: Error deleting analysis ID', analysisId, error);
    return false;
  }
}

function updateAnalysisById(analysisId, updated) {
  try {
    const {
      linear_analysis,
      metadata,
      harmonic_context,
      structural_map,
      arrangement_flow,
      polyrhythmic_layers,
    } = updated;

    // Compress large arrays in linear_analysis
    const compressedLinearAnalysis = { ...linear_analysis };
    if (linear_analysis?.chroma_frames) {
      compressedLinearAnalysis.chroma_frames = compressData(linear_analysis.chroma_frames);
    }
    if (linear_analysis?.mfcc_frames) {
      compressedLinearAnalysis.mfcc_frames = compressData(linear_analysis.mfcc_frames);
    }
    if (linear_analysis?.events) {
      compressedLinearAnalysis.events = compressData(linear_analysis.events);
    }

    db.run(
      `UPDATE AudioAnalysis SET linear_analysis_json = ?, metadata_json = ?, harmonic_context_json = ?, structural_map_json = ?, arrangement_flow_json = ?, polyrhythmic_layers_json = ? WHERE id = ?`,
      [
        JSON.stringify(compressedLinearAnalysis || {}),
        JSON.stringify(metadata || {}),
        JSON.stringify(harmonic_context || {}),
        JSON.stringify(structural_map || {}),
        JSON.stringify(arrangement_flow || {}),
        JSON.stringify(polyrhythmic_layers || []),
        analysisId,
      ],
    );
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    return true;
  } catch (error) {
    logger.error('DB: Error updating analysis ID', analysisId, error);
    return false;
  }
}

function updateProjectAnalysisId(projectId, analysisId) {
  try {
    db.run('UPDATE Projects SET analysis_id = ? WHERE id = ?', [analysisId, projectId]);
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    return true;
  } catch (error) {
    logger.error('DB: Error updating project analysis id', error);
    return false;
  }
}

function updateProjectLyrics(projectId, lyricsJson) {
  try {
    logger.debug(
      'DB: updateProjectLyrics called for id:',
      projectId,
      'json length:',
      (lyricsJson || '').length,
    );
    db.run('UPDATE Projects SET lyrics_json = ? WHERE id = ?', [lyricsJson, projectId]);
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    return true;
  } catch (error) {
    logger.error('DB: Error updating project lyrics:', error);
    return false;
  }
}

function attachMidiToProject(projectId, midiPath) {
  db.run('UPDATE Projects SET midi_path = ? WHERE id = ?', [midiPath, projectId]);
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
  return true;
}

module.exports = {
  init,
  populateInitialData,
  getSettings,
  setSetting,
  getDb,
  saveAnalysis,
  getAnalysis,
  getMostRecentAnalysis,
  getAnalysisSections,
  saveUserSong,
  saveProject,
  getAllProjects,
  attachMidiToProject,
  getProjectById,
  deleteAnalysisById,
  updateProjectAnalysisId,
  updateProjectLyrics,
  updateAnalysisById,
  getAnalysisById,
  // New pagination and optimization functions
  getAnalysisLightweight,
  getAnalysisChromaFrames,
  getAnalysisMfccFrames,
  getAnalysisEvents,
};
