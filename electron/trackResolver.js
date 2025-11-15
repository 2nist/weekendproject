let trackMap = new Map();
let db;

const trackResolver = {
  init: (database) => {
    db = database;
    trackResolver.updateTrackMap();
  },
  updateTrackMap: () => {
    const stmt = db.prepare('SELECT value FROM Settings WHERE key = ?');
    const result = stmt.get('track_list');
    stmt.free();

    if (result && result.values.length > 0) {
      const trackList = result.values[0][0].split(',');
      trackList.forEach((track, index) => {
        trackMap.set(track, index + 1);
      });
    }
  },
  startMockUpdates: () => {
    setInterval(() => {
      // In a real scenario, this would be updated by OSC feedback
      // For now, we'll just shuffle the track map
      const entries = Array.from(trackMap.entries());
      const shuffled = entries.sort(() => 0.5 - Math.random());
      trackMap = new Map(shuffled);
      console.log('Track map updated:', trackMap);
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
