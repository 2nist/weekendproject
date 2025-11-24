const fs = require('fs');
const path = require('path');

function normalizeWindowsPath(filePath) {
  if (process.platform !== 'win32') return filePath;
  let normalized = filePath.replace(/^\/+/, '');
  if (/^[A-Za-z]\//.test(normalized)) {
    normalized = normalized[0] + ':/' + normalized.slice(2);
  }
  return normalized;
}

function getMimeType(ext) {
  const mimeTypes = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    flac: 'audio/flac',
    webm: 'audio/webm',
  };
  return mimeTypes[ext.toLowerCase()] || 'application/octet-stream';
}

function createStreamResponse(filePath, requestHeaders = {}) {
  filePath = normalizeWindowsPath(filePath);
  if (!fs.existsSync(filePath)) throw new Error('File not found');
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const contentType = getMimeType(ext);

  const rangeHeader = requestHeaders.Range || requestHeaders.range || null;
  if (rangeHeader) {
    const matches = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
    if (matches) {
      const start = Number(matches[1]);
      const end = matches[2] ? Number(matches[2]) : total - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });
      return {
        statusCode: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunkSize),
        },
        stream,
      };
    }
  }

  const stream = fs.createReadStream(filePath);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
    },
    stream,
  };
}

module.exports = { normalizeWindowsPath, getMimeType, createStreamResponse };
