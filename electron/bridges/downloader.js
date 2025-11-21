const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

function spawnDownload(url, outdir = null) {
  return new Promise((resolve, reject) => {
    // quick check for ffmpeg presence
    const { spawnSync } = require('node:child_process');
    const check = spawnSync('ffmpeg', ['-version']);
    if (check.status !== 0) {
      return reject(
        new Error(
          'ffmpeg_not_found. Please install ffmpeg and ensure it is in PATH.',
        ),
      );
    }
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
      // Try to extract a JSON object anywhere inside the buffered string
      // This helps when yt-dlp emits progress lines that are mixed with the JSON output.
      const jsonMatch = buffer.match(/\{[\s\S]*\}\s*$/);
      if (jsonMatch && jsonMatch[0]) {
        const jsonStr = jsonMatch[0].trim();
        try {
          const msg = JSON.parse(jsonStr);
          if (msg.status === 'success' && msg.path) {
            return resolve(msg);
          }
          if (msg.status === 'error') {
            return reject(new Error(msg.message || 'Download failed'));
          }
        } catch (err) {
          console.debug('downloader: json parse error', err?.message || err);
        }
      }
      // Trim buffer to a reasonable size to avoid memory growth
      if (buffer.length > 1024 * 10) buffer = buffer.slice(-1024 * 5);
    });

    python.stderr.on('data', (d) => {
      errorBuf += d.toString();
    });

    python.on('close', (code) => {
      if (code !== 0) {
        return reject(
          new Error(`Python downloader exited with code ${code}: ${errorBuf}`),
        );
      }
      return reject(
        new Error('Python downloader exited without returning a path'),
      );
    });

    python.on('error', (err) =>
      reject(new Error(`Python spawn failed: ${err.message}`)),
    );
  });
}

module.exports = { spawnDownload };
