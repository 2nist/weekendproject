const electron = require('electron');
const path = require('path');
const db = require('./db');
const midiListener = require('./midiListener');
const trackResolver = require('./trackResolver');
const oscBuilder = require('./oscBuilder');
const osc = require('node-osc');

// Analysis modules
const metadataLookup = require('./analysis/metadataLookup');
const sessionManager = require('./analysis/sessionManager');
const listener = require('./analysis/listener');
const architect = require('./analysis/architect_clean');
const theorist = require('./analysis/theorist');
const fileProcessor = require('./analysis/fileProcessor');
const progressTracker = require('./analysis/progressTracker');
const genreProfiles = require('./analysis/genreProfiles');
const structureGenerator = require('./analysis/structureGenerator');
// Midi parser
let midiParser = null;
try {
  // Prefer TS version in dev
  try {
    require('ts-node').register({ transpileOnly: true });
  } catch (e) {}
  const mpTS = require('./analysis/midiParser.ts');
  midiParser = mpTS && mpTS.default ? mpTS.default : mpTS;
} catch (err) {
  const mpJS = require('./analysis/midiParser');
  midiParser = mpJS && mpJS.default ? mpJS.default : mpJS;
}
// Downloader bridge
const downloaderBridge = require('./bridges/downloader');
// Library service: prefer TS in dev
let libraryService = null;
try {
  try {
    require('ts-node').register({ transpileOnly: true });
  } catch (e) {}
  const libTS = require('./services/library.ts');
  libraryService = libTS && libTS.default ? libTS.default : libTS;
} catch (err) {
  const libJS = require('./services/library');
  libraryService = libJS && libJS.default ? libJS.default : libJS;
}

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;

// Safe IPC registration helper - removes any existing handler first.
function registerIpcHandler(channel, handler) {
  try {
    ipcMain.removeHandler(channel);
  } catch (e) {
    // ignore
  }
  ipcMain.handle(channel, handler);
}
const session = electron.session;
const dialog = electron.dialog;

let oscClients = {};
let mainWindow;
let currentBlocks = []; // Store current blocks to persist across requests

const status = {
  bpm: 120,
  isPlaying: false,
  isRecording: false,
  isConnected: true,
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    // Set a dark background so the window isn't white if CSS fails
    backgroundColor: '#0f172a',
  });

  if (app.isPackaged || process.env.NODE_ENV === 'production') {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    const devUrl = 'http://localhost:5173';
    // Robust: wait for Vite dev server to be ready to avoid ERR_CONNECTION_REFUSED
    const http = require('http');
    const maxRetries = 40;
    const retryInterval = 250; // ms
    let attempts = 0;

    const tryLoad = () => {
      attempts++;
      const req = http.request(
        devUrl,
        { method: 'HEAD', timeout: 2000 },
        (res) => {
          if (res.statusCode >= 200 && res.statusCode < 400) {
            mainWindow.loadURL(devUrl);
            mainWindow.webContents.openDevTools();
          } else if (attempts < maxRetries) {
            setTimeout(tryLoad, retryInterval);
          } else {
            // Last resort: still try to load
            mainWindow.loadURL(devUrl);
            mainWindow.webContents.openDevTools();
          }
        },
      );
      req.on('error', () => {
        if (attempts < maxRetries) setTimeout(tryLoad, retryInterval);
        else mainWindow.loadURL(devUrl);
      });
      req.on('timeout', () => {
        req.destroy();
        if (attempts < maxRetries) setTimeout(tryLoad, retryInterval);
        else mainWindow.loadURL(devUrl);
      });
      req.end();
    };

    tryLoad();
  }
}

function broadcastStatus() {
  if (mainWindow) {
    mainWindow.webContents.send('UI:STATUS_UPDATE', status);
  }
}

app.whenReady().then(async () => {
  await db.init(app);

  let settings = db.getSettings();
  if (Object.keys(settings).length === 0) {
    db.populateInitialData();
    settings = db.getSettings();
  }

  trackResolver.init(db.getDb());
  trackResolver.startMockUpdates();

  oscClients = {
    reaper: new osc.Client('127.0.0.1', settings.reaper_port),
    ableton: new osc.Client('127.0.0.1', settings.ableton_port),
  };

  const isDev =
    process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data:;",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:;",
          "connect-src 'self' ws:;",
          "worker-src 'self' blob:;",
        ].join(' '),
      },
    });
  });

  createWindow();

  setInterval(broadcastStatus, 1000);

  midiListener.init((message) => {
    if (message._type === 'noteon') {
      // Map MIDI message to macro
      const macroId = message.note; // Just for testing, we'll use the note number as the macro ID
      // In a real scenario, we would look up the macro in the Mappings table
      sendMacro(macroId);
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Downloader Handler: spawn Python downloader and return result JSON
registerIpcHandler('DOWNLOADER:DOWNLOAD', async (event, url) => {
  try {
    console.log('DOWNLOADER: Starting download for', url);
    const res = await downloaderBridge.spawnDownload(url);
    console.log('DOWNLOADER: Success', res);
    return { success: true, path: res.path, title: res.title };
  } catch (err) {
    console.error('DOWNLOADER: Failed', err?.message || err);
    return { success: false, error: err.message || String(err) };
  }
});

// Library handlers
registerIpcHandler('LIBRARY:CREATE_PROJECT', async (event, payload) => {
  try {
    const userDataPath = app.getPath('userData');
    const result = libraryService.createProject(userDataPath, payload);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

registerIpcHandler('LIBRARY:GET_PROJECTS', async () => {
  try {
    const projects = libraryService.getAllProjects();
    return { success: true, projects };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

registerIpcHandler(
  'LIBRARY:ATTACH_MIDI',
  async (event, { projectId, midiPath }) => {
    try {
      const userDataPath = app.getPath('userData');
      // copy midi file to library and attach
      const uuidProject = libraryService
        .getAllProjects()
        .find((p) => p.id === projectId)?.uuid;
      const fs = require('fs');
      const path = require('path');
      if (!uuidProject) return { success: false, error: 'Project not found' };
      const destDir = path.join(app.getPath('userData'), 'library', 'midi');
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      const destFile = path.join(
        destDir,
        `${uuidProject}-${path.basename(midiPath)}`,
      );
      fs.copyFileSync(midiPath, destFile);
      const attachRes = libraryService.attachMidi(projectId, destFile);
      if (!attachRes || !attachRes.success) {
        return { success: false, error: attachRes?.error || 'attach failed' };
      }
      return { success: true, midi_path: destFile };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
);

// Parse MIDI and attach/save analysis for a project
registerIpcHandler(
  'LIBRARY:PARSE_MIDI',
  async (event, { projectId, midiPath }) => {
    try {
      if (!projectId || !midiPath) throw new Error('Missing parameters');
      if (!libraryService || !libraryService.parseMidiAndSaveForProject) {
        // Fallback: use midiParser directly and save
        const res = midiParser.parseMidiToLinearAnalysis
          ? midiParser.parseMidiToLinearAnalysis(midiPath)
          : await midiParser.parseMidiFileToLinear(midiPath);
        if (!res || !res.linear_analysis)
          throw new Error('MIDI parsing failed');
        const metadata = res.linear_analysis.metadata || {};
        const fileHash = `midi-${Date.now()}`;
        const analysisId = db.saveAnalysis({
          file_path: midiPath,
          file_hash: fileHash,
          metadata,
          linear_analysis: res.linear_analysis,
          structural_map: { sections: [] },
          arrangement_flow: {},
          harmonic_context: {},
          polyrhythmic_layers: [],
        });
        const database = db.getDb();
        database &&
          database.run &&
          database.run('UPDATE Projects SET analysis_id = ? WHERE id = ?', [
            analysisId,
            projectId,
          ]);
        return { success: true, analysisId, fileHash };
      }
      const p = await libraryService.parseMidiAndSaveForProject(
        projectId,
        midiPath,
      );
      return p;
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

registerIpcHandler('DB:LOAD_ARRANGEMENT', async (event, arg) => {
  const database = db.getDb();
  const stmt = database.prepare('SELECT * FROM Arrangement');
  const arrangements = stmt.all();
  stmt.free();
  return arrangements;
});

registerIpcHandler('TRACK:RESOLVE_INDEX', async (event, trackName) => {
  return trackResolver.getTrackIndex(trackName);
});

registerIpcHandler('OSC:SEND_TRANSPORT', async (event, command) => {
  const reaperMessage = oscBuilder.sendReaperTransport(command);
  const abletonMessage = oscBuilder.sendAbletonTransport(command);

  oscClients.reaper.send(
    reaperMessage.address,
    ...reaperMessage.args.map((a) => a.value),
  );
  oscClients.ableton.send(
    abletonMessage.address,
    ...abletonMessage.args.map((a) => a.value),
  );
});

ipcMain.on('NETWORK:SEND_MACRO', (event, { macro, payload }) => {
  if (macro === 'MACRO_PLAY') {
    status.isPlaying = !status.isPlaying;
    const command = status.isPlaying ? 'play' : 'stop';
    const reaperMessage = oscBuilder.sendReaperTransport(command);
    const abletonMessage = oscBuilder.sendAbletonTransport(command);

    oscClients.reaper.send(
      reaperMessage.address,
      ...reaperMessage.args.map((a) => a.value),
    );
    oscClients.ableton.send(
      abletonMessage.address,
      ...abletonMessage.args.map((a) => a.value),
    );
    broadcastStatus();
  } else {
    if (!payload || !payload.macroId) {
      console.error('Invalid payload for NETWORK:SEND_MACRO');
      return;
    }
    sendMacro(payload.macroId);
  }
});

ipcMain.on('UI:REQUEST_STATUS', (event) => {
  broadcastStatus();
});

ipcMain.on('UI:REQUEST_INITIAL', (event) => {
  // Send current blocks if any exist
  if (currentBlocks.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    console.log(
      'UI:REQUEST_INITIAL: Sending',
      currentBlocks.length,
      'existing blocks',
    );
    mainWindow.webContents.send('UI:BLOCKS_UPDATE', currentBlocks);
  } else {
    console.log('UI:REQUEST_INITIAL: No blocks to send');
  }
  broadcastStatus();
});

// Dialog IPC Handlers
registerIpcHandler('DIALOG:SHOW_OPEN', async (event, options = {}) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return {
        canceled: true,
        filePaths: [],
        error: 'Main window not available',
      };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select Audio File',
      filters: options.filters || [
        {
          name: 'Audio Files',
          extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'aac'],
        },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
      ...options,
    });

    if (result.canceled) {
      return { canceled: true, filePaths: [] };
    }

    return { canceled: false, filePaths: result.filePaths || [] };
  } catch (error) {
    console.error('Error in DIALOG:SHOW_OPEN:', error);
    return { canceled: true, filePaths: [], error: error.message };
  }
});

// Helper: start full analysis (used by ANALYSIS:START and by LIBRARY:RE_ANALYZE)
async function startFullAnalysis(filePath, userHints = {}, projectId = null) {
  const startTime = Date.now();
  console.log('=== startFullAnalysis START ===');
  console.log('File path:', filePath);
  try {
    // Validate and run the same code path as ANALYSIS:START
    const fs = require('fs');
    if (!filePath || typeof filePath !== 'string')
      throw new Error('Invalid file path');
    if (!fs.existsSync(filePath))
      throw new Error('File does not exist: ' + filePath);

    // NOTE: Required at top of file for early failure detection

    const metadata = metadataLookup.gatherMetadata(filePath, userHints);
    const fileInfo = fileProcessor.getFileInfo(filePath);
    const fileHash = fileInfo.hash;

    const session = sessionManager.createSession(filePath, fileHash, metadata);
    const tracker = new progressTracker.ProgressTracker(session, mainWindow);

    session.setState('pass1');
    tracker.update('step0', 100);
    tracker.broadcast();
    await new Promise((resolve) => setTimeout(resolve, 50));

    tracker.update('pass1', 0);
    tracker.broadcast();
    let result = await listener.analyzeAudio(
      filePath,
      (progress) => {
        tracker.update('pass1', progress);
        tracker.broadcast();
      },
      metadata,
    );
    if (!result || !result.linear_analysis)
      throw new Error('Pass 1 returned invalid result');

    const linear_analysis = result.linear_analysis;
    session.setResult('pass1', linear_analysis);
    // color intentionally omitted; UI controls theme mapping
    tracker.broadcast();

    // Pass 2: Architect
    session.setState('pass2');
    tracker.update('pass2', 0);
    tracker.broadcast();
    // 🔴 AGGRESSIVE OVERSHOOT CONFIGURATION
    const architectOptions = {
      // Downsample factor used by architect to avoid OOM on long songs
      downsampleFactor: 4,
      // 1. Sensitivity: Make it look for tiny changes
      forceOverSeg: true,
      noveltyKernel: 3,
      sensitivity: 0.6,

      // 2. The "Anti-Merge" Wall: Prevent merging unless identical
      mergeChromaThreshold: 0.99,
      exactChromaThreshold: 0.99,
      exactMfccThreshold: 0.95,

      // 3. Theory Glue: Turn it off or make it strict
      progressionSimilarityThreshold: 0.95,
      progressionSimilarityMode: 'normalized',

      // 4. Duration: Allow short phrases
      minSectionsStop: 20,
      minSectionDurationSec: 4,
    };
    console.log('Applying Golden Architecture Config:', architectOptions);
    const structural_map = await architect.analyzeStructure(
      linear_analysis,
      (p) => {
        tracker.update('pass2', p);
        tracker.broadcast();
      },
      architectOptions,
    );
    if (!structural_map || !structural_map.sections)
      throw new Error('Pass 2 returned invalid result');
    session.setResult('pass2', structural_map);
    tracker.update('pass2', 100);
    tracker.broadcast();

    // Pass 3: Theorist
    session.setState('pass3');
    tracker.update('pass3', 0);
    tracker.broadcast();
    const corrected_structural_map = await theorist.correctStructuralMap(
      structural_map,
      linear_analysis,
      metadata,
      (p) => {
        tracker.update('pass3', p);
        tracker.broadcast();
      },
    );
    if (!corrected_structural_map || !corrected_structural_map.sections)
      throw new Error('Pass 3 returned invalid result');
    session.setResult('pass3', corrected_structural_map);
    tracker.update('pass3', 100);
    tracker.broadcast();

    // Build arrangement_flow and harmonic_context
    const arrangement_flow = {
      form: determineForm(corrected_structural_map.sections),
      timeline: corrected_structural_map.sections.map((s, idx) => ({
        position: idx + 1,
        section_reference: s.section_id,
        start_time: s.time_range?.start_time || 0,
        end_time: s.time_range?.end_time || 0,
        variations: [],
      })),
      transitions: [],
    };
    const harmonic_context = {
      global_key: {
        primary_key:
          linear_analysis.metadata?.detected_key || metadata.key_hint || 'C',
        mode:
          linear_analysis.metadata?.detected_mode ||
          metadata.mode_hint ||
          'ionian',
        confidence: 0.8,
      },
      modulations: [],
      borrowed_chords: [],
      genre_profile: {
        detected_genre: metadata.genre_hint || 'pop',
        confidence: 0.7,
        genre_constraints: genreProfiles.getGenreProfile(
          metadata.genre_hint || 'pop',
        ),
      },
      functional_summary: {},
    };

    // Save analysis
    const analysisId = db.saveAnalysis({
      file_path: filePath,
      file_hash: fileHash,
      metadata,
      linear_analysis,
      structural_map: corrected_structural_map,
      arrangement_flow,
      harmonic_context,
      polyrhythmic_layers: [],
    });
    if (projectId && analysisId) {
      const database = db.getDb();
      database &&
        database.run &&
        database.run('UPDATE Projects SET analysis_id = ? WHERE id = ?', [
          analysisId,
          projectId,
        ]);
    }

    tracker.complete();
    const endTime = Date.now();
    console.log(
      `=== startFullAnalysis COMPLETE (${((endTime - startTime) / 1000).toFixed(2)}s) ===`,
    );
    return { success: true, analysisId, fileHash };
  } catch (err) {
    console.error('startFullAnalysis error:', err);
    return { success: false, error: err.message || String(err) };
  }
}

// Analysis IPC Handlers

registerIpcHandler(
  'ANALYSIS:START',
  async (event, { filePath, userHints = {} }) => {
    return await startFullAnalysis(filePath, userHints, null);
  },
);

registerIpcHandler('ANALYSIS:GET_STATUS', async (event, fileHash) => {
  const session = sessionManager.getSession(fileHash);
  if (session) {
    return session.toJSON();
  }
  return null;
});

registerIpcHandler('ANALYSIS:GET_RESULT', async (event, fileHash) => {
  console.log('IPC: ANALYSIS:GET_RESULT called for fileHash:', fileHash);
  const analysis = db.getAnalysis(fileHash);

  if (analysis) {
    console.log('IPC: Returning analysis with:', {
      id: analysis.id,
      hasLinearAnalysis: !!analysis.linear_analysis,
      hasStructuralMap: !!analysis.structural_map,
      sectionCount: analysis.structural_map?.sections?.length || 0,
      eventCount: analysis.linear_analysis?.events?.length || 0,
    });
  } else {
    console.warn('IPC: No analysis found for fileHash:', fileHash);
  }

  return analysis;
});

registerIpcHandler('ANALYSIS:PARSE_MIDI', async (event, payload) => {
  try {
    console.warn(
      'DEPRECATED: ANALYSIS:PARSE_MIDI called. Use LIBRARY:PARSE_MIDI.',
    );
    // Legacy call used to accept a midiPath string. Now we require an object with projectId and midiPath.
    if (!payload) throw new Error('No payload provided');
    // If payload is a string (old usage), reject to prevent orphaned analyses.
    if (typeof payload === 'string') {
      return {
        success: false,
        error:
          'Legacy ANALYSIS:PARSE_MIDI usage is deprecated. Use LIBRARY:PARSE_MIDI({ projectId, midiPath }).',
      };
    }
    const { projectId, midiPath } = payload;
    if (!projectId || !midiPath) {
      return {
        success: false,
        error:
          'ANALYSIS:PARSE_MIDI requires { projectId, midiPath }. Use LIBRARY:PARSE_MIDI instead.',
      };
    }

    // Forward to library service if available
    if (libraryService && libraryService.parseMidiAndSaveForProject) {
      return libraryService.parseMidiAndSaveForProject(projectId, midiPath);
    }

    // Fallback: parse the MIDI and save analysis, then attach to project
    let res;
    if (midiParser.parseMidiFileToLinear) {
      res = await midiParser.parseMidiFileToLinear(midiPath);
    } else if (midiParser.parseMidiToLinearAnalysis) {
      res = midiParser.parseMidiToLinearAnalysis(midiPath);
    } else {
      throw new Error('No midi parser available');
    }
    if (!res || !res.linear_analysis) throw new Error('MIDI parsing failed');
    const metadata = res.linear_analysis.metadata || {};
    const fileHash = `midi-${Date.now()}`;
    const analysisId = db.saveAnalysis({
      file_path: midiPath,
      file_hash: fileHash,
      metadata,
      linear_analysis: res.linear_analysis,
      structural_map: { sections: [] },
      arrangement_flow: {},
      harmonic_context: {},
      polyrhythmic_layers: [],
    });
    const database = db.getDb();
    database &&
      database.run &&
      database.run('UPDATE Projects SET analysis_id = ? WHERE id = ?', [
        analysisId,
        projectId,
      ]);
    return { success: true, analysisId, fileHash };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Fast re-calculation of chord events for an existing analysis (no Python)
registerIpcHandler(
  'ANALYSIS:RECALC_CHORDS',
  async (event, { fileHash, options = {} }) => {
    try {
      if (!fileHash) throw new Error('fileHash required');
      const analysis = db.getAnalysis(fileHash);
      if (!analysis || !analysis.linear_analysis)
        throw new Error('Analysis not found');
      // Try to invoke listener's recalcChords if available
      if (listener && listener.recalcChords) {
        // Add detection options + globalKey to metadata so chord analyzer can pick it up
        const cloned = JSON.parse(JSON.stringify(analysis.linear_analysis));
        if (!cloned.metadata) cloned.metadata = {};
        const opt = options || {};
        const mergedOptions = {
          globalKey:
            opt.globalKey ||
            analysis.harmonic_context?.global_key?.primary_key ||
            cloned.metadata.detected_key,
          temperature: opt.temperature ?? 0.1,
          transitionProb: opt.transitionProb ?? 0.8,
          diatonicBonus: opt.diatonicBonus ?? 0.1,
          rootPeakBias: opt.rootPeakBias ?? 0.1,
          frameHop:
            cloned.metadata?.frame_hop_seconds ||
            cloned.metadata?.hop_length / cloned.metadata?.sample_rate ||
            0.0232,
          rootOnly: opt.rootOnly === undefined ? true : !!opt.rootOnly,
        };
        if (mergedOptions.globalKey) {
          cloned.metadata.detected_key = mergedOptions.globalKey;
          cloned.metadata.detected_mode = cloned.metadata.detected_mode || 'major';
          cloned.metadata.user_override_key = mergedOptions.globalKey;
        }
        const res = listener.recalcChords(cloned, mergedOptions);
        if (!res || !res.success)
          throw new Error(res?.error || 'recalc failed');
        if (options.commit) {
          // Persist changes to DB by updating the analysis linear_analysis
          analysis.linear_analysis.events = res.events;
          // Update the harmonic_context if globalKey overridden
          if (mergedOptions.globalKey) {
            analysis.harmonic_context = analysis.harmonic_context || {};
            analysis.harmonic_context.global_key =
              analysis.harmonic_context.global_key || {};
            analysis.harmonic_context.global_key.primary_key = mergedOptions.globalKey;
            analysis.harmonic_context.global_key.confidence =
              analysis.harmonic_context.global_key.confidence || 0.95;
          }
          // Persist chosen analyzer tuning into harmonic_context for transparency
          analysis.harmonic_context = analysis.harmonic_context || {};
          analysis.harmonic_context.chord_analyzer_options =
            analysis.harmonic_context.chord_analyzer_options || {};
          analysis.harmonic_context.chord_analyzer_options = {
            ...(analysis.harmonic_context.chord_analyzer_options || {}),
            ...(mergedOptions || {}),
          };
          // call DB update to modify the existing analysis row
          const success = db.updateAnalysisById(analysis.id, analysis);
          if (!success) throw new Error('Failed to commit analysis update');
        }
        return { success: true, events: res.events };
      }
      // Fallback: no listener helper exposed
      throw new Error('Listener recalc not available');
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  });

// Grid transformation (fast, in-memory/preview by default)
registerIpcHandler(
  'ANALYSIS:TRANSFORM_GRID',
  async (event, { fileHash, operation, value = 0, commit = false }) => {
    try {
      if (!fileHash) throw new Error('fileHash required');
      const analysis = db.getAnalysis(fileHash);
      if (!analysis || !analysis.linear_analysis)
        throw new Error('Analysis not found');
      const cloned = JSON.parse(JSON.stringify(analysis.linear_analysis));
      cloned.beat_grid = cloned.beat_grid || { beat_timestamps: [] };
      const grid = cloned.beat_grid;
      const beatTimestamps = grid.beat_timestamps || [];

      if (operation === 'double_time') {
        // Insert midpoints between consecutive beats
        const doubled = [];
        for (let i = 0; i < beatTimestamps.length - 1; i++) {
          const a = beatTimestamps[i];
          const b = beatTimestamps[i + 1];
          doubled.push(a);
          doubled.push((a + b) / 2);
        }
        // push last beat
        if (beatTimestamps.length > 0) doubled.push(beatTimestamps[beatTimestamps.length - 1]);
        grid.beat_timestamps = doubled;
        grid.tempo_bpm = (grid.tempo_bpm || 120) * 2;
      } else if (operation === 'half_time') {
        grid.beat_timestamps = beatTimestamps.filter((_, i) => i % 2 === 0);
        grid.tempo_bpm = (grid.tempo_bpm || 120) / 2;
      } else if (operation === 'shift') {
        // value is seconds offset (can be negative)
        grid.beat_timestamps = beatTimestamps.map((t) => t + value);
      } else if (operation === 'set_bpm') {
        const bpm = Number(value) || grid.tempo_bpm || 120;
        // Rescale timestamps so their density reflects new tempo
        if (bpm <= 0) throw new Error('Invalid BPM');
        const currentTempo = grid.tempo_bpm || bpm;
        const scaling = currentTempo > 0 ? currentTempo / bpm : 1.0;
        grid.beat_timestamps = beatTimestamps.map((t) => t * scaling);
        grid.tempo_bpm = bpm;
      } else {
        throw new Error('Unsupported operation');
      }

      if (commit) {
        analysis.linear_analysis.beat_grid = grid;
        const success = db.updateAnalysisById(analysis.id, analysis);
        if (!success) throw new Error('Failed to commit grid update');
      }

      return { success: true, beat_grid: grid };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  },
);

registerIpcHandler('ANALYSIS:GET_BY_ID', async (event, analysisId) => {
  try {
    if (!analysisId) throw new Error('analysisId required');
    const res = db.getAnalysisById(analysisId);
    if (!res) return { success: false, error: 'Not found' };
    return { success: true, analysis: res };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Re-segment the structure (fast-ish) by re-running architect + theorist on existing linear_analysis
registerIpcHandler('ANALYSIS:RESEGMENT', async (event, { fileHash, options = {}, commit = false }) => {
  try {
    if (!fileHash) throw new Error('fileHash required');
    const analysis = db.getAnalysis(fileHash);
    if (!analysis || !analysis.linear_analysis) throw new Error('Analysis not found');
    // merge defaults with provided options
    const architectOptions = {
      downsampleFactor: options.downsampleFactor || 4,
      forceOverSeg: options.forceOverSeg === undefined ? false : !!options.forceOverSeg,
      noveltyKernel: options.noveltyKernel || 5,
      sensitivity: options.sensitivity || 0.6,
      mergeChromaThreshold: options.mergeChromaThreshold || 0.92,
      minSectionDurationSec: options.minSectionDurationSec || 8.0,
    };
    const structural_map = await architect.analyzeStructure(analysis.linear_analysis, (p) => {}, architectOptions);
    if (!structural_map) throw new Error('architect failed');
    const corrected = await theorist.correctStructuralMap(structural_map, analysis.linear_analysis, analysis.metadata || {}, (p) => {});
    if (commit) {
      analysis.structural_map = corrected;
      const success = db.updateAnalysisById(analysis.id, analysis);
      if (!success) throw new Error('Failed to commit resegment');
    }
    return { success: true, structural_map: corrected };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Generate structure from constraints (Sandbox Mode)
registerIpcHandler('SANDBOX:GENERATE', async (event, constraints) => {
  try {
    console.log('SANDBOX: Generating structure with constraints:', constraints);
    const structuralMap = structureGenerator.generateStructure(constraints);

    // Convert to blocks format
    const blocks = structuralMap.sections.map((section, index) => {
      const duration = section.time_range
        ? section.time_range.end_time - section.time_range.start_time
        : 16;
      const bars = Math.max(1, Math.round(duration / 2));

      return {
        id: section.section_id || `generated-${index}`,
        name: section.section_label || 'Section',
        label: section.section_label || 'Section',
        length: bars,
        bars: bars,
        section_label: section.section_label,
        section_variant: section.section_variant,
        harmonic_dna: section.harmonic_dna || {},
        rhythmic_dna: section.rhythmic_dna || {},
        time_range: section.time_range,
        probability_score: section.probability_score || 0.8,
      };
    });

    console.log('SANDBOX: Generated', blocks.length, 'sections');

    // Store blocks for persistence
    currentBlocks = blocks;

    // Send blocks to UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('UI:BLOCKS_UPDATE', blocks);
    }

    return { success: true, blocks, structuralMap };
  } catch (error) {
    console.error('SANDBOX: Error generating structure:', error);
    return { success: false, error: error.message };
  }
});

registerIpcHandler(
  'LIBRARY:RE_ANALYZE',
  async (event, { projectId, force = false }) => {
    try {
      if (!projectId) throw new Error('Missing projectId');
      const project = db.getProjectById(projectId);
      if (!project) throw new Error('Project not found');
      if (!project.audio_path)
        throw new Error('Project has no audio path to re-analyze');
      // If there's an existing analysis, delete it unless force=false
      if (project.analysis_id) {
        // delete
        db.deleteAnalysisById(project.analysis_id);
        db.updateProjectAnalysisId(projectId, null);
      }

      // Start a fresh full analysis and attach it to the project
      const res = await startFullAnalysis(project.audio_path, {}, projectId);
      return res;
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  },
);
registerIpcHandler('ARCHITECT:UPDATE_BLOCKS', async (event, blocks = []) => {
  try {
    currentBlocks = Array.isArray(blocks) ? blocks : [];
    console.log(
      'ARCHITECT:UPDATE_BLOCKS received',
      currentBlocks.length,
      'blocks',
    );
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('UI:BLOCKS_UPDATE', currentBlocks);
    }
    return { success: true, count: currentBlocks.length };
  } catch (error) {
    console.error('ARCHITECT:UPDATE_BLOCKS error:', error);
    return { success: false, error: error.message };
  }
});

// Convert analysis results to blocks format for Architect view
registerIpcHandler('ANALYSIS:LOAD_TO_ARCHITECT', async (event, fileHash) => {
  try {
    const analysis = db.getAnalysis(fileHash);
    if (
      !analysis ||
      !analysis.structural_map ||
      !analysis.structural_map.sections
    ) {
      return { success: false, error: 'Analysis not found or invalid' };
    }

    console.log('Converting analysis sections to blocks...');
    console.log('Sections found:', analysis.structural_map.sections.length);

    // Convert sections to blocks format
    const blocks = analysis.structural_map.sections.map((section, index) => {
      const duration = section.time_range
        ? section.time_range.end_time - section.time_range.start_time
        : 4; // Default 4 bars
      const bars = Math.max(1, Math.round(duration / 2)); // Approximate bars (assuming 2 seconds per bar)

      const block = {
        id: section.section_id || `section-${index}`,
        name: section.section_label || 'Section',
        label: section.section_label || 'Section',
        length: bars,
        bars: bars,
        // color intentionally omitted; UI controls theme mapping
        section_label: section.section_label,
        section_variant: section.section_variant,
        harmonic_dna: section.harmonic_dna || {},
        rhythmic_dna: section.rhythmic_dna || {},
        time_range: section.time_range,
        probability_score: section.probability_score || 0.5,
      };

      console.log(
        `Block ${index}:`,
        block.id,
        block.label,
        block.length,
        'bars',
      );
      return block;
    });

    console.log(`Sending ${blocks.length} blocks to UI...`);

    // Store blocks for persistence
    currentBlocks = blocks;
    console.log('Blocks stored in memory:', currentBlocks.length);

    // Send blocks to UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('UI:BLOCKS_UPDATE', blocks);
        console.log('Blocks sent successfully via UI:BLOCKS_UPDATE');

        // Also send a second time after a small delay to ensure it's received
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('UI:BLOCKS_UPDATE', blocks);
            console.log('Blocks re-sent (retry)');
          }
        }, 100);
      } catch (error) {
        console.error('Error sending blocks:', error);
      }
    } else {
      console.warn('Main window not available for sending blocks');
    }

    return { success: true, blocks, count: blocks.length };
  } catch (error) {
    console.error('Error loading analysis to Architect:', error);
    return { success: false, error: error.message };
  }
});

// NOTE: Color & styling mapping is handled on the frontend.
// Backend only emits `section_label` and related data.

registerIpcHandler(
  'ANALYSIS:GET_SECTION',
  async (event, { analysisId, sectionId }) => {
    const sections = db.getAnalysisSections(analysisId);
    return sections.find((s) => s.section_id === sectionId);
  },
);

registerIpcHandler('THEORY:GET_GENRE_PROFILE', async (event, genreName) => {
  return genreProfiles.getGenreProfile(genreName);
});

registerIpcHandler(
  'THEORY:VALIDATE_PROGRESSION',
  async (event, { chords, key, genre }) => {
    // Validate chord sequence against theory rules
    const genreProfile = genreProfiles.getGenreProfile(genre);
    const keyContext = { primary_key: key, mode: 'ionian' };

    // Simplified validation - would use full theory engine
    return {
      valid: true,
      suggestions: [],
    };
  },
);

registerIpcHandler(
  'ANALYSIS:SET_METADATA',
  async (event, { fileHash, metadata }) => {
    const session = sessionManager.getSession(fileHash);
    if (session) {
      session.metadata = { ...session.metadata, ...metadata };
      return { success: true };
    }
    return { success: false, error: 'Session not found' };
  },
);

// Helper function to determine form
function determineForm(sections) {
  const labels = sections.map((s) => s.section_label);
  const unique = [...new Set(labels)];

  if (unique.length === 1) {
    return 'Through-composed';
  }

  // Simple form detection
  if (labels.includes('verse') && labels.includes('chorus')) {
    return 'Verse-Chorus';
  }

  if (unique && unique.length === 2) {
    return `${unique[0]}-${unique[1]}`;
  }

  return 'Custom';
}

function sendMacro(macroId) {
  // 1. Look up the macro in the database
  const database = db.getDb();
  const stmt = database.prepare(
    'SELECT name, actions_json FROM Mappings WHERE id = ?',
  );
  const mapping = stmt.get([macroId]);
  stmt.free();

  if (
    mapping &&
    mapping.length > 0 &&
    mapping[0] &&
    mapping[0].values &&
    mapping[0].values.length > 0 &&
    mapping[0].values[0] &&
    mapping[0].values[0].length > 0
  ) {
    const mappingName = mapping[0].values[0][0];
    if (mainWindow) {
      mainWindow.webContents.send('DEBUG:MIDI_ABSTRACTED', mappingName);
    }

    // Safely log - handle broken pipe errors
    try {
      console.log(`Executing Macro ${mappingName}`);
    } catch (error) {
      // Ignore EPIPE errors silently
      if (error.code !== 'EPIPE') {
        console.error('Error logging:', error.message);
      }
    }

    const actionsJson = mapping[0].values[0][1];
    if (!actionsJson) {
      try {
        console.log(`No actions found for macro ${mappingName}`);
      } catch (error) {
        if (error.code !== 'EPIPE') {
          console.error('Error logging:', error.message);
        }
      }
      return;
    }

    const actions = JSON.parse(actionsJson);

    actions.forEach((action) => {
      // 2. Resolve track index
      const trackIndex = trackResolver.getTrackIndex(action.track);

      if (trackIndex !== undefined) {
        // 3. Build OSC message
        const message = oscBuilder.buildMessage(
          action.daw,
          trackIndex,
          action.command,
          action.value,
        );

        // 4. Send OSC message
        try {
          console.log(`Sending OSC message to ${action.daw}:`, message);
        } catch (error) {
          // Ignore EPIPE errors silently
          if (error.code !== 'EPIPE') {
            console.error('Error logging:', error.message);
          }
        }
        oscClients[action.daw].send(message.address, message.args[0].value);
      } else {
        try {
          console.log(`Could not find track index for ${action.track}`);
        } catch (error) {
          // Ignore EPIPE errors silently
          if (error.code !== 'EPIPE') {
            console.error('Error logging:', error.message);
          }
        }
      }
    });
  } else {
    try {
      console.log(`Could not find macro with ID ${macroId}`);
    } catch (error) {
      // Ignore EPIPE errors silently
      if (error.code !== 'EPIPE') {
        console.error('Error logging:', error.message);
      }
    }
  }
}
