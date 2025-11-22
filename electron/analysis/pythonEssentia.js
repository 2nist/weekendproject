// Simple Python bridge for Librosa-based analysis
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Check if Python is available
 */
async function checkPythonEssentia() {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python', ['--version']);
    pythonProcess.on('error', () => resolve(false));
    pythonProcess.on('close', (code) => resolve(code === 0));
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
    // Use canonical analyze_song.py (formerly analyze_song_hpss.py)
    const scriptPath = path.join(__dirname, 'analyze_song.py');
    logger.debug(`[PythonBridge] Using Python analyzer script: analyze_song.py`);
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Python script not found at: ${scriptPath}`));
    }

    // '-u' forces unbuffered output so we get progress updates in real-time
    const pythonProcess = spawn('python', ['-u', scriptPath, filePath]);
    let outputBuffer = '';
    let errorString = '';
    let resultHandled = false;

    pythonProcess.stdout.on('data', (data) => {
      outputBuffer += data.toString();
      let newlineIndex;
      while ((newlineIndex = outputBuffer.indexOf('\n')) !== -1) {
        const line = outputBuffer.slice(0, newlineIndex).trim();
        outputBuffer = outputBuffer.slice(newlineIndex + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.status === 'progress') {
            try {
              progressCallback(msg.value);
            } catch (e) {
              console.warn('Progress callback error:', e.message);
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
              return resolve({ ...finalResult, source: 'python_librosa' });
            } catch (err) {
              return reject(
                new Error(`Failed to read result file: ${err.message}`),
              );
            }
          }
          if (msg.error) {
            return reject(new Error(msg.error));
          }
        } catch (err) {
          // ignore partial/non-JSON lines
          console.debug(
            'pythonEssentia: non-json stdout line',
            err?.message || err,
          );
        }
      }
    });

    pythonProcess.stderr.on('data', (data) => {
      const msg = data.toString();
      if (!msg.includes('UserWarning') && !msg.includes('FutureWarning')) {
        console.error(`[Python stderr]: ${msg}`);
        errorString += msg;
      }
    });

    pythonProcess.on('close', (code) => {
      if (!resultHandled) {
        if (code !== 0) {
          return reject(new Error(`Python analysis failed (Code ${code})`));
        }
        return reject(
          new Error('Python process finished but returned no data path.'),
        );
      }
    });

    pythonProcess.on('error', (err) =>
      reject(new Error(`Python spawn failed: ${err.message}`)),
    );
  });
}

module.exports = { checkPythonEssentia, analyzeAudioWithPython };
