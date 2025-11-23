const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');
const { getInstance: getPathConfig } = require('./pathConfig');

function copyFileToLibrary(userDataPath, srcPath, destSubDir, metadata) {
  const pathConfig = getPathConfig();
  const ext = path.extname(srcPath);
  
  // Get the appropriate directory based on file type
  const destDir = pathConfig.getPath(destSubDir);
  
  // Generate organized filename
  const destFilename = pathConfig.generateFilename(
    { ...metadata, uuid: metadata.uuid || randomUUID() },
    ext
  );
  const destPath = path.join(destDir, destFilename);

  // Copy to primary location
  fs.copyFileSync(srcPath, destPath);
  
  // Optionally backup to cloud
  pathConfig.backupToCloud(destPath, destSubDir).catch(err => {
    console.warn(`[Library] Cloud backup failed for ${destFilename}:`, err);
  });

  return destPath;
}

/**
 * Create a new project and copy files into the userData library folder.
 * @param {string} userDataPath
 * @param {object} payload
 */
function createProject(userDataPath, payload) {
  const uuid = randomUUID();
  const title =
    payload.title ||
    path.basename(payload.audioPath || payload.midiPath || 'untitled');
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
      audio_path = copyFileToLibrary(
        userDataPath,
        payload.audioPath,
        'audio',
        fileMetadata,
      );
    }

    if (payload.midiPath) {
      midi_path = copyFileToLibrary(
        userDataPath,
        payload.midiPath,
        'midi',
        fileMetadata,
      );
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
