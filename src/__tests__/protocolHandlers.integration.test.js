import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect } from 'vitest';
import helpers from '../../electron/protocolHelpers';
const { createStreamResponse } = helpers;

function fetchWithRange(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers,
    };

    const req = http.request(options, (res) => {
      const data = [];
      res.on('data', (chunk) => data.push(Buffer.from(chunk)));
      res.on('end', () => {
        resolve({ res, body: Buffer.concat(data) });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('protocolHandlers integration', () => {
  it('serves full and ranged requests via createStreamResponse through HTTP server', async () => {
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, `protocol-integ-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'HelloIntegration');

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const filePath = url.searchParams.get('path');
      try {
        const streamRes = createStreamResponse(filePath, req.headers);
        res.writeHead(streamRes.statusCode, streamRes.headers);
        streamRes.stream.pipe(res);
      } catch (e) {
        res.writeHead(404);
        res.end('not found');
      }
    });

    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}/media?path=${encodeURIComponent(tmpFile)}`;

    // Full request
    const full = await fetchWithRange(baseUrl, {});
    expect(full.res.statusCode).toBe(200);
    expect(full.res.headers['content-length']).toBe(String('HelloIntegration'.length));
    expect(full.body.toString()).toBe('HelloIntegration');

    // Range request
    const ranged = await fetchWithRange(baseUrl, { Range: 'bytes=2-5' });
    expect(ranged.res.statusCode).toBe(206);
    expect(ranged.res.headers['accept-ranges']).toBe('bytes');
    expect(ranged.body.toString()).toBe('lloI');

    server.close();
    fs.unlinkSync(tmpFile);
  });
});
