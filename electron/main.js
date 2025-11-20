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
const architect = require('./analysis/architect');
const theorist = require('./analysis/theorist');
const fileProcessor = require('./analysis/fileProcessor');
const progressTracker = require('./analysis/progressTracker');
const genreProfiles = require('./analysis/genreProfiles');
const structureGenerator = require('./analysis/structureGenerator');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
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
  });

  mainWindow.loadURL('http://localhost:5173');
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

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('DB:LOAD_ARRANGEMENT', async (event, arg) => {
  const database = db.getDb();
  const stmt = database.prepare('SELECT * FROM Arrangement');
  const arrangements = stmt.all();
  stmt.free();
  return arrangements;
});

ipcMain.handle('TRACK:RESOLVE_INDEX', async (event, trackName) => {
  return trackResolver.getTrackIndex(trackName);
});

ipcMain.handle('OSC:SEND_TRANSPORT', async (event, command) => {
  const reaperMessage = oscBuilder.sendReaperTransport(command);
  const abletonMessage = oscBuilder.sendAbletonTransport(command);

  oscClients.reaper.send(reaperMessage.address, ...reaperMessage.args.map(a => a.value));
  oscClients.ableton.send(abletonMessage.address, ...abletonMessage.args.map(a => a.value));
});

ipcMain.on('NETWORK:SEND_MACRO', (event, { macro, payload }) => {
  if (macro === 'MACRO_PLAY') {
    status.isPlaying = !status.isPlaying;
    const command = status.isPlaying ? 'play' : 'stop';
    const reaperMessage = oscBuilder.sendReaperTransport(command);
    const abletonMessage = oscBuilder.sendAbletonTransport(command);

    oscClients.reaper.send(reaperMessage.address, ...reaperMessage.args.map(a => a.value));
    oscClients.ableton.send(abletonMessage.address, ...abletonMessage.args.map(a => a.value));
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
    console.log('UI:REQUEST_INITIAL: Sending', currentBlocks.length, 'existing blocks');
    mainWindow.webContents.send('UI:BLOCKS_UPDATE', currentBlocks);
  } else {
    console.log('UI:REQUEST_INITIAL: No blocks to send');
  }
  broadcastStatus();
});

// Dialog IPC Handlers
ipcMain.handle('DIALOG:SHOW_OPEN', async (event, options = {}) => {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { canceled: true, filePaths: [], error: 'Main window not available' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select Audio File',
      filters: options.filters || [
        { name: 'Audio Files', extensions: ['wav', 'mp3', 'flac', 'm4a', 'ogg', 'aac'] },
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

// Analysis IPC Handlers

ipcMain.handle('ANALYSIS:START', async (event, { filePath, userHints = {} }) => {
  const startTime = Date.now();
  console.log('=== ANALYSIS START ===');
  console.log('File path:', filePath);
  console.log('User hints:', userHints);
  
  try {
    // Validate input
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path provided');
    }

    // Validate file exists
    const fs = require('fs');
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    const stats = fs.statSync(filePath);
    console.log('File size:', stats.size, 'bytes');

    // Validate file
    const validation = fileProcessor.validateFile(filePath);
    if (!validation.valid) {
      throw new Error(validation.error || 'File validation failed');
    }

    if (!fileProcessor.isSupportedFormat(filePath)) {
      throw new Error('Unsupported audio format');
    }

    // Step 0: Metadata lookup
    console.log('Step 0: Metadata lookup...');
    const metadata = metadataLookup.gatherMetadata(filePath, userHints);
    const fileInfo = fileProcessor.getFileInfo(filePath);
    const fileHash = fileInfo.hash;
    console.log('File hash:', fileHash);

    // Create session
    const session = sessionManager.createSession(filePath, fileHash, metadata);
    const tracker = new progressTracker.ProgressTracker(session, mainWindow);

    console.log('Analysis session created, fileHash:', fileHash);
    session.setState('pass1');
    tracker.update('step0', 100);
    tracker.broadcast(); // Force immediate broadcast
    console.log('Initial progress broadcast sent');
    
    // Small delay to ensure UI receives the initial update
    await new Promise(resolve => setTimeout(resolve, 50));

    // Pass 1: The Listener
    console.log('Starting Pass 1: The Listener');
    tracker.update('pass1', 0);
    tracker.broadcast(); // Force broadcast
    
            let result;
            try {
              result = await listener.analyzeAudio(filePath, (progress) => {
        console.log('Pass 1 progress:', progress);
        tracker.update('pass1', progress);
              }, metadata);
    } catch (error) {
      console.error('Pass 1 error:', error);
      throw error;
    }
    
    if (!result || !result.linear_analysis) {
      throw new Error('Pass 1 returned invalid result');
    }
    
    console.log('Pass 1 complete:', {
      events: result.linear_analysis.events?.length || 0,
      beats: result.linear_analysis.beat_grid?.beat_timestamps?.length || 0,
      tempo: result.linear_analysis.beat_grid?.tempo_bpm
    });
    
    const { linear_analysis } = result;
    session.setResult('pass1', linear_analysis);
    tracker.update('pass1', 100);
    tracker.broadcast();

    // Pass 2: The Architect
    console.log('Starting Pass 2: The Architect');
    session.setState('pass2');
    tracker.update('pass2', 0);
    tracker.broadcast();
    
    let structural_map;
    try {
      structural_map = await architect.analyzeStructure(linear_analysis, (progress) => {
        console.log('Pass 2 progress:', progress);
        tracker.update('pass2', progress);
      });
      
      if (!structural_map || !structural_map.sections) {
        throw new Error('Pass 2 returned invalid result: missing sections');
      }
      
      console.log('Pass 2 complete:', {
        sections: structural_map.sections?.length || 0,
        boundaries: structural_map.boundaries?.length || 0
      });
      
      session.setResult('pass2', structural_map);
      tracker.update('pass2', 100);
      tracker.broadcast();
    } catch (error) {
      console.error('Pass 2 error:', error);
      console.error('Pass 2 error stack:', error.stack);
      throw error;
    }

    // Pass 3: The Theorist
    console.log('Starting Pass 3: The Theorist');
    session.setState('pass3');
    tracker.update('pass3', 0);
    tracker.broadcast();
    
    let corrected_structural_map;
    try {
      corrected_structural_map = await theorist.correctStructuralMap(
        structural_map,
        linear_analysis,
        metadata,
        (progress) => {
          console.log('Pass 3 progress:', progress);
          tracker.update('pass3', progress);
        },
      );
      
      if (!corrected_structural_map || !corrected_structural_map.sections) {
        throw new Error('Pass 3 returned invalid result: missing sections');
      }
      
      console.log('Pass 3 complete:', {
        sections: corrected_structural_map.sections?.length || 0
      });
      
      session.setResult('pass3', corrected_structural_map);
      tracker.update('pass3', 100);
      tracker.broadcast();
    } catch (error) {
      console.error('Pass 3 error:', error);
      console.error('Pass 3 error stack:', error.stack);
      throw error;
    }

    // Build arrangement flow
    console.log('Building arrangement flow...');
    const arrangement_flow = {
      form: determineForm(corrected_structural_map.sections),
      timeline: corrected_structural_map.sections.map((section, idx) => ({
        position: idx + 1,
        section_reference: section.section_id,
        start_time: section.time_range?.start_time || 0,
        end_time: section.time_range?.end_time || 0,
        variations: [],
      })),
      transitions: [],
    };
    console.log('Arrangement flow:', {
      form: arrangement_flow.form,
      timelineItems: arrangement_flow.timeline.length
    });

    // Build harmonic context
    console.log('Building harmonic context...');
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
      functional_summary: {
        predominant_usage: 0.3,
        dominant_usage: 0.25,
        tonic_usage: 0.4,
        chromatic_density: 0.05,
      },
    };

    // Validate data before saving
    console.log('Validating analysis data before save...');
    console.log('Linear analysis:', {
      hasEvents: !!linear_analysis.events,
      eventCount: linear_analysis.events?.length || 0,
      hasBeatGrid: !!linear_analysis.beat_grid,
      hasMetadata: !!linear_analysis.metadata,
    });
    console.log('Structural map:', {
      hasSections: !!corrected_structural_map.sections,
      sectionCount: corrected_structural_map.sections?.length || 0,
    });
    
    if (!linear_analysis || !corrected_structural_map || !corrected_structural_map.sections) {
      throw new Error('Invalid analysis data: missing required fields');
    }

    // Save to database
    console.log('Saving analysis to database...');
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
    console.log('Analysis saved, ID:', analysisId);
    
    // Verify it was saved
    const verifyAnalysis = db.getAnalysis(fileHash);
    if (verifyAnalysis) {
      console.log('✓ Analysis verified in database:', {
        hasLinearAnalysis: !!verifyAnalysis.linear_analysis,
        hasStructuralMap: !!verifyAnalysis.structural_map,
        sectionCount: verifyAnalysis.structural_map?.sections?.length || 0,
      });
    } else {
      console.error('✗ Analysis NOT found in database after save!');
    }

    tracker.complete();
    
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.log(`=== ANALYSIS COMPLETE (${duration}s) ===`);

    return {
      success: true,
      analysisId,
      fileHash,
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);
    console.error(`=== ANALYSIS FAILED (${duration}s) ===`);
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    
    // Make sure error is broadcast
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send('ANALYSIS:PROGRESS', {
          state: 'failed',
          error: error.message,
        });
      } catch (e) {
        // Ignore
      }
    }
    
    return {
      success: false,
      error: error.message,
    };
  }
});

ipcMain.handle('ANALYSIS:GET_STATUS', async (event, fileHash) => {
  const session = sessionManager.getSession(fileHash);
  if (session) {
    return session.toJSON();
  }
  return null;
});

ipcMain.handle('ANALYSIS:GET_RESULT', async (event, fileHash) => {
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

// Generate structure from constraints (Sandbox Mode)
ipcMain.handle('SANDBOX:GENERATE', async (event, constraints) => {
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
        color: getSectionColor(section.section_label),
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

ipcMain.handle('ARCHITECT:UPDATE_BLOCKS', async (event, blocks = []) => {
  try {
    currentBlocks = Array.isArray(blocks) ? blocks : [];
    console.log('ARCHITECT:UPDATE_BLOCKS received', currentBlocks.length, 'blocks');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('UI:BLOCKS_UPDATE', currentBlocks);
    }
    return { success: true, count: currentBlocks.length };
  } catch (error) {
    console.error('ARCHITECT:UPDATE_BLOCKS error:', error);
    return { success: false, error: error.message };
  }
});

// Helper function to get section color
function getSectionColor(sectionLabel) {
  const colors = {
    intro: '#3b82f6',
    verse: '#10b981',
    chorus: '#f59e0b',
    bridge: '#ef4444',
    outro: '#8b5cf6',
    default: '#6b7280',
  };
  return colors[sectionLabel?.toLowerCase()] || colors.default;
}

// Convert analysis results to blocks format for Architect view
ipcMain.handle('ANALYSIS:LOAD_TO_ARCHITECT', async (event, fileHash) => {
  try {
    const analysis = db.getAnalysis(fileHash);
    if (!analysis || !analysis.structural_map || !analysis.structural_map.sections) {
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
        color: getSectionColor(section.section_label),
        section_label: section.section_label,
        section_variant: section.section_variant,
        harmonic_dna: section.harmonic_dna || {},
        rhythmic_dna: section.rhythmic_dna || {},
        time_range: section.time_range,
        probability_score: section.probability_score || 0.5,
      };
      
      console.log(`Block ${index}:`, block.id, block.label, block.length, 'bars');
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

function getSectionColor(label) {
  const colors = {
    intro: 'bg-purple-400',
    verse: 'bg-blue-400',
    chorus: 'bg-green-400',
    bridge: 'bg-yellow-400',
    outro: 'bg-gray-400',
  };
  return colors[label?.toLowerCase()] || 'bg-blue-400';
}

ipcMain.handle('ANALYSIS:GET_SECTION', async (event, { analysisId, sectionId }) => {
  const sections = db.getAnalysisSections(analysisId);
  return sections.find((s) => s.section_id === sectionId);
});

ipcMain.handle('THEORY:GET_GENRE_PROFILE', async (event, genreName) => {
  return genreProfiles.getGenreProfile(genreName);
});

ipcMain.handle('THEORY:VALIDATE_PROGRESSION', async (event, { chords, key, genre }) => {
  // Validate chord sequence against theory rules
  const genreProfile = genreProfiles.getGenreProfile(genre);
  const keyContext = { primary_key: key, mode: 'ionian' };

  // Simplified validation - would use full theory engine
  return {
    valid: true,
    suggestions: [],
  };
});

ipcMain.handle('ANALYSIS:SET_METADATA', async (event, { fileHash, metadata }) => {
  const session = sessionManager.getSession(fileHash);
  if (session) {
    session.metadata = { ...session.metadata, ...metadata };
    return { success: true };
  }
  return { success: false, error: 'Session not found' };
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

  if (mapping && mapping.length > 0 && mapping[0] && mapping[0].values && mapping[0].values.length > 0 && mapping[0].values[0] && mapping[0].values[0].length > 0) {
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
