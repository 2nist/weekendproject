/**
 * Analysis Session Manager
 * Tracks analysis state through three passes
 */

class AnalysisSession {
  constructor(filePath, fileHash, metadata) {
    this.filePath = filePath;
    this.fileHash = fileHash;
    this.metadata = metadata;
    this.state = 'initialized'; // initialized, pass1, pass2, pass3, completed, failed
    this.progress = {
      step0: 0,
      pass1: 0,
      pass2: 0,
      pass3: 0,
      overall: 0,
    };
    this.results = {
      linear_analysis: null,
      structural_map: null,
      arrangement_flow: null,
      harmonic_context: null,
    };
    this.errors = [];
    this.startTime = Date.now();
  }

  updateProgress(pass, percentage) {
    this.progress[pass] = percentage;
    this.calculateOverallProgress();
  }

  calculateOverallProgress() {
    // Weighted progress: Step 0 (5%), Pass 1 (40%), Pass 2 (30%), Pass 3 (25%)
    this.progress.overall =
      this.progress.step0 * 0.05 +
      this.progress.pass1 * 0.4 +
      this.progress.pass2 * 0.3 +
      this.progress.pass3 * 0.25;
  }

  setState(newState) {
    this.state = newState;
  }

  setResult(pass, result) {
    switch (pass) {
      case 'pass1':
        this.results.linear_analysis = result;
        break;
      case 'pass2':
        this.results.structural_map = result;
        break;
      case 'pass3':
        // Pass 3 updates structural_map with corrections
        this.results.structural_map = result;
        break;
    }
  }

  addError(error) {
    this.errors.push({
      timestamp: new Date().toISOString(),
      message: error.message || error,
      stack: error.stack,
    });
  }

  getEstimatedTimeRemaining() {
    if (this.progress.overall === 0) return null;

    const elapsed = Date.now() - this.startTime;
    const estimatedTotal = elapsed / (this.progress.overall / 100);
    const remaining = estimatedTotal - elapsed;

    return Math.max(0, Math.round(remaining / 1000)); // seconds
  }

  toJSON() {
    return {
      filePath: this.filePath,
      fileHash: this.fileHash,
      state: this.state,
      progress: this.progress,
      estimatedTimeRemaining: this.getEstimatedTimeRemaining(),
      errors: this.errors,
    };
  }
}

const activeSessions = new Map();

function createSession(filePath, fileHash, metadata) {
  const session = new AnalysisSession(filePath, fileHash, metadata);
  activeSessions.set(fileHash, session);
  return session;
}

function getSession(fileHash) {
  return activeSessions.get(fileHash);
}

function removeSession(fileHash) {
  activeSessions.delete(fileHash);
}

module.exports = {
  AnalysisSession,
  createSession,
  getSession,
  removeSession,
};

