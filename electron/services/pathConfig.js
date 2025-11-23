const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const os = require('os');

/**
 * Centralized path configuration for the application
 * Supports local storage, Google Drive, and custom paths
 */

class PathConfig {
  constructor() {
    this.userDataPath = app.getPath('userData');
    this.configPath = path.join(this.userDataPath, 'path-config.json');
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[PathConfig] Failed to load config:', error);
    }

    // Default configuration
    return this.getDefaultConfig();
  }

  getDefaultConfig() {
    const userDataPath = this.userDataPath;
    // Use app directory for local storage instead of userData
    const appPath = path.dirname(path.dirname(userDataPath)); // Go up from userData to app dir
    
    // Detect common Google Drive paths
    const googleDrivePaths = [
      path.join(os.homedir(), 'Google Drive'),
      path.join(os.homedir(), 'GoogleDrive'),
      'G:\\My Drive', // Mapped drive
    ].filter(p => fs.existsSync(p));

    return {
      // Version for future migrations
      version: 1,

      // Storage strategy: 'local' | 'hybrid' | 'custom'
      strategy: 'local',

      // Local storage (in app directory for easy git ignore)
      local: {
        root: path.join(appPath, 'library'),
        audio: path.join(appPath, 'library', 'audio'),
        midi: path.join(appPath, 'library', 'midi'),
        json: path.join(appPath, 'library', 'json'),
        cache: path.join(appPath, 'library', 'cache'),
        temp: path.join(appPath, 'library', 'temp'),
      },

      // Cloud storage (backup, archive)
      cloud: {
        enabled: false,
        provider: 'googledrive', // 'googledrive' | 'onedrive' | 'dropbox'
        root: googleDrivePaths[0] ? path.join(googleDrivePaths[0], 'Progression') : null,
        audio: googleDrivePaths[0] ? path.join(googleDrivePaths[0], 'Progression', 'audio') : null,
        midi: googleDrivePaths[0] ? path.join(googleDrivePaths[0], 'Progression', 'midi') : null,
        json: googleDrivePaths[0] ? path.join(googleDrivePaths[0], 'Progression', 'json') : null,
        syncOnImport: false, // Auto-copy to cloud on import
        syncOnExport: true,  // Auto-copy exports to cloud
      },

      // Custom paths (advanced users)
      custom: {
        audio: null,
        midi: null,
        json: null,
      },

      // File organization rules
      organization: {
        // How to organize files: 'flat' | 'by-artist' | 'by-date' | 'by-project'
        structure: 'by-project',
        // Include timestamp in filenames
        useTimestamps: true,
        // Maximum filename length
        maxFilenameLength: 100,
      },

      // Detected Google Drive path (read-only, auto-detected)
      detected: {
        googleDrive: googleDrivePaths[0] || null,
      },
    };
  }

  saveConfig() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      return { success: true };
    } catch (error) {
      console.error('[PathConfig] Failed to save config:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get the active path for a file type based on current strategy
   * @param {string} type - 'audio' | 'midi' | 'json' | 'cache' | 'temp'
   * @returns {string} Resolved path
   */
  getPath(type) {
    const strategy = this.config.strategy;

    // Custom paths take highest priority
    if (strategy === 'custom' && this.config.custom[type]) {
      return this.config.custom[type];
    }

    // Hybrid: use cloud for audio/midi, local for json/cache/temp
    if (strategy === 'hybrid' && this.config.cloud.enabled) {
      if ((type === 'audio' || type === 'midi') && this.config.cloud[type]) {
        return this.config.cloud[type];
      }
    }

    // Default to local
    return this.config.local[type];
  }

  /**
   * Get the cloud backup path if enabled
   * @param {string} type - File type
   * @returns {string|null} Cloud path or null
   */
  getCloudPath(type) {
    if (this.config.cloud.enabled && this.config.cloud[type]) {
      return this.config.cloud[type];
    }
    return null;
  }

  /**
   * Ensure all configured directories exist
   */
  ensureDirectories() {
    const paths = [
      ...Object.values(this.config.local),
    ];

    if (this.config.cloud.enabled) {
      paths.push(...Object.values(this.config.cloud).filter(v => typeof v === 'string'));
    }

    if (this.config.strategy === 'custom') {
      paths.push(...Object.values(this.config.custom).filter(v => v));
    }

    paths.forEach(p => {
      if (p && !fs.existsSync(p)) {
        try {
          fs.mkdirSync(p, { recursive: true });
        } catch (error) {
          console.error(`[PathConfig] Failed to create directory ${p}:`, error);
        }
      }
    });
  }

  /**
   * Update configuration
   * @param {object} updates - Partial config updates
   */
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    return this.saveConfig();
  }

  /**
   * Enable Google Drive integration
   * @param {string} googleDrivePath - Path to Google Drive root
   */
  enableGoogleDrive(googleDrivePath) {
    const progressionRoot = path.join(googleDrivePath, 'Progression');
    
    this.config.cloud = {
      enabled: true,
      provider: 'googledrive',
      root: progressionRoot,
      audio: path.join(progressionRoot, 'audio'),
      midi: path.join(progressionRoot, 'midi'),
      json: path.join(progressionRoot, 'json'),
      syncOnImport: false,
      syncOnExport: true,
    };

    // Switch to hybrid strategy
    this.config.strategy = 'hybrid';

    this.ensureDirectories();
    return this.saveConfig();
  }

  /**
   * Disable cloud storage
   */
  disableCloud() {
    this.config.cloud.enabled = false;
    this.config.strategy = 'local';
    return this.saveConfig();
  }

  /**
   * Get full configuration (for settings UI)
   */
  getFullConfig() {
    return { ...this.config };
  }

  /**
   * Copy file to cloud backup if enabled
   * @param {string} localPath - Source file path
   * @param {string} type - File type ('audio' | 'midi' | 'json')
   */
  async backupToCloud(localPath, type) {
    if (!this.config.cloud.enabled || !this.config.cloud.syncOnImport) {
      return { success: true, skipped: true };
    }

    const cloudPath = this.getCloudPath(type);
    if (!cloudPath) {
      return { success: false, error: 'Cloud path not configured' };
    }

    try {
      const filename = path.basename(localPath);
      const destPath = path.join(cloudPath, filename);
      
      // Ensure cloud directory exists
      if (!fs.existsSync(cloudPath)) {
        fs.mkdirSync(cloudPath, { recursive: true });
      }

      // Copy file
      fs.copyFileSync(localPath, destPath);
      
      return { success: true, cloudPath: destPath };
    } catch (error) {
      console.error('[PathConfig] Cloud backup failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate organized filename based on configuration
   * @param {object} metadata - File metadata (title, artist, uuid, etc.)
   * @param {string} extension - File extension (with dot)
   */
  generateFilename(metadata, extension) {
    const { structure, useTimestamps, maxFilenameLength } = this.config.organization;
    const { uuid, title, artist, projectId } = metadata;

    let filename = '';

    // Add UUID prefix if using timestamps
    if (useTimestamps && uuid) {
      filename = `${uuid}-`;
    }

    // Add structure-specific parts
    switch (structure) {
      case 'by-artist':
        if (artist) filename += `${this.sanitize(artist)}-`;
        break;
      case 'by-date':
        filename += `${new Date().toISOString().split('T')[0]}-`;
        break;
      case 'by-project':
        if (projectId) filename += `proj${projectId}-`;
        break;
    }

    // Add title
    if (title) {
      filename += this.sanitize(title);
    } else {
      filename += 'untitled';
    }

    // Add timestamp suffix if enabled and not already in UUID
    if (useTimestamps && !uuid) {
      filename += `-${Date.now()}`;
    }

    // Truncate if too long
    if (filename.length > maxFilenameLength - extension.length) {
      filename = filename.substring(0, maxFilenameLength - extension.length);
    }

    return filename + extension;
  }

  /**
   * Sanitize filename
   */
  sanitize(name) {
    return name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }
}

// Singleton instance
let instance = null;

function getInstance() {
  if (!instance) {
    instance = new PathConfig();
    instance.ensureDirectories();
  }
  return instance;
}

module.exports = {
  getInstance,
  PathConfig,
};
