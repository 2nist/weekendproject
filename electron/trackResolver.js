let trackMap = new Map();
let db;

const trackResolver = {
  init: (database) => {
    db = database;
    trackResolver.updateTrackMap();
  },
  updateTrackMap: () => {
    try {
      const stmt = db.prepare('SELECT value FROM Settings WHERE key = ?');
      const result = stmt.get('track_list');
      stmt.free();

      if (result && result.values && result.values.length > 0 && result.values[0] && result.values[0].length > 0) {
        const trackListValue = result.values[0][0];
        if (trackListValue && typeof trackListValue === 'string') {
          const trackList = trackListValue.split(',');
          trackList.forEach((track, index) => {
            if (track && track.trim()) {
              trackMap.set(track.trim(), index + 1);
            }
          });
        }
      }
    } catch (error) {
      console.error('Error updating track map:', error);
    }
  },
  startMockUpdates: () => {
    setInterval(() => {
      // In a real scenario, this would be updated by OSC feedback
      // For now, we'll just shuffle the track map
      const entries = Array.from(trackMap.entries());
      const shuffled = entries.sort(() => 0.5 - Math.random());
      trackMap = new Map(shuffled);
      // Safely log - handle broken pipe errors
      try {
        const trackMapObj = Object.fromEntries(trackMap);
        console.log('Track map updated:', trackMapObj);
      } catch (error) {
        // Silently ignore broken pipe errors (EPIPE)
        // This can happen when stdout is redirected or closed
        if (error.code !== 'EPIPE') {
          // Only log if it's not a broken pipe error
          console.error('Error logging track map:', error.message);
        }
      }
    }, 5000);
  },
  // DRUMS -> 1
  setMapping: (name, index) => {
    trackMap.set(name, index);
  },
  // DRUMS
  getTrackIndex: (name) => {
    return trackMap.get(name);
  },
  // 1
  getTrackName: (index) => {
    for (let [key, value] of trackMap.entries()) {
      if (value === index) {
        return key;
      }
    }
  },
  getMap: () => {
    return trackMap;
  },
};

module.exports = trackResolver;
