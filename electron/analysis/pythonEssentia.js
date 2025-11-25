// Simple Python bridge for Librosa-based analysis
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

/**
 * Check if Python is available and has required libraries
 */
async function checkPythonEssentia() {
  return new Promise((resolve) => {
    // Try python first (Windows), then python3 (Linux/macOS)
    const pythonCommands =
      process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];

    let attempts = 0;
    const tryNext = () => {
      if (attempts >= pythonCommands.length) {
        logger.warn('[PythonBridge] No Python found in PATH');
        resolve(false);
        return;
      }

      const pythonCmd = pythonCommands[attempts++];
      logger.debug(`[PythonBridge] Checking for ${pythonCmd}...`);

      const pythonProcess = spawn(pythonCmd, ['--version']);
      pythonProcess.on('error', () => {
        tryNext();
      });
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          // Python found, now check for librosa
          checkLibrosa(pythonCmd).then(resolve);
        } else {
          tryNext();
        }
      });
    };

    tryNext();
  });
}

/**
 * Check if librosa, numpy, and scipy are installed
 */
async function checkLibrosa(pythonCmd) {
  return new Promise((resolve) => {
    const checkProcess = spawn(pythonCmd, [
      '-c',
      'import librosa; import numpy; import scipy; print("OK")',
    ]);
    let output = '';

    checkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    checkProcess.on('error', () => {
      logger.warn(`[PythonBridge] Failed to spawn ${pythonCmd} for library check`);
      resolve(false);
    });

    checkProcess.on('close', (code) => {
      if (code === 0 && output.includes('OK')) {
        logger.info(
          `[PythonBridge] ✅ Python with librosa/numpy/scipy is available (${pythonCmd})`,
        );
        resolve(true);
      } else {
        logger.warn(`[PythonBridge] ❌ Python found but librosa/numpy/scipy not installed`);
        logger.warn(`[PythonBridge] Install with: pip install librosa numpy scipy`);
        resolve(false);
      }
    });
  });
}

/**
 * Analyze audio using the Python Librosa script
 * Robustly handles stream buffering and JSON parsing
 */
async function analyzeAudioWithPython(filePath, progressCallback = () => {}) {
  return new Promise((resolve, reject) => {
    const logger = require('./logger');
    logger.pass1(`[PythonBridge] Spawning analysis for: ${path.basename(filePath)}`);
    // Task 3: Consolidated - Use canonical name
    const scriptPath = path.join(__dirname, 'analyze_song.py');

    // Task 1: Connection Check - Verify which script is being used
    logger.pass1(`[PythonBridge] Targeted Script: ${scriptPath}`);
    logger.pass1(`[PythonBridge] Script exists: ${fs.existsSync(scriptPath)}`);

    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Python script not found at: ${scriptPath}`));
    }

    logger.debug(`[PythonBridge] Using canonical Python analyzer script: analyze_song.py`);

    // Determine which Python command to use
    // Try python first (Windows), then python3 (Linux/macOS)
    const pythonCommands =
      process.platform === 'win32' ? ['python', 'python3'] : ['python3', 'python'];
    let pythonCmd = 'python';

    // Quick check to find working Python command
    const checkPython = spawn(pythonCmd, ['--version']);
    checkPython.on('error', () => {
      pythonCmd = pythonCommands[1] || 'python3';
    });
    checkPython.on('close', (code) => {
      if (code !== 0) {
        pythonCmd = pythonCommands[1] || 'python3';
      }
    });

    logger.debug(`[PythonBridge] Using Python command: ${pythonCmd}`);

    // ✅ FIX: Add timeout and cleanup
    const TIMEOUT_MS = 300000; // 5 minutes
    let pythonProcess = null;
    let timeoutId = null;
    let outputBuffer = '';
    let errorString = '';
    let resultHandled = false;

    // ✅ Cleanup function to prevent zombie processes
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (pythonProcess && !pythonProcess.killed) {
        try {
          logger.debug('[PythonBridge] Killing python process...');
          pythonProcess.kill('SIGTERM');

          // Force kill after 5 seconds if still alive
          setTimeout(() => {
            if (pythonProcess && !pythonProcess.killed) {
              logger.warn('[PythonBridge] Force killing python process (SIGKILL)');
              pythonProcess.kill('SIGKILL');
            }
          }, 5000);
        } catch (e) {
          logger.warn('[PythonBridge] Failed to kill process:', e.message);
        }
      }

      // ✅ Remove all event listeners to prevent memory leaks
      if (pythonProcess) {
        try {
          pythonProcess.stdout?.removeAllListeners();
          pythonProcess.stderr?.removeAllListeners();
          pythonProcess.removeAllListeners();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };

    // '-u' forces unbuffered output so we get progress updates in real-time
    pythonProcess = spawn(pythonCmd, ['-u', scriptPath, filePath]);

    // ✅ Set timeout to prevent hanging forever
    timeoutId = setTimeout(() => {
      if (!resultHandled) {
        resultHandled = true;
        logger.error('[PythonBridge] Python analysis timeout (5 minutes)');
        cleanup();
        reject(new Error('Python analysis timeout (5 minutes)'));
      }
    }, TIMEOUT_MS);

    pythonProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
      let newlineIndex;
      while ((newlineIndex = outputBuffer.indexOf('\n')) !== -1) {
        const rawLine = outputBuffer.slice(0, newlineIndex);
        outputBuffer = outputBuffer.slice(newlineIndex + 1);
        const line = rawLine.trim();
        if (!line) continue;

        let parsedMsg = null;
        try {
          parsedMsg = JSON.parse(line);
          logger.pass1('[PYTHON]', parsedMsg);
        } catch (err) {
          parsedMsg = null;
          logger.debug('[PYTHON]', line);
        }

        if (!parsedMsg) {
          continue;
        }

        const msg = parsedMsg;
        if (msg.status === 'progress') {
          try {
            progressCallback(msg.value);
            if (msg.stage) {
              logger.debug(`[PythonBridge] Stage: ${msg.stage} (${msg.value}%)`);
            }
          } catch (e) {
            logger.warn('Progress callback error:', e.message);
          }
          continue;
        }
        if (msg.status === 'complete' && msg.path) {
            // file handoff
            try {
              const raw = fs.readFileSync(msg.path, 'utf8');
              const finalResult = JSON.parse(raw);
              fs.unlinkSync(msg.path);
              resultHandled = true;
              cleanup(); // ✅ Cleanup on success

              // Log what we got from Python
              const detectedKey = finalResult?.linear_analysis?.metadata?.detected_key;
              const detectedMode = finalResult?.linear_analysis?.metadata?.detected_mode;
              const timeSig = finalResult?.linear_analysis?.beat_grid?.time_signature;
              logger.pass1(
                `[PythonBridge] ✅ Analysis complete - Key: ${detectedKey || 'NOT SET'}, Mode: ${detectedMode || 'NOT SET'}, TimeSig: ${timeSig || 'NOT SET'}`,
              );

              return resolve({ ...finalResult, source: 'python_librosa' });
            } catch (err) {
              resultHandled = true;
              cleanup(); // ✅ Cleanup on error
              return reject(new Error(`Failed to read result file: ${err.message}`));
            }
          }
        if (msg.error) {
          resultHandled = true;
          cleanup(); // ✅ Cleanup on error
          return reject(new Error(msg.error));
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      chunk.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        logger.error('[PYTHON]', trimmed);
        if (!trimmed.includes('UserWarning') && !trimmed.includes('FutureWarning')) {
          errorString += `${trimmed}\n`;
        }
      });
    });

    pythonProcess.on('close', (code) => {
      if (!resultHandled) {
        resultHandled = true;
        cleanup(); // ✅ Cleanup on close
        if (code !== 0) {
          return reject(new Error(`Python analysis failed (Code ${code})`));
        }
        return reject(new Error('Python process finished but returned no data path.'));
      }
    });

    pythonProcess.on('error', (err) => {
      if (!resultHandled) {
        resultHandled = true;
        cleanup(); // ✅ Cleanup on error
        reject(new Error(`Python spawn failed: ${err.message}`));
      }
    });
  });
}

module.exports = { checkPythonEssentia, analyzeAudioWithPython };
