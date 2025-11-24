/**
 * Engine Configuration Manager
 * Manages persistent engine parameters (architectOptions and chordOptions)
 * stored in userData/engine-config.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
const logger = require('../analysis/logger');

export interface EngineConfig {
  // Architect options (structure analysis)
  architectOptions: {
    noveltyKernel?: number;
    sensitivity?: number;
    mergeChromaThreshold?: number;
    minSectionDurationSec?: number;
    forceOverSeg?: boolean;
    downsampleFactor?: number;
    // V2 options
    adaptiveSensitivity?: number;
    mfccWeight?: number;
    detailLevel?: number;
  };
  // Chord analyzer options (harmony analysis)
  chordOptions: {
    temperature?: number;
    transitionProb?: number;
    diatonicBonus?: number;
    rootPeakBias?: number;
    globalKey?: string;
  };
  // Metadata
  calibratedAt?: string;
  calibrationScore?: number;
}

// Golden Defaults (used when no config file exists)
const GOLDEN_DEFAULTS: EngineConfig = {
  architectOptions: {
    noveltyKernel: 5,
    sensitivity: 0.6,
    mergeChromaThreshold: 0.92,
    minSectionDurationSec: 8.0,
    forceOverSeg: false,
    downsampleFactor: 4,
    adaptiveSensitivity: 1.5,
    mfccWeight: 0.5,
    detailLevel: 0.5,
  },
  chordOptions: {
    temperature: 0.1,
    transitionProb: 0.8,
    diatonicBonus: 0.1,
    rootPeakBias: 0.1,
    globalKey: undefined,
  },
};

function getConfigPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'engine-config.json');
}

/**
 * Load engine configuration from disk, or return defaults
 */
export function loadConfig(): EngineConfig {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(fileContent);
      // Merge with defaults to ensure all fields exist
      return {
        ...GOLDEN_DEFAULTS,
        ...parsed,
        architectOptions: {
          ...GOLDEN_DEFAULTS.architectOptions,
          ...(parsed.architectOptions || {}),
        },
        chordOptions: {
          ...GOLDEN_DEFAULTS.chordOptions,
          ...(parsed.chordOptions || {}),
        },
      };
    }
  } catch (error) {
    logger.warn('[EngineConfig] Failed to load config, using defaults:', error);
  }

  return { ...GOLDEN_DEFAULTS };
}

/**
 * Save engine configuration to disk
 */
export function saveConfig(config: EngineConfig): { success: boolean; error?: string } {
  const configPath = getConfigPath();

  try {
    // Ensure directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Add timestamp
    const configToSave = {
      ...config,
      calibratedAt: new Date().toISOString(),
    };

    fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');
    logger.info('[EngineConfig] Saved config to:', configPath);
    return { success: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error('[EngineConfig] Failed to save config:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

/**
 * Reset to golden defaults
 */
export function resetToDefaults(): { success: boolean; error?: string } {
  return saveConfig(GOLDEN_DEFAULTS);
}
