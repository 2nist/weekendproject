const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');
const logger = require('../analysis/logger');
const { getInstance: getPathConfig } = require('./pathConfig');

function copyFileToLibrary(userDataPath, srcPath, destSubDir, metadata) {
  const pathConfig = getPathConfig();
  const ext = path.extname(srcPath);

  // Get/construct appropriate directory based on file type; prefer explicit userDataPath when passed
  let destDir;
  if (userDataPath) {
    const userLib = path.join(userDataPath, 'library');
    const localDir = path.join(userLib, destSubDir);
    if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
    destDir = localDir;
  } else {
    destDir = pathConfig.getPath(destSubDir);
  }

  // Generate organized filename, falling back to pathConfig helper when available
  let destFilename;
  try {
    if (pathConfig && typeof pathConfig.generateFilename === 'function') {
      destFilename = pathConfig.generateFilename(
        { ...metadata, uuid: metadata.uuid || randomUUID() },
        ext,
      );
    } else {
      destFilename = `${metadata.uuid || randomUUID()}-${Date.now()}-${path.basename(srcPath)}`;
    }
  } catch (err) {
    destFilename = `${metadata.uuid || randomUUID()}-${Date.now()}-${path.basename(srcPath)}`;
  }
  const destPath = path.join(destDir, destFilename);

  // Copy to primary location
  fs.copyFileSync(srcPath, destPath);

  // Optionally backup to cloud
  pathConfig.backupToCloud(destPath, destSubDir).catch((err) => {
    logger.warn(`[Library] Cloud backup failed for ${destFilename}:`, err);
  });

  return destPath;
}

/**
 * Create a new project and copy files into the userData library folder.
 * @param {string} userDataPath
 * @param {object} payload
 */
async function createProject(userDataPath, payload) {
  const uuid = randomUUID();
  const title = payload.title || path.basename(payload.audioPath || payload.midiPath || 'untitled');
  const artist = payload.artist || '';
  const bpm = payload.bpm || null;
  const key_signature = payload.key || null;
  const metadata = payload.metadata || {};
  const status = 'imported';

  let audio_path = null;
  let midi_path = null;
  try {
    const fileMetadata = {
      uuid,
      title,
      artist,
      projectId: null, // Will be set after DB insert
    };

    if (payload.audioPath) {
      audio_path = copyFileToLibrary(userDataPath, payload.audioPath, 'audio', fileMetadata);
    }

    if (payload.midiPath) {
      midi_path = copyFileToLibrary(userDataPath, payload.midiPath, 'midi', fileMetadata);
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

    // After creating project, try to fetch lyrics (non-fatal) & persist
    try {
      const lyrics = require('./lyrics');
      if (lyrics && typeof lyrics.fetchLyrics === 'function') {
        const duration = (metadata && metadata.duration_seconds) || null;
        const lr = await lyrics.fetchLyrics(artist, title, metadata.album || null, duration);
        if (lr && id) {
          const success = db.updateProjectLyrics(id, JSON.stringify(lr));
          if (!success) {
            logger.warn('[Library] updateProjectLyrics returned false for id', id);
          } else {
            logger.info('[Library] updateProjectLyrics saved lyrics for project id', id);
          }
        }
      }
    } catch (err) {
      logger.warn('[Library] failed to auto-fetch lyrics:', err?.message || err);
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
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getAllProjects() {
  return db.getAllProjects();
}

function attachMidi(projectId, midiPath) {
  try {
    db.attachMidiToProject(projectId, midiPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  createProject,
  getAllProjects,
  attachMidi,
};
