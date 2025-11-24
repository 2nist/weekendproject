const electron = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');
const logger = require('./analysis/logger');
const midiListener = require('./midiListener');
const trackResolver = require('./trackResolver');
const oscBuilder = require('./oscBuilder');
const osc = require('node-osc');

// Analysis modules
const metadataLookup = require('./analysis/metadataLookup');
const sessionManager = require('./analysis/sessionManager');
const listener = require('./analysis/listener');
const architect = require('./analysis/architect_canonical_final');
// V2 architect (multi-scale + adaptive)
let architectV2 = null;
try {
  architectV2 = require('./analysis/architect_v2');
  logger.info('Architect V2 loaded successfully');
} catch (e) {
  logger.warn('Architect V2 not available, falling back to clean version:', e.message);
}
const theorist = require('./analysis/theorist');
// Engine Config (calibrated parameters)
let engineConfig = null;
try {
  require('ts-node').register({ transpileOnly: true });
  const ec = require('./config/engineConfig.ts');
  engineConfig = ec;
  logger.info('EngineConfig loaded successfully');
} catch (e) {
  try {
    engineConfig = require('./config/engineConfig');
  } catch (e2) {
    logger.warn('EngineConfig not available:', e2?.message || e?.message);
  }
}
// Calibration Service - lazy load helper
function loadCalibrationService() {
  if (calibrationService) return calibrationService;

  try {
    try {
      require('ts-node').register({ transpileOnly: true });
    } catch (e) {
      // ts-node might already be registered
    }
    const cs = require('./services/calibration.ts');
    // Handle both default export and named exports
    if (cs.default) {
      calibrationService = cs.default;
    } else if (cs.getBenchmarks && cs.runCalibration) {
      // Named exports - create object
      calibrationService = {
        getBenchmarks: cs.getBenchmarks,
        runCalibration: cs.runCalibration,
      };
    } else {
      calibrationService = cs;
    }
    logger.info('CalibrationService loaded successfully');
    logger.debug('CalibrationService type:', typeof calibrationService);
    logger.debug(
      'CalibrationService methods:',
      calibrationService ? Object.keys(calibrationService) : 'null',
    );
    if (calibrationService) {
      logger.debug('getBenchmarks:', typeof calibrationService.getBenchmarks);
      logger.debug('runCalibration:', typeof calibrationService.runCalibration);
    }
    return calibrationService;
  } catch (err) {
    logger.error('Failed to load CalibrationService (TS):', err?.message || err);
    logger.debug('Stack:', err?.stack);
    try {
      const cs = require('./services/calibration');
      calibrationService = cs && cs.default ? cs.default : cs;
      if (calibrationService) {
        logger.info('CalibrationService loaded (JS fallback)');
      }
      return calibrationService;
    } catch (e2) {
      logger.warn('CalibrationService not available:', e2?.message || e2);
      logger.debug('Stack:', e2?.stack);
      return null;
    }
  }
}

let calibrationService = null;
// Try to load immediately, but don't fail if it doesn't work
try {
  calibrationService = loadCalibrationService();
} catch (e) {
  logger.warn('CalibrationService initial load failed, will try lazy load:', e.message);
}
const fileProcessor = require('./analysis/fileProcessor');
const progressTracker = require('./analysis/progressTracker');
const genreProfiles = require('./analysis/genreProfiles');
const structureGenerator = require('./analysis/structureGenerator');
// Midi parser - lazy load as ES Module
let midiParser = null;
let midiParserLoading = null;

async function ensureMidiParser() {
  if (midiParser) return midiParser;
  if (midiParserLoading) return midiParserLoading;

  midiParserLoading = (async () => {
    try {
      // Prefer TS version in dev - use dynamic import for ES modules
      try {
        require('ts-node').register({ transpileOnly: true });
      } catch (e) {}
      const mpTS = await import('./analysis/midiParser.ts');
      if (mpTS.parseMidiFileToLinear) {
        midiParser = { parseMidiFileToLinear: mpTS.parseMidiFileToLinear };
      } else if (mpTS.default) {
        midiParser = mpTS.default;
      } else {
        midiParser = mpTS;
      }
      logger.info('MidiParser (TS) loaded successfully');
      return midiParser;
    } catch (err) {
      try {
        const mpJS = require('./analysis/midiParser');
        midiParser = mpJS && mpJS.default ? mpJS.default : mpJS;
        logger.info('MidiParser (JS fallback) loaded successfully');
        return midiParser;
      } catch (e2) {
        logger.warn('MidiParser not available:', e2?.message || err?.message);
        return null;
      }
    } finally {
      midiParserLoading = null;
    }
  })();

  return midiParserLoading;
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
  logger.info('[MAIN] Library service loaded (TypeScript)');
} catch (err) {
  try {
    const libJS = require('./services/library');
    libraryService = libJS && libJS.default ? libJS.default : libJS;
    logger.info('[MAIN] Library service loaded (JavaScript)');
  } catch (err2) {
    logger.error('[MAIN] Failed to load library service:', err2.message);
    libraryService = null;
  }
}

if (!libraryService) {
  logger.warn('[MAIN] Library service is null - library features may not work');
}

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;

// Register schemes as privileged to enable media streaming and fetch API support.
try {
  // This must be called before app.whenReady()
  const { protocol } = electron;
  protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, supportFetchAPI: true, stream: true } },
    { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true } },
  ]);
  logger.info('[MAIN] Registered privileged schemes: app, media');
} catch (e) {
  logger.warn('[MAIN] registerSchemesAsPrivileged unavailable or failed:', e?.message || e);
}

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
// In-memory cache for preview changes (not yet committed to DB)
const previewAnalysisCache = new Map(); // fileHash -> analysis object

// Helper function to ensure blocks have complete data structure
function ensureBlockData(block) {
  return {
    id: block.id || block.section_id || `section-${Date.now()}`,
    name: block.name || block.section_label || 'Section',
    label: block.label || block.section_label || 'Section',
    length: block.length || block.bars || 4,
    bars: block.bars || block.length || 4,
    section_label: block.section_label,
    section_variant: block.section_variant,
    harmonic_dna: block.harmonic_dna || {},
    rhythmic_dna: block.rhythmic_dna || {},
    time_range: block.time_range,
    probability_score: block.probability_score !== undefined ? block.probability_score : 0.5,
    semantic_signature: block.semantic_signature || {},
  };
}

// did-finish-load guard to avoid reload loops
let didFinishLoadCount = 0;
let lastDidFinishLoadTs = 0;
const DID_FINISH_LOAD_MAX = 5; // maximum allowed did-finish-load events in window
const DID_FINISH_LOAD_WINDOW_MS = 15000; // window duration for counting

const status = {
  bpm: 120,
  isPlaying: false,
  isRecording: false,
  isConnected: true,
};

function createWindow() {
  // Prevent creating multiple windows if one exists
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.focus();
    } catch (e) {}
    return mainWindow;
  }
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

  // Reset did-finish-load counter when we create a new window
  didFinishLoadCount = 0;
  lastDidFinishLoadTs = Date.now();
  logger.info('[MAIN] Created mainWindow at', new Date().toISOString());

  if (app.isPackaged || process.env.NODE_ENV === 'production') {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    const devUrl = 'http://localhost:5173';
    // Robust: wait for Vite dev server to be ready to avoid ERR_CONNECTION_REFUSED
    const http = require('http');
    const maxRetries = 40;
    const retryInterval = 250; // ms
    let attempts = 0;
    let loaded = false; // Prevent multiple loads

    const tryLoad = () => {
      if (loaded) return; // Already loaded successfully
      attempts++;
      const req = http.request(devUrl, { method: 'HEAD', timeout: 2000 }, (res) => {
        if (loaded) return; // Race condition guard
        if (res.statusCode >= 200 && res.statusCode < 400) {
          loaded = true; // Mark as loaded to stop retries
          mainWindow.loadURL(devUrl);
          mainWindow.webContents.openDevTools({ mode: 'detach' });

          mainWindow.webContents.once('devtools-opened', () => {
            logger.debug('[MAIN] DevTools opened - configuring to prevent auto-reload');
          });
        } else if (attempts < maxRetries) {
          setTimeout(tryLoad, retryInterval);
        } else {
          // Last resort: still try to load
          loaded = true;
          mainWindow.loadURL(devUrl);
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      });
      req.on('error', () => {
        if (loaded) return;
        if (attempts < maxRetries) setTimeout(tryLoad, retryInterval);
        else {
          loaded = true;
          mainWindow.loadURL(devUrl);
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (loaded) return;
        if (attempts < maxRetries) setTimeout(tryLoad, retryInterval);
        else {
          loaded = true;
          mainWindow.loadURL(devUrl);
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      });
      req.end();
    };

    tryLoad();
  }

  // Ensure we properly null the mainWindow reference when it's closed
  mainWindow.on('closed', () => {
    logger.info('[MAIN] mainWindow closed');
    try {
      mainWindow = null;
    } catch (e) {}
  });

  // Handle renderer process exits (crashes or kills) gracefully and log details
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    logger.error('[MAIN] Renderer process gone:', details);
    // Do not auto-reload the window - instead log and notify dev
    if (details.reason === 'crashed' || details.reason === 'killed') {
      broadcastLog(
        `[MAIN] Renderer crash detected: ${details.reason} - ${details.reasonCode || ''}`,
      );
    }
  });

  // Forward renderer console messages to main process logs for debugging reload causes
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    logger.debug(`[RENDER] (${level}) ${message} (line:${line} src:${sourceId})`);
  });

  // Optional - log when the window is unresponsive to help diagnose reloads
  mainWindow.on('unresponsive', () => {
    logger.warn('[MAIN] Window unresponsive');
  });
}

function broadcastStatus() {
  if (mainWindow) {
    mainWindow.webContents.send('UI:STATUS_UPDATE', status);
  }
}

// Helper function to broadcast logs to frontend DevTools console
function broadcastLog(message) {
  // Log to terminal (standard console output)
  logger.info(message);

  // Send to renderer process (DevTools console)
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send('DEBUG:LOG', message);
    } catch (err) {
      // Silently ignore if window is destroyed or send fails
      // This prevents crashes during shutdown
    }
  }
}

app.whenReady().then(async () => {
  // Initialize DB early to ensure protocol handlers can use it
  try {
    await db.init(app);
  } catch (err) {
    logger.error('[MAIN] Failed to initialize DB at startup:', err?.message || err);
  }

  // Register custom audio protocol for secure audio file serving
  const { protocol } = require('electron');
  logger.info('[MAIN] Registering audio protocol...');

  // Use app:// protocol which has better Chromium support
  protocol.registerStreamProtocol('app', async (request, callback) => {
    try {
      logger.info('[APP PROTOCOL] ===== NEW REQUEST =====');
      logger.debug('[APP PROTOCOL] Request URL:', request.url);
      let url = request.url.replace('app://', '');
      url = decodeURIComponent(url);
      if (process.platform === 'win32') url = url.replace(/^\/+/, '');
      if (/^[A-Za-z]\//.test(url)) url = url[0] + ':/' + url.slice(2);
      logger.debug('[APP PROTOCOL] Decoded URL:', url);

      const serveFile = (filePath) => {
        try {
          if (!fs.existsSync(filePath)) return false;
          const res = protocolHelpers.createStreamResponse(filePath, request.headers || {});
          callback({ statusCode: res.statusCode, headers: res.headers, data: res.stream });
          return true;
        } catch (e) {
          logger.error('[APP PROTOCOL] serveFile error:', e?.message || e);
          return false;
        }
      };

      // Strategy 1: Direct file path
      if (url.includes(':') || url.startsWith('/')) {
        if (serveFile(url)) return;
        callback({ statusCode: 404, data: null });
        return;
      }

      let database = db.getDb();
      if (!database) {
        logger.warn('[APP PROTOCOL] Database not initialized; attempting to initialize');
        try {
          await db.init(app);
          database = db.getDb();
        } catch (err) {
          logger.error('[APP PROTOCOL] Failed to initialize DB in handler:', err?.message || err);
        }
      }
      if (!database) {
        logger.error('[APP PROTOCOL] ❌ Database not available after init');
        callback({ statusCode: 500, data: null });
        return;
      }

      // Strategy 2: Lookup by fileHash in AudioAnalysis table
      try {
        const analysisStmt = database.prepare(
          'SELECT file_path FROM AudioAnalysis WHERE file_hash = ?',
        );
        analysisStmt.bind([url]);
        if (analysisStmt.step()) {
          const row = analysisStmt.getAsObject();
          const audioPath = row.file_path;
          logger.debug('[APP PROTOCOL] [Strategy 2] Found in AudioAnalysis table:', audioPath);
          analysisStmt.free();
          if (audioPath && serveFile(audioPath)) return;
        }
        analysisStmt.free();
      } catch (dbErr) {
        logger.warn(
          '[APP PROTOCOL] [Strategy 2] AudioAnalysis table lookup failed:',
          dbErr.message,
        );
      }

      // Strategy 3: Project-based format (app://project-id/song.mp3)
      const parts = url.split('/');
      if (parts.length >= 2) {
        const projectId = parts[0];
        const filename = parts.slice(1).join('/');
        try {
          const projectStmt = database.prepare('SELECT audio_path FROM Projects WHERE id = ?');
          projectStmt.bind([projectId]);
          if (projectStmt.step()) {
            const row = projectStmt.getAsObject();
            const audioPath = row.audio_path;
            projectStmt.free();
            if (audioPath && serveFile(audioPath)) return;
          }
          projectStmt.free();
        } catch (dbErr) {
          logger.warn('[APP PROTOCOL] [Strategy 3] Projects table lookup failed:', dbErr.message);
        }
      }

      // Strategy 4: Fallback to library/audio directory
      if (parts.length >= 2) {
        const filename = parts.slice(1).join('/');
        const userDataPath = app.getPath('userData');
        const audioPath = path.join(userDataPath, 'library', 'audio', filename);
        logger.debug('[APP PROTOCOL] [Strategy 4] Library fallback path:', audioPath);
        if (serveFile(audioPath)) return;
      }

      // All strategies failed
      logger.error('[APP PROTOCOL] ❌ ALL STRATEGIES FAILED - Could not resolve:', url);
      callback({ statusCode: 404, data: null });
    } catch (err) {
      logger.error('[APP PROTOCOL] handler error:', err?.message || err);
      callback({ statusCode: 500, data: null });
    }
  });

  // Register media:// protocol for direct file path access
  protocol.registerStreamProtocol('media', async (request, callback) => {
    try {
      logger.info('[MEDIA PROTOCOL] ===== NEW REQUEST =====');
      logger.debug('[MEDIA PROTOCOL] Request URL:', request.url);

      let filePath = request.url.replace('media://', '');
      filePath = decodeURIComponent(filePath);
      if (process.platform === 'win32') {
        filePath = filePath.replace(/^\/+/, '');
        if (/^[A-Za-z]\//.test(filePath)) {
          filePath = filePath[0] + ':/' + filePath.slice(2);
          logger.debug('[MEDIA PROTOCOL] Normalized Windows path:', filePath);
        }
      }

      if (!fs.existsSync(filePath)) {
        logger.error('[MEDIA PROTOCOL] ❌ FAILED - File not found:', filePath);
        callback({ statusCode: 404, data: null });
        return;
      }

      const stat = fs.statSync(filePath);
      const total = stat.size;
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const mimeTypes = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        mp4: 'video/mp4',
        wav: 'audio/wav',
        ogg: 'audio/ogg',
        flac: 'audio/flac',
        webm: 'audio/webm',
      };
      const contentType = mimeTypes[ext] || 'application/octet-stream';

      const rangeHeader = request.headers && (request.headers.Range || request.headers.range);
      if (rangeHeader) {
        const matches = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
        if (matches) {
          const start = Number(matches[1]);
          const end = matches[2] ? Number(matches[2]) : total - 1;
          const chunkSize = end - start + 1;
          logger.debug('[MEDIA PROTOCOL] Partial content requested:', start, end, 'total:', total);
          const stream = fs.createReadStream(filePath, { start, end });
          callback({
            statusCode: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Range': `bytes ${start}-${end}/${total}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(chunkSize),
            },
            data: stream,
          });
          return;
        }
      }

      // Full content
      const stream = fs.createReadStream(filePath);
      callback({
        statusCode: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
        },
        data: stream,
      });
    } catch (err) {
      logger.error('[MEDIA PROTOCOL] handler error:', err?.message || err);
      callback({ statusCode: 500, data: null });
    }
  });

  // DB already initialized earlier in app.whenReady

  let settings = db.getSettings();
  if (Object.keys(settings).length === 0) {
    db.populateInitialData();
    settings = db.getSettings();
  }

  trackResolver.init(db.getDb());
  // NOTE: `startMockUpdates` performs periodic writes to the database for testing.
  // In development this triggers Vite file watchers and causes a full hard-reload
  // (which resets the UI and reloads routes). To avoid the continuous reload
  // loop during typical development, we leave this disabled by default.
  // trackResolver.startMockUpdates();

  oscClients = {
    reaper: new osc.Client('127.0.0.1', settings.reaper_port),
    ableton: new osc.Client('127.0.0.1', settings.ableton_port),
  };

  // Restore last analysis to prevent "No blocks to send" on startup
  try {
    const lastAnalysis = db.getMostRecentAnalysis();
    if (lastAnalysis && lastAnalysis.structural_map && lastAnalysis.structural_map.sections) {
      const sections = lastAnalysis.structural_map.sections;
      currentBlocks = sections.map((section, index) => {
        const duration = section.time_range
          ? section.time_range.end_time - section.time_range.start_time
          : 4; // Default 4 bars
        const bars = Math.max(1, Math.round(duration / 2)); // Approximate bars (assuming 2 seconds per bar)

        return {
          id: section.section_id || section.id || `section-${index}`,
          name: section.section_label || 'Section',
          label: section.section_label || section.label || 'Section',
          length: bars,
          bars: bars,
          section_label: section.section_label,
          section_variant: section.section_variant,
          harmonic_dna: section.harmonic_dna || {},
          rhythmic_dna: section.rhythmic_dna || {},
          time_range: section.time_range,
          probability_score: section.probability_score || 0.5,
          semantic_signature: section.semantic_signature || {},
        };
      });
      logger.info(`Restored ${currentBlocks.length} blocks from last analysis on startup`);
    } else {
      logger.info('No previous analysis found to restore');
    }
  } catch (error) {
    logger.warn('Failed to restore last analysis:', error.message);
  }

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' data:;",
          "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:;",
          "connect-src 'self' ws:;",
          "worker-src 'self' blob:;",
          "media-src 'self' media: data: blob: app:;",
        ].join(' '),
      },
    });
  });

  createWindow();

  // DEV: Watch for file changes on critical directories and log them so we can diagnose reloads
  // Disabled by default to avoid watching Electron cache and userData (which triggers reload loops)
  const enableDevWatcher = process.env.ENABLE_FILE_WATCHER === 'true';
  if (!app.isPackaged && enableDevWatcher) {
    try {
      const fs = require('fs');
      const pathModule = require('path');
      const userDataPath = app.getPath('userData');
      const cwd = process.cwd();
      const watchTargets = [cwd];

      const shouldIgnore = (p, filename) => {
        if (!filename) return true;
        const fullPath = pathModule.join(p, filename).toLowerCase();
        // Exclude Electron caches, node_modules, and .git
        const excludes = [
          'appdata\\roaming',
          'appdata/roaming',
          'code cache',
          'cache_data',
          '\\cache\\',
          '/cache/',
          'node_modules',
          '.git',
          '\\dist\\',
          '/dist/',
          '\\results\\',
          '/results/',
          '\\benchmarks\\',
          '/benchmarks/',
          '\\.vscode\\',
          '\\.idea\\',
        ];
        for (const ex of excludes) {
          if (fullPath.includes(ex)) return true;
        }
        return false;
      };

      for (const p of watchTargets) {
        try {
          fs.watch(p, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            if (shouldIgnore(p, filename)) return;
            const full = pathModule.join(p, filename);
            logger.debug(`[DEV WATCHER] ${eventType} ${full}`);
          });
        } catch (err) {
          logger.warn('[MAIN] Dev watcher unable to watch', p, err?.message || err);
        }
      }
      logger.info('[MAIN] Dev file watcher ENABLED');
    } catch (e) {
      logger.warn('[MAIN] Dev file watcher failed to initialize:', e?.message || e);
    }
  } else {
    logger.info('[MAIN] Dev file watcher DISABLED');
  }

  // Proactively push current blocks to newly created renderer to avoid 'UI:REQUEST_INITIAL' spam
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.on('did-finish-load', () => {
      const now = Date.now();
      if (now - lastDidFinishLoadTs > DID_FINISH_LOAD_WINDOW_MS) {
        // Reset counter if a long time has passed since the last load
        didFinishLoadCount = 0;
      }
      didFinishLoadCount++;
      lastDidFinishLoadTs = now;
      logger.info(`[MAIN] did-finish-load #${didFinishLoadCount}`);
      if (didFinishLoadCount > DID_FINISH_LOAD_MAX) {
        logger.error(
          '[MAIN] Too many did-finish-load events detected - ignoring event to prevent loop.',
        );
        return;
      }

      // Only proactively push blocks on the initial load for this window
      if (didFinishLoadCount === 1 && currentBlocks && currentBlocks.length > 0) {
        const completeBlocks = currentBlocks.map(ensureBlockData);
        logger.debug(
          'UI:INIT: Pushing stored blocks to renderer on did-finish-load:',
          completeBlocks.length,
        );
        try {
          mainWindow.webContents.send('UI:BLOCKS_UPDATE', completeBlocks);
        } catch (err) {
          logger.warn('UI:INIT: Failed to send blocks on did-finish-load', err?.message || err);
        }
      }
    });

    // Add navigation listeners to diagnose reload cause
    mainWindow.webContents.on('will-navigate', (event, url) => {
      logger.debug(`[MAIN] will-navigate to: ${url}`);
      // Only block DevTools-initiated reloads, allow user navigation
      if (url === devUrl && event.sender.getURL() === devUrl) {
        logger.debug('[MAIN] Blocking DevTools auto-reload');
        event.preventDefault();
      }
    });

    mainWindow.webContents.on('did-navigate', (event, url) => {
      logger.debug(`[MAIN] did-navigate to: ${url}`);
    });

    mainWindow.webContents.on('did-navigate-in-page', (event, url, isMainFrame) => {
      logger.debug(`[MAIN] did-navigate-in-page to: ${url}, isMainFrame: ${isMainFrame}`);
    });
  }

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
    logger.info('DOWNLOADER: Starting download for', url);
    const res = await downloaderBridge.spawnDownload(url, null, (p) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('DOWNLOADER:PROGRESS', p);
        } catch (_) {}
      }
      if (p.percent !== undefined) {
        logger.debug(`DOWNLOADER: ${p.status} ${p.percent.toFixed(2)}%`);
      } else {
        logger.debug(`DOWNLOADER: status=${p.status}`);
      }
    });
    logger.info('DOWNLOADER: Success', res);
    return { success: true, path: res.path, title: res.title };
  } catch (err) {
    logger.error('DOWNLOADER: Failed', err?.message || err);
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
    if (!libraryService) {
      logger.error('[LIBRARY:GET_PROJECTS] Library service not initialized');
      return { success: false, error: 'Library service not available', projects: [] };
    }
    if (!libraryService.getAllProjects) {
      logger.error('[LIBRARY:GET_PROJECTS] getAllProjects method not found');
      return { success: false, error: 'Library service method not available', projects: [] };
    }
    const projects = libraryService.getAllProjects();
    return { success: true, projects: projects || [] };
  } catch (error) {
    logger.error('[LIBRARY:GET_PROJECTS] Error:', error);
    return { success: false, error: error.message || String(error), projects: [] };
  }
});

// Path Configuration handlers
registerIpcHandler('PATH:GET_CONFIG', async () => {
  try {
    const { getInstance } = require('./services/pathConfig');
    const pathConfig = getInstance();
    return { success: true, config: pathConfig.getFullConfig() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

registerIpcHandler('PATH:UPDATE_CONFIG', async (event, updates) => {
  try {
    const { getInstance } = require('./services/pathConfig');
    const pathConfig = getInstance();
    const result = pathConfig.updateConfig(updates);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

registerIpcHandler('PATH:ENABLE_GOOGLE_DRIVE', async (event, googleDrivePath) => {
  try {
    const { getInstance } = require('./services/pathConfig');
    const pathConfig = getInstance();
    const result = pathConfig.enableGoogleDrive(googleDrivePath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

registerIpcHandler('PATH:DISABLE_CLOUD', async () => {
  try {
    const { getInstance } = require('./services/pathConfig');
    const pathConfig = getInstance();
    const result = pathConfig.disableCloud();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

registerIpcHandler('PATH:SELECT_DIRECTORY', async (event, { title, defaultPath }) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Select Directory',
      defaultPath: defaultPath || app.getPath('home'),
      properties: ['openDirectory'],
    });

    if (result.canceled) {
      return { success: false, canceled: true };
    }

    return { success: true, path: result.filePaths[0] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

registerIpcHandler('LIBRARY:ATTACH_MIDI', async (event, { projectId, midiPath }) => {
  try {
    const userDataPath = app.getPath('userData');
    // copy midi file to library and attach
    const uuidProject = libraryService.getAllProjects().find((p) => p.id === projectId)?.uuid;
    const fs = require('fs');
    const path = require('path');
    if (!uuidProject) return { success: false, error: 'Project not found' };
    const destDir = path.join(app.getPath('userData'), 'library', 'midi');
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    const destFile = path.join(destDir, `${uuidProject}-${path.basename(midiPath)}`);
    fs.copyFileSync(midiPath, destFile);
    const attachRes = libraryService.attachMidi(projectId, destFile);
    if (!attachRes || !attachRes.success) {
      return { success: false, error: attachRes?.error || 'attach failed' };
    }
    return { success: true, midi_path: destFile };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Parse MIDI and attach/save analysis for a project
registerIpcHandler('LIBRARY:PARSE_MIDI', async (event, { projectId, midiPath }) => {
  try {
    if (!projectId || !midiPath) throw new Error('Missing parameters');
    if (!libraryService || !libraryService.parseMidiAndSaveForProject) {
      // Fallback: use midiParser directly and save
      const parser = await ensureMidiParser();
      if (!parser) throw new Error('MidiParser not available');
      const res = parser.parseMidiToLinearAnalysis
        ? parser.parseMidiToLinearAnalysis(midiPath)
        : await parser.parseMidiFileToLinear(midiPath);
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
        database.run('UPDATE Projects SET analysis_id = ? WHERE id = ?', [analysisId, projectId]);
      return { success: true, analysisId, fileHash };
    }
    const p = await libraryService.parseMidiAndSaveForProject(projectId, midiPath);
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

registerIpcHandler('DB:GET_SETTINGS', async (event) => {
  try {
    const settings = db.getSettings();
    return { success: true, settings: settings || {} };
  } catch (error) {
    logger.error('Error getting settings:', error);
    return { success: false, error: error.message };
  }
});

registerIpcHandler('DB:SET_SETTING', async (event, { key, value }) => {
  try {
    const result = db.setSetting(key, value);
    if (result.success) {
      // If setting is a port, update OSC clients if needed
      if (key === 'reaper_port' || key === 'ableton_port') {
        const settings = db.getSettings();
        const reaperPort = parseInt(settings.reaper_port || '9000');
        const abletonPort = parseInt(settings.ableton_port || '9001');
        oscClients.reaper = new osc.Client('127.0.0.1', reaperPort);
        oscClients.ableton = new osc.Client('127.0.0.1', abletonPort);
      }
    }
    return result;
  } catch (error) {
    logger.error('Error setting setting:', error);
    return { success: false, error: error.message };
  }
});

registerIpcHandler('TRACK:RESOLVE_INDEX', async (event, trackName) => {
  return trackResolver.getTrackIndex(trackName);
});

registerIpcHandler('OSC:SEND_TRANSPORT', async (event, command) => {
  const reaperMessage = oscBuilder.sendReaperTransport(command);
  const abletonMessage = oscBuilder.sendAbletonTransport(command);

  oscClients.reaper.send(reaperMessage.address, ...reaperMessage.args.map((a) => a.value));
  oscClients.ableton.send(abletonMessage.address, ...abletonMessage.args.map((a) => a.value));
});

ipcMain.on('NETWORK:SEND_MACRO', (event, { macro, payload }) => {
  if (macro === 'MACRO_PLAY') {
    status.isPlaying = !status.isPlaying;
    const command = status.isPlaying ? 'play' : 'stop';
    const reaperMessage = oscBuilder.sendReaperTransport(command);
    const abletonMessage = oscBuilder.sendAbletonTransport(command);

    oscClients.reaper.send(reaperMessage.address, ...reaperMessage.args.map((a) => a.value));
    oscClients.ableton.send(abletonMessage.address, ...abletonMessage.args.map((a) => a.value));
    broadcastStatus();
  } else {
    if (!payload || !payload.macroId) {
      logger.error('Invalid payload for NETWORK:SEND_MACRO');
      return;
    }
    sendMacro(payload.macroId);
  }
});

ipcMain.on('UI:REQUEST_STATUS', (event) => {
  broadcastStatus();
});

// Track last request time to prevent rapid-fire requests
let lastInitialRequestTime = 0;
const INITIAL_REQUEST_THROTTLE_MS = 2000; // Only allow one request per 2 seconds

ipcMain.on('UI:REQUEST_INITIAL', (event) => {
  const now = Date.now();
  // Throttle requests to prevent spam
  if (now - lastInitialRequestTime < INITIAL_REQUEST_THROTTLE_MS) {
    // Silently ignore rapid repeated requests
    return;
  }
  lastInitialRequestTime = now;

  // Send current blocks if any exist, ensuring they have complete data
  if (currentBlocks.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
    const completeBlocks = currentBlocks.map(ensureBlockData);
    logger.debug('UI:REQUEST_INITIAL: Sending', completeBlocks.length, 'existing blocks');
    mainWindow.webContents.send('UI:BLOCKS_UPDATE', completeBlocks);
    // Only broadcast status if we actually sent blocks
    broadcastStatus();
  } else {
    // Silently handle no blocks case - this is normal when no analysis has been run yet
    // Don't log or broadcast to avoid unnecessary UI updates
  }
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
    logger.error('Error in DIALOG:SHOW_OPEN:', error);
    return { canceled: true, filePaths: [], error: error.message };
  }
});

// Helper: start full analysis (used by ANALYSIS:START and by LIBRARY:RE_ANALYZE)
async function startFullAnalysis(filePath, userHints = {}, projectId = null) {
  const startTime = Date.now();
  logger.info('=== startFullAnalysis START ===');
  logger.info('File path:', filePath);
  try {
    // Validate and run the same code path as ANALYSIS:START
    const fs = require('fs');
    if (!filePath || typeof filePath !== 'string') throw new Error('Invalid file path');
    if (!fs.existsSync(filePath)) throw new Error('File does not exist: ' + filePath);

    // NOTE: Required at top of file for early failure detection

    // Load calibrated engine config (from engine-config.json)
    let engineConfigData = null;
    if (engineConfig && engineConfig.loadConfig) {
      try {
        engineConfigData = engineConfig.loadConfig();
        logger.info('Loaded calibrated engine config');
      } catch (e) {
        logger.warn('Failed to load engine config, using defaults:', e.message);
      }
    }

    // Load Analysis Lab parameters from DB settings (if available)
    // These override the calibrated config if set by user
    const dbSettings = db.getSettings();
    const analysisLabSettings = {
      // Harmony parameters - prefer DB settings, then calibrated, then defaults
      transitionProb:
        parseFloat(dbSettings.analysis_transitionProb) ||
        engineConfigData?.chordOptions?.transitionProb ||
        0.8,
      diatonicBonus:
        parseFloat(dbSettings.analysis_diatonicBonus) ||
        engineConfigData?.chordOptions?.diatonicBonus ||
        0.1,
      rootPeakBias:
        parseFloat(dbSettings.analysis_rootPeakBias) ||
        engineConfigData?.chordOptions?.rootPeakBias ||
        0.1,
      temperature:
        parseFloat(dbSettings.analysis_temperature) ||
        engineConfigData?.chordOptions?.temperature ||
        0.1,
      globalKey: dbSettings.analysis_globalKey || engineConfigData?.chordOptions?.globalKey || null,
      // Structure parameters (V1) - prefer DB settings, then calibrated, then defaults
      noveltyKernel:
        parseInt(dbSettings.analysis_noveltyKernel) ||
        engineConfigData?.architectOptions?.noveltyKernel ||
        5,
      sensitivity:
        parseFloat(dbSettings.analysis_sensitivity) ||
        engineConfigData?.architectOptions?.sensitivity ||
        0.6,
      mergeChromaThreshold:
        parseFloat(dbSettings.analysis_mergeChromaThreshold) ||
        engineConfigData?.architectOptions?.mergeChromaThreshold ||
        0.92,
      minSectionDurationSec:
        parseFloat(dbSettings.analysis_minSectionDurationSec) ||
        engineConfigData?.architectOptions?.minSectionDurationSec ||
        8.0,
      forceOverSeg:
        dbSettings.analysis_forceOverSeg === 'true'
          ? true
          : dbSettings.analysis_forceOverSeg === 'false'
            ? false
            : engineConfigData?.architectOptions?.forceOverSeg || false,
      // Structure parameters (V2) - prefer DB settings, then calibrated, then defaults
      detailLevel:
        parseFloat(dbSettings.analysis_detailLevel) ||
        engineConfigData?.architectOptions?.detailLevel ||
        0.5,
      adaptiveSensitivity:
        parseFloat(dbSettings.analysis_adaptiveSensitivity) ||
        engineConfigData?.architectOptions?.adaptiveSensitivity ||
        1.5,
      mfccWeight:
        parseFloat(dbSettings.analysis_mfccWeight) ||
        engineConfigData?.architectOptions?.mfccWeight ||
        0.5,
    };

    // Override with userHints if provided
    const harmonyOpts = {
      transitionProb: userHints.transitionProb ?? analysisLabSettings.transitionProb,
      diatonicBonus: userHints.diatonicBonus ?? analysisLabSettings.diatonicBonus,
      rootPeakBias: userHints.rootPeakBias ?? analysisLabSettings.rootPeakBias,
      temperature: userHints.temperature ?? analysisLabSettings.temperature,
      globalKey: userHints.globalKey ?? analysisLabSettings.globalKey ?? userHints.key_hint,
    };

    // Pass 0: Metadata Lookup
    const metadata = await metadataLookup.gatherMetadata(filePath, userHints);
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
      harmonyOpts, // Pass harmony options to listener
    );
    if (!result || !result.linear_analysis) throw new Error('Pass 1 returned invalid result');

    const linear_analysis = result.linear_analysis;
    // Ensure metadata includes ID3 tags (artist, title) for lyrics display
    if (metadata.title && !linear_analysis.metadata.title) {
      linear_analysis.metadata.title = metadata.title;
    }
    if (metadata.artist && !linear_analysis.metadata.artist) {
      linear_analysis.metadata.artist = metadata.artist;
    }
    if (metadata.album && !linear_analysis.metadata.album) {
      linear_analysis.metadata.album = metadata.album;
    }
    session.setResult('pass1', linear_analysis);
    // color intentionally omitted; UI controls theme mapping
    tracker.broadcast();

    // Pass 2: Architect
    session.setState('pass2');
    tracker.update('pass2', 0);
    tracker.broadcast();

    // Use Analysis Lab parameters for architect (with fallback defaults)
    const architectOptions = {
      downsampleFactor: userHints.downsampleFactor ?? 4,
      forceOverSeg: userHints.forceOverSeg ?? analysisLabSettings.forceOverSeg ?? false,
      noveltyKernel: userHints.noveltyKernel ?? analysisLabSettings.noveltyKernel ?? 5,
      sensitivity: userHints.sensitivity ?? analysisLabSettings.sensitivity ?? 0.6,
      mergeChromaThreshold:
        userHints.mergeChromaThreshold ?? analysisLabSettings.mergeChromaThreshold ?? 0.92,
      minSectionDurationSec:
        userHints.minSectionDurationSec ?? analysisLabSettings.minSectionDurationSec ?? 8.0,
      // V1 fallback options
      exactChromaThreshold: 0.99,
      exactMfccThreshold: 0.95,
      progressionSimilarityThreshold: 0.95,
      progressionSimilarityMode: 'normalized',
      minSectionsStop: 20,
    };
    logger.debug('Applying Architect Config from Analysis Lab:', architectOptions);

    // Map to V2 adaptive parameters
    const computeScaleWeights = (detailLevel) => {
      const phraseW = Math.max(0.2, Math.min(0.8, detailLevel));
      const movementW = 1 - phraseW - 0.2;
      return { phrase: phraseW, section: 0.2, movement: Math.max(0.05, movementW) };
    };

    const v2Options = {
      downsampleFactor: architectOptions.downsampleFactor,
      adaptiveSensitivity:
        userHints.adaptiveSensitivity ?? analysisLabSettings.adaptiveSensitivity ?? 1.5,
      scaleWeights: userHints.scaleWeights ?? computeScaleWeights(analysisLabSettings.detailLevel),
      mfccWeight: userHints.mfccWeight ?? analysisLabSettings.mfccWeight ?? 0.5,
      forceOverSeg: architectOptions.forceOverSeg,
    };

    // V2 enabled by default when available; set USE_ARCHITECT_V2=0 to force legacy
    const useV2 = !!architectV2 && process.env.USE_ARCHITECT_V2 !== '0';
    const architectVersion = useV2 ? 'V2 (Multi-Scale + Adaptive)' : 'V1 (Canonical)';
    logger.debug(
      `Using Architect ${architectVersion}${process.env.USE_ARCHITECT_V2 === '0' ? ' (forced via USE_ARCHITECT_V2=0)' : ''}`,
    );
    const structural_map = await (
      useV2 ? architectV2.analyzeStructure : architect.analyzeStructure
    )(
      linear_analysis,
      (p) => {
        tracker.update('pass2', typeof p === 'object' && p.progress !== undefined ? p.progress : p);
        tracker.broadcast();
      },
      useV2 ? v2Options : architectOptions,
    );
    if (!structural_map || !structural_map.sections)
      throw new Error('Pass 2 returned invalid result');
    session.setResult('pass2', structural_map);
    tracker.update('pass2', 100);
    tracker.broadcast();

    // Store fileHash globally for AnalysisTuner access
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`window.__lastAnalysisHash = '${fileHash}';`);
    }

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
        primary_key: linear_analysis.metadata?.detected_key || metadata.key_hint || 'C',
        mode: linear_analysis.metadata?.detected_mode || metadata.mode_hint || 'ionian',
        confidence: 0.8,
      },
      modulations: [],
      borrowed_chords: [],
      genre_profile: {
        detected_genre: metadata.genre_hint || 'pop',
        confidence: 0.7,
        genre_constraints: genreProfiles.getGenreProfile(metadata.genre_hint || 'pop'),
      },
      functional_summary: {},
    };

    // Save analysis (CRITICAL: Use corrected_structural_map from Pass 3, not original structural_map)
    logger.info('Saving analysis with file_path:', filePath);
    const analysisId = db.saveAnalysis({
      file_path: filePath,
      file_hash: fileHash,
      metadata,
      linear_analysis,
      structural_map: corrected_structural_map, // Using Pass 3 corrected output
      arrangement_flow,
      harmonic_context,
      polyrhythmic_layers: [],
    });
    logger.info('Analysis saved with ID:', analysisId, 'file_path:', filePath);
    if (projectId && analysisId) {
      const database = db.getDb();
      database &&
        database.run &&
        database.run('UPDATE Projects SET analysis_id = ? WHERE id = ?', [analysisId, projectId]);
    }

    tracker.complete();
    const endTime = Date.now();
    logger.info(
      `=== startFullAnalysis COMPLETE (${((endTime - startTime) / 1000).toFixed(2)}s) ===`,
    );
    return { success: true, analysisId, fileHash };
  } catch (err) {
    logger.error('startFullAnalysis error:', err);
    return { success: false, error: err.message || String(err) };
  }
}

// Analysis IPC Handlers

registerIpcHandler('ANALYSIS:START', async (event, { filePath, userHints = {} }) => {
  return await startFullAnalysis(filePath, userHints, null);
});

registerIpcHandler('ANALYSIS:GET_STATUS', async (event, fileHash) => {
  const session = sessionManager.getSession(fileHash);
  if (session) {
    return session.toJSON();
  }
  return null;
});

registerIpcHandler('ANALYSIS:GET_RESULT', async (event, fileHash) => {
  logger.debug('IPC: ANALYSIS:GET_RESULT called for fileHash:', fileHash);

  // Check preview cache first (for uncommitted changes)
  if (previewAnalysisCache.has(fileHash)) {
    const cached = previewAnalysisCache.get(fileHash);
    logger.debug('IPC: Returning cached preview analysis with:', {
      id: cached.id,
      hasLinearAnalysis: !!cached.linear_analysis,
      hasStructuralMap: !!cached.structural_map,
      hasFilePath: !!cached.file_path,
      filePath: cached.file_path,
      sectionCount: cached.structural_map?.sections?.length || 0,
      eventCount: cached.linear_analysis?.events?.length || 0,
      source: 'preview_cache',
    });
    return cached;
  }

  // Otherwise, read from database - but exclude large arrays for performance
  const analysis = db.getAnalysis(fileHash);

  if (analysis) {
    // Create a lightweight version excluding large arrays
    const lightweightAnalysis = {
      ...analysis,
      linear_analysis: analysis.linear_analysis
        ? {
            ...analysis.linear_analysis,
            // Exclude large arrays - they can be fetched separately
            chroma_frames: undefined,
            mfcc_frames: undefined,
            events: analysis.linear_analysis.events?.slice(0, 100) || [], // Include first 100 events for UI
            _hasLargeArrays: true, // Flag indicating lazy loading is available
          }
        : undefined,
    };

    logger.debug('IPC: Returning lightweight analysis with:', {
      id: analysis.id,
      hasLinearAnalysis: !!analysis.linear_analysis,
      hasStructuralMap: !!analysis.structural_map,
      hasFilePath: !!analysis.file_path,
      filePath: analysis.file_path,
      sectionCount: analysis.structural_map?.sections?.length || 0,
      eventCount: analysis.linear_analysis?.events?.length || 0,
      source: 'database (lightweight)',
    });
  } else {
    logger.warn('IPC: No analysis found for fileHash:', fileHash);
  }

  return analysis;
});

// Lazy loading handlers for large analysis data
registerIpcHandler('ANALYSIS:GET_CHROMA_FRAMES', async (event, fileHash) => {
  logger.debug('IPC: ANALYSIS:GET_CHROMA_FRAMES called for fileHash:', fileHash);

  // Check preview cache first
  if (previewAnalysisCache.has(fileHash)) {
    const cached = previewAnalysisCache.get(fileHash);
    return cached?.linear_analysis?.chroma_frames || [];
  }

  // Get from database
  const analysis = db.getAnalysis(fileHash);
  return analysis?.linear_analysis?.chroma_frames || [];
});

registerIpcHandler('ANALYSIS:GET_MFCC_FRAMES', async (event, fileHash) => {
  logger.debug('IPC: ANALYSIS:GET_MFCC_FRAMES called for fileHash:', fileHash);

  // Check preview cache first
  if (previewAnalysisCache.has(fileHash)) {
    const cached = previewAnalysisCache.get(fileHash);
    return cached?.linear_analysis?.mfcc_frames || [];
  }

  // Get from database
  const analysis = db.getAnalysis(fileHash);
  return analysis?.linear_analysis?.mfcc_frames || [];
});

registerIpcHandler(
  'ANALYSIS:GET_EVENTS',
  async (event, fileHash, { offset = 0, limit = null } = {}) => {
    logger.debug(
      'IPC: ANALYSIS:GET_EVENTS called for fileHash:',
      fileHash,
      'offset:',
      offset,
      'limit:',
      limit,
    );

    // Check preview cache first
    if (previewAnalysisCache.has(fileHash)) {
      const cached = previewAnalysisCache.get(fileHash);
      const events = cached?.linear_analysis?.events || [];
      if (limit) {
        return events.slice(offset, offset + limit);
      }
      return events.slice(offset);
    }

    // Get from database
    const analysis = db.getAnalysis(fileHash);
    const events = analysis?.linear_analysis?.events || [];
    if (limit) {
      return events.slice(offset, offset + limit);
    }
    return events.slice(offset);
  },
);

// Debug handler to check file path resolution
registerIpcHandler('DEBUG:CHECK_FILE_PATH', async (event, fileHash) => {
  try {
    const analysis = db.getAnalysis(fileHash);
    return {
      fileHash,
      filePath: analysis?.file_path,
      exists: analysis?.file_path ? fs.existsSync(analysis.file_path) : false,
      hasAnalysis: !!analysis,
    };
  } catch (error) {
    return {
      fileHash,
      error: error.message,
      exists: false,
      hasAnalysis: false,
    };
  }
});

registerIpcHandler('LYRICS:GET', async (event, { artist, title, album, duration }) => {
  try {
    const { fetchLyrics, parseLRC } = require('./services/lyrics');

    // Validate inputs
    if (!artist || !title) {
      return { success: false, error: 'Artist and Title are required' };
    }

    logger.debug(`[IPC] LYRICS:GET for "${title}" by "${artist}"`);

    // Pass all metadata to the service
    const lyricsData = await fetchLyrics(artist, title, album, duration);

    if (!lyricsData) {
      return { success: false, error: 'Lyrics not found' };
    }

    // Parse synced lyrics if available
    const parsed = parseLRC(lyricsData.synced);

    return {
      success: true,
      lyrics: {
        ...lyricsData,
        parsed, // This is the array [{time: 12.5, text: "..."}] the UI needs
      },
    };
  } catch (error) {
    logger.error('[IPC] LYRICS:GET Failed:', error);
    return { success: false, error: error.message };
  }
});

registerIpcHandler('LIBRARY:READ_LYRICS', async (event, { path: lyricsPath }) => {
  try {
    if (!lyricsPath || !fs.existsSync(lyricsPath)) {
      return { success: false, error: 'Lyrics file not found' };
    }
    const content = fs.readFileSync(lyricsPath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message || String(error) };
  }
});

registerIpcHandler('ANALYSIS:PARSE_MIDI', async (event, payload) => {
  try {
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
    const parser = await ensureMidiParser();
    if (!parser) throw new Error('No midi parser available');
    let res;
    if (parser.parseMidiFileToLinear) {
      res = await parser.parseMidiFileToLinear(midiPath);
    } else if (parser.parseMidiToLinearAnalysis) {
      res = parser.parseMidiToLinearAnalysis(midiPath);
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
      database.run('UPDATE Projects SET analysis_id = ? WHERE id = ?', [analysisId, projectId]);
    return { success: true, analysisId, fileHash };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

// Fast re-calculation of chord events for an existing analysis (no Python)
registerIpcHandler('ANALYSIS:RECALC_CHORDS', async (event, { fileHash, options = {} }) => {
  try {
    if (!fileHash) throw new Error('fileHash required');
    const analysis = db.getAnalysis(fileHash);
    if (!analysis || !analysis.linear_analysis) throw new Error('Analysis not found');
    // Try to invoke listener's recalcChords if available
    if (listener && listener.recalcChords) {
      // Add detection options + globalKey to metadata so chord analyzer can pick it up
      const cloned = JSON.parse(JSON.stringify(analysis.linear_analysis));
      // Pass structuralMap if available for section-based key bias
      const structuralMap = analysis.structural_map || null;
      if (!cloned.metadata) cloned.metadata = {};
      const opt = options || {};

      // Load calibrated parameters from engineConfig as defaults
      let calibratedChordOptions = {};
      try {
        if (engineConfig) {
          // Try to get loadConfig function from engineConfig module
          let loadConfigFn = null;
          if (typeof engineConfig.loadConfig === 'function') {
            loadConfigFn = engineConfig.loadConfig;
          } else if (
            engineConfig.default &&
            typeof engineConfig.default.loadConfig === 'function'
          ) {
            loadConfigFn = engineConfig.default.loadConfig;
          } else if (typeof engineConfig.default === 'function') {
            // If default is the loadConfig function itself
            loadConfigFn = engineConfig.default;
          }

          if (loadConfigFn) {
            const config = loadConfigFn();
            calibratedChordOptions = config.chordOptions || {};
            logger.debug('[RECALC_CHORDS] Using calibrated parameters:', calibratedChordOptions);
          } else {
            logger.debug(
              '[RECALC_CHORDS] engineConfig available but loadConfig not found, using UI defaults',
            );
          }
        }
      } catch (err) {
        logger.warn('[RECALC_CHORDS] Failed to load engineConfig:', err.message);
      }

      // Merge: UI options override calibrated defaults
      const mergedOptions = {
        globalKey:
          opt.globalKey ||
          calibratedChordOptions.globalKey ||
          analysis.harmonic_context?.global_key?.primary_key ||
          cloned.metadata.detected_key,
        temperature: opt.temperature ?? calibratedChordOptions.temperature ?? 0.1,
        transitionProb: opt.transitionProb ?? calibratedChordOptions.transitionProb ?? 0.8,
        diatonicBonus: opt.diatonicBonus ?? calibratedChordOptions.diatonicBonus ?? 0.1,
        rootPeakBias: opt.rootPeakBias ?? calibratedChordOptions.rootPeakBias ?? 0.1,
        windowShift: opt.windowShift ?? 0, // Window shift in seconds (-0.05 to +0.05)
        bassWeight: opt.bassWeight ?? 0, // Bass weight for inversion detection (0-1)
        frameHop:
          cloned.metadata?.frame_hop_seconds ||
          cloned.metadata?.hop_length / cloned.metadata?.sample_rate ||
          0.0232,
        rootOnly: opt.rootOnly === undefined ? true : !!opt.rootOnly,
        structuralMap: structuralMap, // Pass structural map for section-based key bias
      };
      if (mergedOptions.globalKey) {
        cloned.metadata.detected_key = mergedOptions.globalKey;
        cloned.metadata.detected_mode = cloned.metadata.detected_mode || 'major';
        cloned.metadata.user_override_key = mergedOptions.globalKey;
      }
      const res = listener.recalcChords(cloned, mergedOptions);
      if (!res || !res.success) throw new Error(res?.error || 'recalc failed');

      // Apply changes to analysis object (in-memory) for preview OR commit
      const updatedAnalysis = JSON.parse(JSON.stringify(analysis)); // Deep clone
      updatedAnalysis.linear_analysis.events = res.events;
      // Update the harmonic_context if globalKey overridden
      if (mergedOptions.globalKey) {
        updatedAnalysis.harmonic_context = updatedAnalysis.harmonic_context || {};
        updatedAnalysis.harmonic_context.global_key =
          updatedAnalysis.harmonic_context.global_key || {};
        updatedAnalysis.harmonic_context.global_key.primary_key = mergedOptions.globalKey;
        updatedAnalysis.harmonic_context.global_key.confidence =
          updatedAnalysis.harmonic_context.global_key.confidence || 0.95;
      }
      // Persist chosen analyzer tuning into harmonic_context for transparency
      updatedAnalysis.harmonic_context = updatedAnalysis.harmonic_context || {};
      updatedAnalysis.harmonic_context.chord_analyzer_options =
        updatedAnalysis.harmonic_context.chord_analyzer_options || {};
      updatedAnalysis.harmonic_context.chord_analyzer_options = {
        ...(updatedAnalysis.harmonic_context.chord_analyzer_options || {}),
        ...(mergedOptions || {}),
      };

      if (options.commit) {
        // Save Analysis Lab settings to DB so they persist for future analyses
        if (opt.transitionProb !== undefined) {
          db.setSetting('analysis_transitionProb', opt.transitionProb);
        }
        if (opt.diatonicBonus !== undefined) {
          db.setSetting('analysis_diatonicBonus', opt.diatonicBonus);
        }
        if (opt.rootPeakBias !== undefined) {
          db.setSetting('analysis_rootPeakBias', opt.rootPeakBias);
        }
        if (opt.temperature !== undefined) {
          db.setSetting('analysis_temperature', opt.temperature);
        }
        if (opt.globalKey) {
          db.setSetting('analysis_globalKey', opt.globalKey);
        }
        logger.info('[RECALC_CHORDS] Saved Analysis Lab settings to DB');

        // Persist changes to DB by updating the analysis row
        const success = db.updateAnalysisById(updatedAnalysis.id, updatedAnalysis);
        if (!success) throw new Error('Failed to commit analysis update');
        // Clear preview cache since changes are now in DB
        previewAnalysisCache.delete(fileHash);
        logger.info('Chord recalculation committed to database');
      } else {
        // Preview mode: store in cache so ANALYSIS:GET_RESULT can return it
        previewAnalysisCache.set(fileHash, updatedAnalysis);
        logger.info('Chord recalculation applied in preview mode (cached, not committed)');
      }

      // Trigger UI update by reloading analysis
      // For preview mode, we need to reload the analysis so Sandbox view sees updated chords
      // Even though we don't commit to DB, the in-memory analysis object is updated
      try {
        // Reload analysis to Architect (this will use the updated in-memory analysis)
        // The analysis object in memory now has the updated events
        if (mainWindow && !mainWindow.isDestroyed()) {
          // Send a signal to reload the analysis
          mainWindow.webContents.send('ANALYSIS:RELOAD_REQUESTED', { fileHash });
          logger.debug('Requested analysis reload for preview');
        }
      } catch (loadErr) {
        logger.warn('Failed to request reload:', loadErr.message);
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
      if (!analysis || !analysis.linear_analysis) throw new Error('Analysis not found');
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

// Apply section sculpting parameters in real-time
registerIpcHandler(
  'ANALYSIS:SCULPT_SECTION',
  async (event, { fileHash, sectionId, parameters = {}, commit = false }) => {
    try {
      if (!fileHash || !sectionId) throw new Error('fileHash and sectionId required');

      // Get analysis (from cache if preview, otherwise from DB)
      let analysis = previewAnalysisCache.get(fileHash) || db.getAnalysis(fileHash);
      if (!analysis || !analysis.structural_map || !analysis.structural_map.sections) {
        throw new Error('Analysis not found or invalid');
      }

      // Find the section
      const sections = analysis.structural_map.sections;
      const sectionIndex = sections.findIndex(
        (s) => s.id === sectionId || s.section_id === sectionId,
      );

      if (sectionIndex === -1) {
        throw new Error(`Section ${sectionId} not found`);
      }

      const section = sections[sectionIndex];

      // Clone analysis for modification
      const updatedAnalysis = JSON.parse(JSON.stringify(analysis));
      const updatedSection = updatedAnalysis.structural_map.sections[sectionIndex];

      // Initialize DNA objects if needed
      updatedSection.harmonic_dna = updatedSection.harmonic_dna || {};
      updatedSection.rhythmic_dna = updatedSection.rhythmic_dna || {};

      // Apply parameters to section DNA
      if (parameters.harmonic_complexity !== undefined) {
        updatedSection.harmonic_dna.complexity = parameters.harmonic_complexity;
        updatedSection.harmonic_dna.complexity_level =
          parameters.harmonic_complexity <= 30
            ? 'basic'
            : parameters.harmonic_complexity <= 60
              ? 'extended'
              : parameters.harmonic_complexity <= 85
                ? 'complex'
                : 'neo-soul';
      }

      if (parameters.rhythmic_density !== undefined) {
        updatedSection.rhythmic_dna.density = parameters.rhythmic_density;
        updatedSection.rhythmic_dna.density_level =
          parameters.rhythmic_density <= 25
            ? 'sparse'
            : parameters.rhythmic_density <= 50
              ? 'moderate'
              : parameters.rhythmic_density <= 75
                ? 'dense'
                : 'very_dense';
      }

      if (parameters.groove_swing !== undefined) {
        updatedSection.rhythmic_dna.groove_swing = parameters.groove_swing;
        updatedSection.rhythmic_dna.swing_ratio =
          parameters.groove_swing === 0
            ? 1.0
            : parameters.groove_swing <= 33
              ? 1.2
              : parameters.groove_swing <= 66
                ? 1.5
                : parameters.groove_swing <= 85
                  ? 1.7
                  : 2.0;
      }

      if (parameters.tension !== undefined) {
        updatedSection.harmonic_dna.tension = parameters.tension;
        updatedSection.harmonic_dna.tension_level =
          parameters.tension <= 30
            ? 'diatonic'
            : parameters.tension <= 60
              ? 'chromatic'
              : parameters.tension <= 85
                ? 'tritone_sub'
                : 'altered';
      }

      // Store sculpting parameters in section metadata
      updatedSection.sculpting_parameters = {
        ...(updatedSection.sculpting_parameters || {}),
        ...parameters,
        last_updated: new Date().toISOString(),
      };

      if (commit) {
        // Persist to database
        const success = db.updateAnalysisById(updatedAnalysis.id, updatedAnalysis);
        if (!success) throw new Error('Failed to commit section update');
        previewAnalysisCache.delete(fileHash); // Clear cache
        logger.info('Section sculpting committed to database');
      } else {
        // Preview mode: store in cache
        previewAnalysisCache.set(fileHash, updatedAnalysis);
        logger.info('Section sculpting applied in preview mode (cached)');
      }

      // Trigger UI reload
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ANALYSIS:RELOAD_REQUESTED', { fileHash });
        }
      } catch (loadErr) {
        logger.warn('Failed to request reload:', loadErr.message);
      }

      return {
        success: true,
        section: updatedSection,
        commit: commit || false,
      };
    } catch (err) {
      logger.error('[ANALYSIS:SCULPT_SECTION] Error:', err);
      return { success: false, error: err.message || String(err) };
    }
  },
);

// Re-segment the structure (fast-ish) by re-running architect + theorist on existing linear_analysis
registerIpcHandler(
  'ANALYSIS:RESEGMENT',
  async (event, { fileHash, options = {}, commit = false }) => {
    try {
      if (!fileHash) throw new Error('fileHash required');
      const analysis = db.getAnalysis(fileHash);
      if (!analysis || !analysis.linear_analysis) throw new Error('Analysis not found');
      // merge defaults with provided options
      const useV2 = options.version === 'v2' && architectV2;
      const architectOptions = useV2
        ? {
            downsampleFactor: options.downsampleFactor || 4,
            adaptiveSensitivity: options.adaptiveSensitivity || 1.5,
            scaleWeights: options.scaleWeights || null,
            mfccWeight: options.mfccWeight,
            forceOverSeg: options.forceOverSeg === undefined ? false : !!options.forceOverSeg,
            clusterSimilarity: options.clusterSimilarity || 0.6,
          }
        : {
            downsampleFactor: options.downsampleFactor || 4,
            forceOverSeg: options.forceOverSeg === undefined ? false : !!options.forceOverSeg,
            noveltyKernel: options.noveltyKernel || 5,
            sensitivity: options.sensitivity || 0.6,
            mergeChromaThreshold: options.mergeChromaThreshold || 0.92,
            minSectionDurationSec: options.minSectionDurationSec || 8.0,
          };
      const structural_map = await (
        useV2 ? architectV2.analyzeStructure : architect.analyzeStructure
      )(analysis.linear_analysis, (p) => {}, architectOptions);
      if (!structural_map) throw new Error('architect failed');
      const corrected = await theorist.correctStructuralMap(
        structural_map,
        analysis.linear_analysis,
        analysis.metadata || {},
        (p) => {},
      );
      if (commit) {
        // Save Analysis Lab settings to DB so they persist for future analyses
        if (options.adaptiveSensitivity !== undefined) {
          db.setSetting('analysis_adaptiveSensitivity', options.adaptiveSensitivity);
        }
        if (options.mfccWeight !== undefined) {
          db.setSetting('analysis_mfccWeight', options.mfccWeight);
        }
        if (options.detailLevel !== undefined) {
          db.setSetting('analysis_detailLevel', options.detailLevel);
        }
        if (options.scaleWeights) {
          // Store detailLevel instead of scaleWeights (it's derived from detailLevel)
          // The detailLevel should already be set above, but we can compute it if needed
        }
        // V1 parameters
        if (options.noveltyKernel !== undefined) {
          db.setSetting('analysis_noveltyKernel', options.noveltyKernel);
        }
        if (options.sensitivity !== undefined) {
          db.setSetting('analysis_sensitivity', options.sensitivity);
        }
        if (options.mergeChromaThreshold !== undefined) {
          db.setSetting('analysis_mergeChromaThreshold', options.mergeChromaThreshold);
        }
        if (options.minSectionDurationSec !== undefined) {
          db.setSetting('analysis_minSectionDurationSec', options.minSectionDurationSec);
        }
        if (options.forceOverSeg !== undefined) {
          db.setSetting('analysis_forceOverSeg', options.forceOverSeg ? 'true' : 'false');
        }
        logger.info('[RESEGMENT] Saved Analysis Lab settings to DB');

        analysis.structural_map = corrected;
        const success = db.updateAnalysisById(analysis.id, analysis);
        if (!success) throw new Error('Failed to commit resegment');
      }
      return { success: true, structural_map: corrected, debug: structural_map.debug || null };
    } catch (err) {
      return { success: false, error: err.message || String(err) };
    }
  },
);

// Generate structure from constraints (Sandbox Mode)
registerIpcHandler('SANDBOX:GENERATE', async (event, constraints) => {
  try {
    logger.debug('[SANDBOX] Generating structure with constraints:', constraints);
    const structuralMap = structureGenerator.generateStructure(constraints);

    // Convert to blocks format
    const blocks = structuralMap.sections.map((section, index) => {
      const duration = section.time_range
        ? section.time_range.end_time - section.time_range.start_time
        : 16;
      const bars = Math.max(1, Math.round(duration / 2));

      return ensureBlockData({
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
      });
    });

    logger.info('[SANDBOX] ✅ Generated', blocks.length, 'sections');

    // Store blocks for persistence
    currentBlocks = blocks;

    // Send blocks to UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('UI:BLOCKS_UPDATE', blocks);
    }

    return { success: true, blocks, structuralMap };
  } catch (error) {
    logger.error('SANDBOX: Error generating structure:', error);
    return { success: false, error: error.message };
  }
});

registerIpcHandler('LIBRARY:PROMOTE_TO_BENCHMARK', async (event, { projectId }) => {
  try {
    if (!libraryService || !libraryService.promoteToBenchmark) {
      throw new Error('Library service not available');
    }
    const result = await libraryService.promoteToBenchmark(projectId);
    return result;
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

registerIpcHandler('LIBRARY:RE_ANALYZE', async (event, { projectId, force = false }) => {
  try {
    if (!projectId) throw new Error('Missing projectId');
    const project = db.getProjectById(projectId);
    if (!project) throw new Error('Project not found');
    if (!project.audio_path) throw new Error('Project has no audio path to re-analyze');
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
});

// Batch import handlers
registerIpcHandler('LIBRARY:SCAN_DIRECTORY', async () => {
  try {
    let batchImporter = null;
    try {
      require('ts-node').register({ transpileOnly: true });
      const bi = require('./services/batchImporter.ts');
      batchImporter = bi && bi.default ? bi.default : bi;
    } catch (e) {
      const bi = require('./services/batchImporter');
      batchImporter = bi && bi.default ? bi.default : bi;
    }

    if (!batchImporter) throw new Error('Batch importer not available');

    // Use the library directory from the project root
    const projectRoot = path.resolve(__dirname, '..');
    const libraryRoot = path.join(projectRoot, 'library');

    logger.info('[LIBRARY:SCAN_DIRECTORY] Scanning library root:', libraryRoot);
    const { files, datasets } = batchImporter.scanLibraryDirectory(libraryRoot);
    logger.debug(
      '[LIBRARY:SCAN_DIRECTORY] Found',
      files.length,
      'files across',
      Object.keys(datasets).length,
      'datasets',
    );
    logger.debug(
      '[LIBRARY:SCAN_DIRECTORY] Audio files:',
      files.filter((f) => f.type === 'audio').length,
    );

    const matched = batchImporter.matchFiles(files);
    logger.info('[LIBRARY:SCAN_DIRECTORY] Matched', matched.length, 'groups');
    const stats = batchImporter.getDatasetStats(libraryRoot);

    return {
      success: true,
      files: files.length,
      matched: matched.length,
      datasets: Object.keys(datasets).length,
      datasetStats: stats,
      matchedGroups: matched.slice(0, 100), // Limit to first 100 for preview
    };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});

registerIpcHandler('LIBRARY:BATCH_IMPORT', async (event, { groups, options = {} }) => {
  try {
    if (!groups || !Array.isArray(groups)) {
      throw new Error('Missing groups array');
    }

    const userDataPath = app.getPath('userData');
    const results = [];
    const errors = [];

    for (const group of groups) {
      try {
        // Only import groups with audio files (or JSON for reference datasets)
        if (!group.audio && !group.json) {
          logger.debug('[BATCH_IMPORT] Skipping group without audio or json:', group);
          continue;
        }

        // Verify audio file exists if provided
        if (group.audio?.path && !fs.existsSync(group.audio.path)) {
          logger.warn('[BATCH_IMPORT] Audio file not found:', group.audio.path);
          errors.push({ group, error: `Audio file not found: ${group.audio.path}` });
          continue;
        }

        // Copy lyrics file if present
        let lyricsPath = null;
        if (group.lyrics?.path && fs.existsSync(group.lyrics.path)) {
          try {
            const { randomUUID } = require('crypto');
            const uuid = randomUUID();
            lyricsPath = libraryService.copyFileToLibrary(
              userDataPath,
              group.lyrics.path,
              'lyrics',
              uuid,
            );
            logger.debug('[BATCH_IMPORT] Copied lyrics file:', lyricsPath);
          } catch (lyricsErr) {
            logger.warn('[BATCH_IMPORT] Failed to copy lyrics file:', lyricsErr);
          }
        }

        const payload = {
          audioPath: group.audio?.path,
          midiPath: group.midi?.path,
          lyricsPath: lyricsPath,
          title:
            group.title ||
            group.audio?.metadata?.title ||
            group.json?.metadata?.title ||
            path.basename(
              group.audio?.path || group.json?.path || '',
              path.extname(group.audio?.path || group.json?.path || ''),
            ),
          artist:
            group.artist || group.audio?.metadata?.artist || group.json?.metadata?.artist || '',
          bpm: group.audio?.metadata?.bpm || group.json?.metadata?.bpm || null,
          key: group.audio?.metadata?.key || group.json?.metadata?.key || null,
          metadata: {
            dataset: group.audio?.dataset || group.json?.dataset,
            hasJson: !!group.json,
            hasMidi: !!group.midi,
            hasLab: !!group.lab,
            hasLyrics: !!group.lyrics,
            confidence: group.confidence,
            jsonMetadata: group.json?.metadata,
            lyricsPath: lyricsPath,
          },
        };

        logger.info(
          '[BATCH_IMPORT] Creating project:',
          payload.title,
          'from',
          payload.audioPath || 'JSON only',
        );
        const result = libraryService.createProject(userDataPath, payload);
        if (result.success) {
          results.push(result);

          // If JSON has pre-analyzed data, create a synthetic analysis
          if (group.json?.metadata && group.json.metadata.sections && options.importPreAnalyzed) {
            try {
              const linearAnalysis = {
                metadata: {
                  duration_seconds:
                    group.json.metadata.sections?.[group.json.metadata.sections.length - 1]
                      ?.end_time || 0,
                  detected_key: group.json.metadata.key || null,
                  bpm: group.json.metadata.bpm || null,
                },
                events: (group.json.metadata.chords || []).map((c) => ({
                  timestamp: c.timestamp || 0,
                  event_type: 'chord',
                  chord: c.chord || c,
                })),
              };

              const structuralMap = {
                sections: (group.json.metadata.sections || []).map((s, idx) => ({
                  section_id: `SECTION_${String.fromCharCode(65 + (idx % 26))}${Math.floor(idx / 26) + 1}`,
                  section_label: s.section_label || 'unknown',
                  section_variant: 1,
                  time_range: {
                    start_time: s.start_time || 0,
                    end_time: s.end_time || 0,
                    duration_bars: (s.end_time - s.start_time) / 2, // Approximate
                  },
                })),
              };

              libraryService.saveAnalysisForProject(
                result.id,
                {
                  ...linearAnalysis,
                  structural_map: structuralMap,
                },
                app,
              );
            } catch (analysisErr) {
              logger.warn('[BatchImport] Failed to create pre-analyzed data:', analysisErr);
            }
          }
        } else {
          errors.push({ group, error: result.error });
        }
      } catch (err) {
        errors.push({ group, error: err.message || String(err) });
      }
    }

    return {
      success: true,
      imported: results.length,
      errors: errors.length,
      results,
      errors: errors.slice(0, 10), // Limit error details
    };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
});
registerIpcHandler('ARCHITECT:UPDATE_BLOCKS', async (event, blocks = []) => {
  try {
    currentBlocks = Array.isArray(blocks) ? blocks : [];
    logger.debug('ARCHITECT:UPDATE_BLOCKS received', currentBlocks.length, 'blocks');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('UI:BLOCKS_UPDATE', currentBlocks);
    }
    return { success: true, count: currentBlocks.length };
  } catch (error) {
    logger.error('ARCHITECT:UPDATE_BLOCKS error:', error);
    return { success: false, error: error.message };
  }
});

// Manual boundary insertion (prototype). Accepts a frame index and echoes back.
registerIpcHandler('ARCHITECT:FORCE_SPLIT', async (event, { frame }) => {
  try {
    if (typeof frame !== 'number' || frame < 0) {
      return { success: false, error: 'Invalid frame index' };
    }
    logger.info('[ARCHITECT:FORCE_SPLIT] Requested manual split at frame', frame);
    // Prototype: In a future version, load current analysis, inject boundary, recompute clusters.
    return { success: true, insertedFrame: frame };
  } catch (error) {
    logger.error('[ARCHITECT:FORCE_SPLIT] Error:', error);
    return { success: false, error: error.message };
  }
});

// Convert analysis results to blocks format for Architect view
registerIpcHandler('ANALYSIS:LOAD_TO_ARCHITECT', async (event, fileHash) => {
  try {
    const analysis = db.getAnalysis(fileHash);
    if (!analysis || !analysis.structural_map || !analysis.structural_map.sections) {
      return { success: false, error: 'Analysis not found or invalid' };
    }

    logger.debug('Converting analysis sections to blocks...');
    logger.debug('Sections found:', analysis.structural_map.sections.length);

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

      logger.debug(`Block ${index}:`, block.id, block.label, block.length, 'bars');
      return block;
    });

    logger.info(`Sending ${blocks.length} blocks to UI...`);

    // Store blocks for persistence
    currentBlocks = blocks;
    logger.debug('Blocks stored in memory:', currentBlocks.length);

    // Send blocks to UI
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('UI:BLOCKS_UPDATE', blocks);
        logger.debug('Blocks sent successfully via UI:BLOCKS_UPDATE');

        // Also send a second time after a small delay to ensure it's received
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('UI:BLOCKS_UPDATE', blocks);
            logger.debug('Blocks re-sent (retry)');
          }
        }, 100);
      } catch (error) {
        logger.error('Error sending blocks:', error);
      }
    } else {
      logger.warn('Main window not available for sending blocks');
    }

    const noveltyCurve =
      analysis.structural_map.debug?.noveltyCurve ||
      analysis.structural_map.debug?.novelty_curve ||
      null;

    // Store fileHash for AnalysisTuner access
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.executeJavaScript(`window.__lastAnalysisHash = '${fileHash}';`);
      } catch (e) {}
    }

    return { success: true, blocks, count: blocks.length, noveltyCurve };
  } catch (error) {
    logger.error('Error loading analysis to Architect:', error);
    return { success: false, error: error.message };
  }
});

// NOTE: Color & styling mapping is handled on the frontend.
// Backend only emits `section_label` and related data.

registerIpcHandler('ANALYSIS:GET_SECTION', async (event, { analysisId, sectionId }) => {
  const sections = db.getAnalysisSections(analysisId);
  return sections.find((s) => s.section_id === sectionId);
});

registerIpcHandler('THEORY:GET_GENRE_PROFILE', async (event, genreName) => {
  return genreProfiles.getGenreProfile(genreName);
});

registerIpcHandler('THEORY:VALIDATE_PROGRESSION', async (event, { chords, key, genre }) => {
  // Validate chord sequence against theory rules
  const genreProfile = genreProfiles.getGenreProfile(genre);
  const keyContext = { primary_key: key, mode: 'ionian' };

  // Simplified validation - would use full theory engine
  return {
    valid: true,
    suggestions: [],
  };
});

registerIpcHandler('ANALYSIS:SET_METADATA', async (event, { fileHash, metadata }) => {
  const session = sessionManager.getSession(fileHash);
  if (session) {
    session.metadata = { ...session.metadata, ...metadata };
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
});

// Calibration handler - uses new optimization service
registerIpcHandler('CALIBRATION:GET_BENCHMARKS', async (event) => {
  try {
    logger.debug('[IPC] CALIBRATION:GET_BENCHMARKS called');

    // Try to load service if not already loaded
    if (!calibrationService) {
      logger.debug('[IPC] CalibrationService not loaded, attempting lazy load...');
      calibrationService = loadCalibrationService();
    }

    if (!calibrationService) {
      const errorMsg =
        'CalibrationService not available. Check terminal for TypeScript compilation errors.';
      logger.error('[IPC]', errorMsg);
      throw new Error(errorMsg);
    }

    logger.debug('[IPC] calibrationService:', calibrationService ? 'exists' : 'null');

    logger.debug(
      '[IPC] calibrationService.getBenchmarks:',
      calibrationService?.getBenchmarks ? 'exists' : 'missing',
    );
    logger.debug(
      '[IPC] Available methods:',
      calibrationService ? Object.keys(calibrationService) : 'N/A',
    );

    if (!calibrationService.getBenchmarks) {
      const errorMsg = `CalibrationService.getBenchmarks not found. Available: ${Object.keys(calibrationService || {}).join(', ')}`;
      logger.error('[IPC]', errorMsg);
      throw new Error(errorMsg);
    }

    const benchmarks = calibrationService.getBenchmarks();
    logger.debug('[IPC] CALIBRATION:GET_BENCHMARKS returning', benchmarks.length, 'benchmarks');
    return { success: true, benchmarks };
  } catch (error) {
    logger.error('[IPC] CALIBRATION:GET_BENCHMARKS error:', error);
    return { success: false, error: error.message || String(error) };
  }
});

registerIpcHandler('CALIBRATION:RUN', async (event, { selectedIds = null }) => {
  try {
    // Try to load service if not already loaded
    if (!calibrationService) {
      logger.debug('[IPC] CalibrationService not loaded, attempting lazy load...');
      calibrationService = loadCalibrationService();
    }

    if (!calibrationService) {
      throw new Error(
        'CalibrationService not available. Check terminal for TypeScript compilation errors.',
      );
    }

    // Send progress updates to renderer
    const sendProgress = (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send('CALIBRATION:PROGRESS', data);
        } catch (err) {
          logger.error('Error sending calibration progress:', err);
        }
      }
    };

    // Create log callback that broadcasts to frontend DevTools
    const logCallback = (message) => {
      broadcastLog(message);
    };

    const result = await calibrationService.runCalibration(sendProgress, logCallback, selectedIds);
    return result;
  } catch (error) {
    logger.error('Calibration error:', error);
    broadcastLog(`[CALIBRATION ERROR] ${error.message || String(error)}`);
    return { success: false, error: error.message || String(error) };
  }
});

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
  const stmt = database.prepare('SELECT name, actions_json FROM Mappings WHERE id = ?');
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
      logger.info(`Executing Macro ${mappingName}`);
    } catch (error) {
      // Ignore EPIPE errors silently
      if (error.code !== 'EPIPE') {
        logger.error('Error logging:', error.message);
      }
    }

    const actionsJson = mapping[0].values[0][1];
    if (!actionsJson) {
      try {
        logger.debug(`No actions found for macro ${mappingName}`);
      } catch (error) {
        if (error.code !== 'EPIPE') {
          logger.error('Error logging:', error.message);
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
          logger.debug(`Sending OSC message to ${action.daw}:`, message);
        } catch (error) {
          // Ignore EPIPE errors silently
          if (error.code !== 'EPIPE') {
            logger.error('Error logging:', error.message);
          }
        }
        oscClients[action.daw].send(message.address, message.args[0].value);
      } else {
        try {
          logger.debug(`Could not find track index for ${action.track}`);
        } catch (error) {
          // Ignore EPIPE errors silently
          if (error.code !== 'EPIPE') {
            logger.error('Error logging:', error.message);
          }
        }
      }
    });
  } else {
    try {
      logger.debug(`Could not find macro with ID ${macroId}`);
    } catch (error) {
      // Ignore EPIPE errors silently
      if (error.code !== 'EPIPE') {
        logger.error('Error logging:', error.message);
      }
    }
  }
}
