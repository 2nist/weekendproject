const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

/**
 * Spawn a Python yt-dlp wrapper script and emit progress callbacks.
 * @param {string} url - The YouTube (or supported) URL.
 * @param {string|null} outdir - Optional output directory.
 * @param {(progress: {percent?: number, downloaded?: string, speed?: string, eta?: string, status: string})=>void} onProgress
 */
function spawnDownload(url, outdir = null, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    // ffmpeg presence check (required for audio extraction)
    const check = spawnSync('ffmpeg', ['-version']);
    if (check.status !== 0) {
      return reject(new Error('ffmpeg_not_found. Install ffmpeg / ensure PATH.'));
    }
    const scriptPath = path.join(__dirname, '..', 'analysis', 'download.py');
    if (!fs.existsSync(scriptPath)) {
      return reject(new Error(`Python script not found at: ${scriptPath}`));
    }

    // Use unbuffered stdout (-u) so progress lines flush immediately
    const args = ['-u', scriptPath, url];
    if (outdir) args.push('--outdir', outdir);

    const python = spawn('python', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let buffer = '';
    let errorBuf = '';

    const progressRegex = /\[download\]\s+(\d{1,3}\.\d+)%\s+of\s+([0-9A-Za-z\.]+)\s+at\s+([0-9A-Za-z\.]+)\s+ETA\s+([0-9:]+)/;

    python.stdout.on('data', (data) => {
      const text = data.toString();
      buffer += text;

      // Parse progress lines from yt-dlp (if the Python wrapper passes them through)
      const lines = text.split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        const m = line.match(progressRegex);
        if (m) {
          const percent = parseFloat(m[1]);
          onProgress({
            percent,
            downloaded: m[2],
            speed: m[3],
            eta: m[4],
            status: 'downloading',
          });
        } else if (line.toLowerCase().includes('merging formats')) {
          onProgress({ status: 'merging' });
        } else if (line.toLowerCase().includes('extracting audio')) {
          onProgress({ status: 'extracting' });
        }
      }

      // Attempt to detect JSON status blob at end of buffer
      const jsonMatch = buffer.match(/\{[\s\S]*\}\s*$/);
      if (jsonMatch && jsonMatch[0]) {
        const jsonStr = jsonMatch[0].trim();
        try {
          const msg = JSON.parse(jsonStr);
          if (msg.status === 'success' && msg.path) {
            onProgress({ status: 'completed', path: msg.path });
            return resolve(msg);
          }
          if (msg.status === 'error') {
            onProgress({ status: 'error' });
            return reject(new Error(msg.message || 'Download failed'));
          }
        } catch (err) {
          // Ignore parse errors (progress lines may append partial JSON)
        }
      }
      if (buffer.length > 1024 * 24) buffer = buffer.slice(-1024 * 12);
    });

    python.stderr.on('data', (d) => {
      const text = d.toString();
      errorBuf += text;
      // forward some stderr hints as status lines if useful
      if (/ERROR/i.test(text)) {
        onProgress({ status: 'warning', message: text.slice(0, 200) });
      }
    });

    python.on('close', (code) => {
      if (code !== 0) {
        onProgress({ status: 'error' });
        return reject(new Error(`downloader exit ${code}: ${errorBuf}`));
      }
      return reject(new Error('Downloader exited without success JSON.'));
    });
    python.on('error', (err) => {
      onProgress({ status: 'error' });
      reject(new Error(`Python spawn failed: ${err.message}`));
    });

    onProgress({ status: 'started' });
  });
}

module.exports = { spawnDownload };
