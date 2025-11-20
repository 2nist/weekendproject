const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function spawnDownload(url, outdir = null) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'analysis', 'download.py');
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Python script not found at: ${scriptPath}`));
    }

    const args = ['-u', scriptPath, url];
    if (outdir) args.push('--outdir', outdir);
    const python = spawn('python', args);
    let buffer = '';
    let errorBuf = '';

    python.stdout.on('data', (data) => {
      buffer += data.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.status === 'success' && msg.path) {
            return resolve(msg);
          }
          if (msg.status === 'error') {
            return reject(new Error(msg.message || 'Download failed'));
          }
        } catch (err) {
          // Ignore non-JSON lines
          console.debug('downloader: non-json stdout', err?.message || err);
        }
      }
    });

    python.stderr.on('data', (d) => {
      errorBuf += d.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python downloader exited with code ${code}: ${errorBuf}`));
      }
      return reject(new Error('Python downloader exited without returning a path'));
    });

    python.on('error', (err) => reject(new Error(`Python spawn failed: ${err.message}`)));
  });
}

module.exports = { spawnDownload };
