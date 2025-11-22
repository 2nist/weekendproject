const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const db = require('../db');

function ensureDirs(userDataPath) {
  const libDir = path.join(userDataPath, 'library');
  const audioDir = path.join(libDir, 'audio');
  const midiDir = path.join(libDir, 'midi');
  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir);
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);
  if (!fs.existsSync(midiDir)) fs.mkdirSync(midiDir);
  return { libDir, audioDir, midiDir };
}

function copyFileToLibrary(userDataPath, srcPath, destSubDir, uuid) {
  const { audioDir, midiDir } = ensureDirs(userDataPath);
  const ext = path.extname(srcPath);
  const baseName = path.basename(srcPath);
  const destDir = destSubDir === 'audio' ? audioDir : midiDir;
  const destFilename = `${uuid}-${baseName}`;
  const destPath = path.join(destDir, destFilename);

  fs.copyFileSync(srcPath, destPath);
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
    if (payload.audioPath) {
      audio_path = copyFileToLibrary(
        userDataPath,
        payload.audioPath,
        'audio',
        uuid,
      );
    }

    if (payload.midiPath) {
      midi_path = copyFileToLibrary(
        userDataPath,
        payload.midiPath,
        'midi',
        uuid,
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
