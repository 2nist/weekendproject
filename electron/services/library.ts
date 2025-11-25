import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
const db = require('../db');
const { app } = require('electron');
const logger = require('../analysis/logger');

type ImportPayload = {
  audioPath?: string;
  midiPath?: string;
  lyricsPath?: string;
  title?: string;
  artist?: string;
  bpm?: number;
  key?: string;
  metadata?: Record<string, any>;
};

function ensureDirs(userDataPath: string) {
  const libDir = path.join(userDataPath, 'library');
  const audioDir = path.join(libDir, 'audio');
  const midiDir = path.join(libDir, 'midi');
  const lyricsDir = path.join(libDir, 'lyrics');
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
  if (!fs.existsSync(midiDir)) fs.mkdirSync(midiDir, { recursive: true });
  if (!fs.existsSync(lyricsDir)) fs.mkdirSync(lyricsDir, { recursive: true });
  return { libDir, audioDir, midiDir, lyricsDir };
}

function copyFileToLibrary(
  userDataPath: string,
  srcPath: string,
  destSubDir: 'audio' | 'midi' | 'lyrics',
  uuid: string,
) {
  const { audioDir, midiDir, lyricsDir } = ensureDirs(userDataPath);
  const ext = path.extname(srcPath);
  const baseName = path.basename(srcPath);
  let destDir: string;
  if (destSubDir === 'audio') {
    destDir = audioDir;
  } else if (destSubDir === 'midi') {
    destDir = midiDir;
  } else {
    destDir = lyricsDir;
  }
  const destFilename = `${uuid}-${Date.now()}-${baseName}`;
  const destPath = path.join(destDir, destFilename);

  // Ensure source file exists
  if (!fs.existsSync(srcPath)) {
    throw new Error(`Source file not found: ${srcPath}`);
  }

  fs.copyFileSync(srcPath, destPath);
  logger.info(`[Library] Copied ${destSubDir} file: ${srcPath} -> ${destPath}`);
  return destPath;
}

/**
 * Export analysis data to Isophonics .lab format
 * Format: "Start End Label" (space-separated, one per line)
 */
function exportToLabFormat(segments: Array<{ start: number; end: number; label: string }>): string {
  return segments
    .map((seg) => `${seg.start.toFixed(3)} ${seg.end.toFixed(3)} ${seg.label}`)
    .join('\n');
}

/**
 * Convert structural_map sections to .lab format
 */
function convertSectionsToLab(structuralMap: any): string {
  if (!structuralMap?.sections || !Array.isArray(structuralMap.sections)) {
    return '';
  }

  const segments = structuralMap.sections
    .filter(
      (s: any) => s.time_range?.start_time !== undefined && s.time_range?.end_time !== undefined,
    )
    .map((s: any) => ({
      start: s.time_range.start_time,
      end: s.time_range.end_time,
      label: s.section_label || s.label || 'unknown',
    }))
    .sort((a, b) => a.start - b.start);

  return exportToLabFormat(segments);
}

/**
 * Convert chord events to .lab format
 */
function convertChordsToLab(linearAnalysis: any): string {
  if (!linearAnalysis?.events || !Array.isArray(linearAnalysis.events)) {
    return '';
  }

  // Filter chord events and sort by timestamp
  const chordEvents = linearAnalysis.events
    .filter((e: any) => {
      const isChord =
        e.event_type === 'chord' || e.event_type === 'chord_candidate' || e._chord_label || e.chord;
      return isChord && e.timestamp !== undefined;
    })
    .map((e: any) => {
      const chordLabel = e._chord_label || e.chord || e.roman_numeral || 'N';
      // Normalize chord label (remove spaces, convert to standard format)
      const normalized = chordLabel.replace(/\s+/g, '').toUpperCase();
      return {
        timestamp: e.timestamp,
        label: normalized,
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  if (chordEvents.length === 0) {
    return '';
  }

  // Convert to segments (each chord lasts until the next one)
  const segments: Array<{ start: number; end: number; label: string }> = [];
  const duration =
    linearAnalysis.metadata?.duration_seconds ||
    (chordEvents.length > 0 ? chordEvents[chordEvents.length - 1].timestamp + 1 : 0);

  for (let i = 0; i < chordEvents.length; i++) {
    const current = chordEvents[i];
    const next = chordEvents[i + 1];
    segments.push({
      start: current.timestamp,
      end: next ? next.timestamp : duration,
      label: current.label,
    });
  }

  return exportToLabFormat(segments);
}

/**
 * Promote a project's corrected analysis to calibration benchmark
 * Exports .lab files and copies audio to test/user/ folder
 */
export async function promoteToBenchmark(
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const database = db.getDb();
    if (!database) {
      throw new Error('Database not initialized');
    }

    // Get project from DB
    const projectStmt = database.prepare('SELECT * FROM Projects WHERE id = ?');
    const project = projectStmt.get(projectId);
    projectStmt.free();

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Get analysis for this project
    const analysisId = project.analysis_id;
    if (!analysisId) {
      throw new Error('Project has no analysis');
    }

    const analysis = db.getAnalysisById(analysisId);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    // Ensure user test directory exists
    // Use __dirname to find the electron directory, then navigate to test/user
    const electronDir = path.resolve(__dirname, '..');
    const testUserDir = path.join(electronDir, 'analysis', 'test', 'user');

    if (!fs.existsSync(testUserDir)) {
      fs.mkdirSync(testUserDir, { recursive: true });
    }

    const testDir = testUserDir;

    // Generate safe filename from project title
    const safeTitle = (project.title || 'untitled')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase()
      .substring(0, 50);
    const timestamp = Date.now();
    const baseName = `${safeTitle}_${timestamp}`;

    // Copy audio file
    if (!analysis.file_path || !fs.existsSync(analysis.file_path)) {
      throw new Error('Audio file not found');
    }

    const audioExt = path.extname(analysis.file_path);
    const audioDest = path.join(testDir, `${baseName}${audioExt}`);
    fs.copyFileSync(analysis.file_path, audioDest);

    // Export sections to .lab
    const sectionsLab = convertSectionsToLab(analysis.structural_map);
    const sectionsLabPath = path.join(testDir, `${baseName}.lab`);
    fs.writeFileSync(sectionsLabPath, sectionsLab, 'utf8');

    // Export chords to .lab
    const chordsLab = convertChordsToLab(analysis.linear_analysis);
    const chordsLabPath = path.join(testDir, `${baseName}_chord.lab`);
    fs.writeFileSync(chordsLabPath, chordsLab, 'utf8');

    // Store metadata in a JSON file for reference
    const metadata = {
      projectId,
      projectTitle: project.title,
      exportedAt: new Date().toISOString(),
      audioPath: audioDest,
      sectionLabPath: sectionsLabPath,
      chordLabPath: chordsLabPath,
      referenceKey:
        analysis.harmonic_context?.global_key?.primary_key ||
        analysis.linear_analysis?.metadata?.detected_key ||
        'unknown',
    };
    const metadataPath = path.join(testDir, `${baseName}_metadata.json`);
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    return {
      success: true,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('[promoteToBenchmark] Error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

export async function importSong(userDataPath: string, payload: ImportPayload) {
  const uuid = randomUUID();
  const title = payload.title || path.basename(payload.audioPath || payload.midiPath || 'untitled');
  const artist = payload.artist || '';
  const bpm = payload.bpm || null;
  const key_signature = payload.key || null;
  const metadata = payload.metadata || {};
  const status = 'imported';

  let audio_path: string | null = null;
  let midi_path: string | null = null;
  let lyrics_path: string | null = null;
  try {
    if (payload.audioPath) {
      logger.info(`[importSong] Copying audio file: ${payload.audioPath}`);
      audio_path = copyFileToLibrary(userDataPath, payload.audioPath, 'audio', uuid);
      logger.debug(`[importSong] Audio file copied to: ${audio_path}`);
    }
    if (payload.midiPath) {
      logger.info(`[importSong] Copying MIDI file: ${payload.midiPath}`);
      midi_path = copyFileToLibrary(userDataPath, payload.midiPath, 'midi', uuid);
      logger.debug(`[importSong] MIDI file copied to: ${midi_path}`);
    }
    if (payload.lyricsPath) {
      // Lyrics path is already copied in batch import, just store it
      lyrics_path = payload.lyricsPath;
    }

    // Store lyrics path in metadata if provided
    if (lyrics_path) {
      metadata.lyrics_path = lyrics_path;
    }

    const id = db.saveProject({
      uuid,
      title,
      artist,
      bpm,
      key_signature,
      audio_path,
      midi_path,
      metadata,
      status,
    });
    // After importing the project, try to automatically fetch lyrics and persist to the project
    try {
      const lyricsService = require('./lyrics');
      if (lyricsService && typeof lyricsService.fetchLyrics === 'function') {
        const duration = (metadata && metadata.duration_seconds) || null;
        const lyricsRes = await lyricsService.fetchLyrics(
          artist,
          title,
          metadata.album || null,
          duration,
        );
        if (lyricsRes) {
          try {
            const dbInstance = require('../db');
            dbInstance.updateProjectLyrics(id, JSON.stringify(lyricsRes));
            logger.info('[Library] Persisted fetched lyrics for project id', id);
          } catch (err) {
            logger.warn('[Library] Failed to persist lyrics to DB:', err?.message || err);
          }
        }
      }
    } catch (err) {
      logger.warn('[Library] Lyrics fetch failed:', err?.message || err);
      // This is non-fatal; continue
    }
    return {
      success: true,
      id,
      uuid,
      title,
      audio_path,
      midi_path,
      created_at: new Date().toISOString(),
    };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
}

export function saveAnalysisForProject(projectId: number, linearAnalysis: any, app?: any) {
  // Save analysis JSON into analysis cache and attach analysis to project
  try {
    // Save the analysis using db.saveAnalysis, which returns an ID
    const metadata = linearAnalysis?.metadata || {};
    const file_hash = `midi-${Date.now()}-${projectId}`;
    const analysisId = db.saveAnalysis({
      file_path: null,
      file_hash,
      metadata,
      linear_analysis: linearAnalysis,
      structural_map: { sections: [] },
      arrangement_flow: {},
      harmonic_context: {},
      polyrhythmic_layers: [],
    });
    if (analysisId) {
      try {
        const database = db.getDb();
        if (database && typeof database.run === 'function') {
          database.run('UPDATE Projects SET analysis_id = ? WHERE id = ?', [analysisId, projectId]);
        }
      } catch (e) {
        // ignore update error
      }
    }
    return { success: true, analysisId };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

export async function parseMidiAndSaveForProject(projectId: number, midiPath: string) {
  try {
    // Dynamically require the parser so it uses TS version in dev when loaded
    let parser: any = null;
    try {
      try {
        require('ts-node').register({ transpileOnly: true });
      } catch (e) {}
      const mp = require('../analysis/midiParser.ts');
      parser = mp && mp.default ? mp.default : mp;
    } catch (err) {
      const mp2 = require('../analysis/midiParser');
      parser = mp2 && mp2.default ? mp2.default : mp2;
    }
    if (!parser) throw new Error('MIDI parser not available');
    const linear = await parser.parseMidiFileToLinear(midiPath);
    const saveRes = saveAnalysisForProject(projectId, linear);
    return {
      success: saveRes.success,
      analysisId: (saveRes as any).analysisId || null,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export function getLibrary(): any[] {
  return db.getAllProjects();
}

export function attachMidi(projectId: number, midiPath: string) {
  try {
    db.attachMidiToProject(projectId, midiPath);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

// Alias for compatibility with main.js
export function createProject(userDataPath: string, payload: ImportPayload) {
  return importSong(userDataPath, payload);
}

// Alias for compatibility with main.js
export function getAllProjects() {
  return getLibrary();
}

export { copyFileToLibrary };

export default {
  importSong,
  createProject,
  getAllProjects,
  saveAnalysisForProject,
  getLibrary,
  attachMidi,
  parseMidiAndSaveForProject,
  promoteToBenchmark,
  copyFileToLibrary,
};
