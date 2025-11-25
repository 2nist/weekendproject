const logger = require('./analysis/logger');

// Wrap native dependency require in a try/catch to avoid crashing when the
// native module cannot be compiled on CI or dev machines without build tools.
let midiLib = null;
let midiLibName = null;
try {
  // Try the native '@julusian/midi' if present
  midiLib = require('@julusian/midi');
  midiLibName = '@julusian/midi';
  logger.info('[midiListener] Using @julusian/midi');
} catch (e1) {
  try {
    // Fallback to easymidi (pure JS implementation)
    midiLib = require('easymidi');
    midiLibName = 'easymidi';
    logger.info('[midiListener] Using easymidi fallback');
  } catch (e2) {
    // Final fallback: Mock interface that doesn't crash but logs events
    midiLib = null;
    midiLibName = 'mock';
    logger.warn('[midiListener] No MIDI library available - using mock interface');
  }
}

const midiListener = {
  init: (cb) => {
    if (midiLibName === 'mock') {
      logger.warn('MIDI Hardware Not Available - mock mode active');
      return;
    }
    if (midiLibName === '@julusian/midi') {
      try {
        const inputs = midiLib.getInputs ? midiLib.getInputs() : [];
        if (inputs.length > 0) {
          // The @julusian/midi API may differ; try to open a port generically
          const input = new midiLib.Input(inputs[0]);
          input.on('message', (msg) => {
            const { _type, channel, note, velocity, controller, value } = msg;
            logger.debug('[midiListener] msg', msg);
            cb({ _type, channel, note, velocity, controller, value });
          });
        } else {
          logger.warn('[midiListener] No MIDI input devices found (julusian)');
        }
      } catch (err) {
        logger.warn('[midiListener] Error using @julusian/midi:', err?.message || err);
      }
      return;
    }
    if (midiLibName === 'easymidi') {
      try {
        const inputs = midiLib.getInputs();
        if (inputs.length > 0) {
          const input = new midiLib.Input(inputs[0]);
          input.on('message', (msg) => {
            const { _type, channel, note, velocity, controller, value } = msg;
            logger.debug('[midiListener] msg', msg);
            cb({ _type, channel, note, velocity, controller, value });
          });
        } else {
          logger.warn('[midiListener] No MIDI input devices found');
        }
      } catch (err) {
        logger.warn('[midiListener] Error using easymidi:', err?.message || err);
      }
      return;
    }
  },
  openPort: (port) => {
    // Implementation is library specific; a no-op here is fine for the app's needs
    logger.debug('[midiListener] openPort called (noop)');
  },
  closePort: () => {
    logger.debug('[midiListener] closePort called (noop)');
  },
};

module.exports = midiListener;
