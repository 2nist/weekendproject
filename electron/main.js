const electron = require('electron');
const path = require('path');
const db = require('./db');
const midiListener = require('./midiListener');
const trackResolver = require('./trackResolver');
const oscBuilder = require('./oscBuilder');
const osc = require('node-osc');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
const session = electron.session;

let oscClients = {};
let mainWindow;

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

function sendMacro(macroId) {
  // 1. Look up the macro in the database
  const database = db.getDb();
  const stmt = database.prepare('SELECT name, actions_json FROM Mappings WHERE id = ?');
  const mapping = stmt.get([macroId]);
  stmt.free();

  if (mapping && mapping.length > 0) {
    const mappingName = mapping[0].values[0][0];
    if (mainWindow) {
      mainWindow.webContents.send('DEBUG:MIDI_ABSTRACTED', mappingName);
    }
    console.log(`Executing Macro ${mappingName}`);

    const actions = JSON.parse(mapping[0].values[0][1]);

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
        console.log(`Sending OSC message to ${action.daw}:`, message);
        oscClients[action.daw].send(message.address, message.args[0].value);
      } else {
        console.log(`Could not find track index for ${action.track}`);
      }
    });
  } else {
    console.log(`Could not find macro with ID ${macroId}`);
  }
}
