/**
 * Progress Tracker
 * Tracks analysis progress and sends updates via IPC
 */

class ProgressTracker {
  constructor(session, mainWindow) {
    this.session = session;
    this.mainWindow = mainWindow;
    this.lastUpdate = Date.now();
    this.updateInterval = 100; // Update every 100ms
  }

  update(pass, percentage) {
    this.session.updateProgress(pass, percentage);
    // Always broadcast immediately (throttling removed for better UX)
    this.broadcast();
  }

  broadcast() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('ANALYSIS:PROGRESS', {
          fileHash: this.session.fileHash,
          state: this.session.state,
          progress: this.session.progress,
          estimatedTimeRemaining: this.session.getEstimatedTimeRemaining(),
        });
      } catch (error) {
        // Silently ignore if window is destroyed
        if (error.code !== 'EPIPE') {
          console.error('Error broadcasting progress:', error);
        }
      }
    }
  }

  complete() {
    this.session.setState('completed');
    this.session.updateProgress('pass3', 100);
    this.broadcast();
  }

  error(error) {
    this.session.setState('failed');
    this.session.addError(error);
    this.broadcast();
  }
}

module.exports = {
  ProgressTracker,
};

