const oscBuilder = {
  buildMessage: (daw, trackIndex, command, value) => {
    let message = '';
    switch (daw) {
      case 'reaper':
        message = `/track/${trackIndex}/${command}`;
        break;
      case 'ableton':
        message = `/live/track/${trackIndex}/${command}`;
        break;
    }
    return {
      address: message,
      args: [
        {
          type: 'f',
          value: value,
        },
      ],
    };
  },
  sendReaperTransport: (command) => {
    let message = '';
    switch (command) {
      case 'play':
        message = '/play';
        break;
      case 'stop':
        message = '/stop';
        break;
      case 'record':
        message = '/record';
        break;
    }
    return {
      address: message,
      args: [],
    };
  },
  sendAbletonTransport: (command) => {
    let message = '';
    switch (command) {
      case 'play':
        message = '/live/play';
        break;
      case 'stop':
        message = '/live/stop';
        break;
      case 'record':
        message = '/live/record';
        break;
    }
    return {
      address: message,
      args: [],
    };
  },
  sendReaperArm: (trackIndex, state) => {
    return {
      address: `/track/${trackIndex}/arm`,
      args: [
        {
          type: 'i',
          value: state,
        },
      ],
    };
  },
  sendAbletonArm: (trackIndex, state) => {
    return {
      address: `/live/track/${trackIndex}/arm`,
      args: [
        {
          type: 'i',
          value: state,
        },
      ],
    };
  },
};

module.exports = oscBuilder;
