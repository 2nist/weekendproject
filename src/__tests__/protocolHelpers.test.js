import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect } from 'vitest';
import helpers from '../../electron/protocolHelpers';
const { normalizeWindowsPath, getMimeType, createStreamResponse } = helpers;

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

describe('protocolHelpers', () => {
  it('normalizeWindowsPath should insert colon for windows drive prefix', () => {
    const input = 'C/Users/test/file.mp3';
    const out = normalizeWindowsPath(input);
    if (process.platform === 'win32') {
      expect(out).toBe('C:/Users/test/file.mp3');
    } else {
      // On non-windows, it should return the original
      expect(out).toBe(input);
    }
  });

  it('getMimeType should return expected mime types', () => {
    expect(getMimeType('mp3')).toBe('audio/mpeg');
    expect(getMimeType('wav')).toBe('audio/wav');
    expect(getMimeType('ogg')).toBe('audio/ogg');
    expect(getMimeType('unknown')).toBe('application/octet-stream');
  });

  it('createStreamResponse should return full content (200)', async () => {
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `protocol-test-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'hello');

    const res = createStreamResponse(tmpFile, {});

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Length']).toBe('5');
    const text = await streamToString(res.stream);
    expect(text).toBe('hello');

    fs.unlinkSync(tmpFile);
  });

  it('createStreamResponse should support range requests (206)', async () => {
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `protocol-test-${Date.now()}-range.txt`);
    fs.writeFileSync(tmpFile, 'hello');

    const res = createStreamResponse(tmpFile, { Range: 'bytes=1-3' });
    expect(res.statusCode).toBe(206);
    expect(res.headers['Content-Length']).toBe('3');
    expect(res.headers['Accept-Ranges']).toBe('bytes');
    const text = await streamToString(res.stream);
    expect(text).toBe('ell');

    fs.unlinkSync(tmpFile);
  });
});
