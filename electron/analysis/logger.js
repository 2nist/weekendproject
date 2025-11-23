/**
 * Logger Service
 * Centralized logging with level control
 * Default: INFO level (only important messages)
 * Set DEBUG_MODE=1 to see debug logs
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

// Get log level from environment or default to INFO
const getLogLevel = () => {
  if (process.env.DEBUG_MODE === '1' || process.env.DEBUG_MODE === 'true') {
    return LOG_LEVELS.DEBUG;
  }
  if (process.env.LOG_LEVEL) {
    const level = LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()];
    if (level !== undefined) return level;
  }
  return LOG_LEVELS.INFO; // Default: INFO
};

const currentLevel = getLogLevel();

/**
 * Logger class
 */
class Logger {
  error(...args) {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      console.error('[ERROR]', ...args);
    }
  }

  warn(...args) {
    if (currentLevel >= LOG_LEVELS.WARN) {
      console.warn('[WARN]', ...args);
    }
  }

  info(...args) {
    if (currentLevel >= LOG_LEVELS.INFO) {
      console.log('[INFO]', ...args);
    }
  }

  debug(...args) {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  }

  // Convenience methods for pipeline passes
  pass0(...args) {
    this.info('[Pass 0]', ...args);
  }

  pass1(...args) {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      this.debug('[Pass 1]', ...args);
    } else {
      // Only show important Pass 1 messages at INFO level
      if (args[0] && typeof args[0] === 'string' && (
        args[0].includes('Starting') ||
        args[0].includes('Complete') ||
        args[0].includes('Error') ||
        args[0].includes('SUCCESS') ||
        args[0].includes('WARNING')
      )) {
        this.info('[Pass 1]', ...args);
      }
    }
  }

  pass2(...args) {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      this.debug('[Pass 2]', ...args);
    } else {
      // Only show important Pass 2 messages
      if (args[0] && typeof args[0] === 'string' && (
        args[0].includes('Starting') ||
        args[0].includes('Complete') ||
        args[0].includes('sections:')
      )) {
        this.info('[Pass 2]', ...args);
      }
    }
  }

  pass3(...args) {
    this.info('[Pass 3]', ...args); // Pass 3 logs are always important
  }
}

// Export singleton instance
const logger = new Logger();
module.exports = logger;


