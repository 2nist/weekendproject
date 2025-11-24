/**
 * File Processor
 * Handles audio file loading and format conversion
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const logger = require('./logger');

// TODO: Integrate fluent-ffmpeg for format conversion
// For now, basic file handling

/**
 * Check if file exists and is readable
 */
function validateFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'File does not exist' };
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return { valid: false, error: 'Path is not a file' };
    }

    if (stats.size === 0) {
      return { valid: false, error: 'File is empty' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Calculate file hash for duplicate detection
 */
function calculateFileHash(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Get file info
 */
function getFileInfo(filePath) {
  const stats = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const hash = calculateFileHash(filePath);

  return {
    path: filePath,
    name: path.basename(filePath),
    size: stats.size,
    extension: ext,
    hash: hash,
    modified: stats.mtime,
  };
}

/**
 * Prepare audio file for analysis
 * Converts to WAV if needed and returns path
 */
async function prepareAudioFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  // If already WAV, return as-is
  if (ext === '.wav') {
    return filePath;
  }

  // Convert to WAV in temp directory
  const tempDir = os.tmpdir();
  const tempFileName = `temp_${Date.now()}.wav`;
  const tempPath = path.join(tempDir, tempFileName);

  try {
    await convertToWav(filePath, tempPath);
    return tempPath;
  } catch (error) {
    throw new Error(
      `Failed to convert audio file: ${error.message}. Please provide WAV files or install ffmpeg.`,
    );
  }
}

/**
 * Clean up temporary files
 */
function cleanupTempFile(filePath) {
  try {
    if (filePath && filePath.includes('temp_') && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    logger.warn('Failed to cleanup temp file:', error);
  }
}

/**
 * Check if file format is supported
 */
function isSupportedFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const supported = ['.wav', '.mp3', '.flac', '.m4a', '.ogg'];
  return supported.includes(ext);
}

/**
 * Convert audio file to WAV (if needed)
 * Uses fluent-ffmpeg for format conversion
 */
async function convertToWav(inputPath, outputPath) {
  const ext = path.extname(inputPath).toLowerCase();

  // If already WAV, just copy
  if (ext === '.wav') {
    fs.copyFileSync(inputPath, outputPath);
    return outputPath;
  }

  // Use ffmpeg to convert
  try {
    const ffmpeg = require('fluent-ffmpeg');
    const ffmpegPath = require('ffmpeg-static');

    if (ffmpegPath) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioCodec('pcm_s16le')
        .audioFrequency(44100)
        .audioChannels(1) // Mono
        .format('wav')
        .on('end', () => {
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`FFmpeg conversion failed: ${err.message}`));
        })
        .save(outputPath);
    });
  } catch (error) {
    // If ffmpeg not available, throw helpful error
    throw new Error(
      'FFmpeg not available. Please install ffmpeg or provide WAV files directly. ' + error.message,
    );
  }
}

module.exports = {
  validateFile,
  getFileInfo,
  calculateFileHash,
  isSupportedFormat,
  convertToWav,
  prepareAudioFile,
  cleanupTempFile,
};
