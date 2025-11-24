const easymidi = require('easymidi');
const logger = require('./analysis/logger');

const midiListener = {
  init: (cb) => {
    const inputs = easymidi.getInputs();
    if (inputs.length > 0) {
      const input = new easymidi.Input(inputs[0]);
      input.on('message', (msg) => {
        const { _type, channel, note, velocity, controller, value } = msg;
        logger.debug(msg);
        cb({ _type, channel, note, velocity, controller, value });
      });
    } else {
      logger.warn('No MIDI input devices found.');
    }
  },
  openPort: (port) => {
    // easymidi opens the port on creation, so this is a no-op
  },
  closePort: () => {
    // easymidi doesn't have a close port method, it closes on process exit
  },
};

module.exports = midiListener;
