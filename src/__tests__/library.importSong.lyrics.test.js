import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';

const db = require('../../electron/db');
const libModule = require('../../electron/services/library');
const library = libModule.default || libModule;
const importSongFunc =
  library.importSong ||
  library.createProject ||
  (library.default && library.default.importSong) ||
  (library.default && library.default.createProject);

const userDataPath = path.join(os.tmpdir(), `prog-lib-test-${Date.now()}`);
describe('Library importSong lyric persistence', () => {
  beforeEach(async () => {
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });
    await db.init({ getPath: () => userDataPath });
  });

  it('auto-fetches lyrics and persists them to project', async () => {
    // use the same userDataPath from beforeEach
    // Create a fake audio file
    const audioFile = path.join(os.tmpdir(), `fake-audio-${Date.now()}.mp3`);
    fs.writeFileSync(audioFile, 'FAKE');

    // Create a mock lyrics module in require cache so importSong uses it
    const lyricsPath = require.resolve('../../electron/services/lyrics');
    const mockLyrics = {
      fetchLyrics: async (artist, title, album, duration) => ({ plain: 'fake-line-1', synced: '' }),
      parseLRC: (s) => [],
    };
    // Insert into require cache directly
    require.cache[lyricsPath] = {
      id: lyricsPath,
      filename: lyricsPath,
      loaded: true,
      exports: mockLyrics,
    };

    const payload = { audioPath: audioFile, title: 'TestSong', artist: 'TestArtist' };
    console.log('importSongFunc type:', typeof importSongFunc, 'name:', importSongFunc.name);
    console.log('userDataPath:', userDataPath);
    const res = await importSongFunc(userDataPath, payload);
    if (!res.success) {
      console.error('importSong returned error:', res.error || res);
      if (res && res.error && res.stack) console.error(res.stack);
    }
    console.log('importSong res:', res);
    expect(res.success).toBeTruthy();
    const projectId = res.id;
    expect(projectId).toBeTruthy();

    const proj = db.getProjectById(projectId);
    expect(proj).toBeTruthy();
    // Must have lyrics persisted as parsed JSON
    expect(proj.lyrics).toBeTruthy();
    expect(proj.lyrics.plain).toBe('fake-line-1');
  });
});
