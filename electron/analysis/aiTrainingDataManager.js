/**
 * AI Training Data Manager
 * Manages loading and serving standardized music data for AI training
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class AITrainingDataManager {
  constructor(libraryPath) {
    this.libraryPath = libraryPath;
    this.cache = new Map();
  }

  /**
   * Load all standardized annotation data
   */
  async loadAnnotationData() {
    const unifiedFiles = await this.findUnifiedAnnotationFiles();

    logger.info(`Loading ${unifiedFiles.length} unified annotation files...`);

    const annotations = [];
    for (const file of unifiedFiles) {
      try {
        const data = JSON.parse(await fs.readFile(file, 'utf8'));
        annotations.push(data);
      } catch (error) {
        logger.warn(`Failed to load annotation file ${file}:`, error.message);
      }
    }

    this.cache.set('annotations', annotations);
    logger.info(`Loaded ${annotations.length} annotation datasets`);

    return annotations;
  }

  /**
   * Load BIMMUDA training data
   */
  async loadBIMMUDAData() {
    const bimmudaPath = path.join(this.libraryPath, 'processed_bimmuda_training_data.json');

    try {
      const data = JSON.parse(await fs.readFile(bimmudaPath, 'utf8'));
      this.cache.set('bimmuda', data);
      logger.info(`Loaded BIMMUDA data with ${data.songs?.length || 0} songs`);
      return data;
    } catch (error) {
      logger.warn('Failed to load BIMMUDA data:', error.message);
      return null;
    }
  }

  /**
   * Load specific training datasets
   */
  async loadTrainingDataset(datasetName) {
    const datasetPath = path.join(this.libraryPath, `${datasetName}_dataset.json`);

    try {
      const data = JSON.parse(await fs.readFile(datasetPath, 'utf8'));
      this.cache.set(`dataset_${datasetName}`, data);
      logger.info(`Loaded ${datasetName} dataset with ${data.total_samples} samples`);
      return data;
    } catch (error) {
      logger.warn(`Failed to load ${datasetName} dataset:`, error.message);
      return null;
    }
  }

  /**
   * Get chord progression training data
   */
  async getChordProgressionData() {
    let data = this.cache.get('dataset_chord_progression_prediction');
    if (!data) {
      data = await this.loadTrainingDataset('chord_progression_prediction');
    }
    return data?.data || [];
  }

  /**
   * Get melody generation training data
   */
  async getMelodyGenerationData() {
    let data = this.cache.get('dataset_melody_generation');
    if (!data) {
      data = await this.loadTrainingDataset('melody_generation');
    }
    return data?.data || [];
  }

  /**
   * Get style classification training data
   */
  async getStyleClassificationData() {
    let data = this.cache.get('dataset_style_classification');
    if (!data) {
      data = await this.loadTrainingDataset('style_classification');
    }
    return data?.data || [];
  }

  /**
   * Get lyric alignment training data
   */
  async getLyricAlignmentData() {
    let data = this.cache.get('dataset_lyric_alignment');
    if (!data) {
      data = await this.loadTrainingDataset('lyric_alignment');
    }
    return data?.data || [];
  }

  /**
   * Search for songs by criteria
   */
  searchSongs(criteria = {}) {
    const bimmudaData = this.cache.get('bimmuda');
    if (!bimmudaData?.songs) return [];

    return bimmudaData.songs.filter((song) => {
      if (criteria.year && song.year !== criteria.year) return false;
      if (criteria.hasLyrics && !song.metadata.has_lyrics) return false;
      if (criteria.minDuration && song.metadata.duration_seconds < criteria.minDuration)
        return false;
      if (criteria.genre && song.inferred_genre !== criteria.genre) return false;
      return true;
    });
  }

  /**
   * Get statistical overview of the data
   */
  getDataStatistics() {
    const stats = {
      annotations: {
        total_files: 0,
        sources: {},
        total_sections: 0,
        total_chords: 0,
      },
      bimmuda: {
        total_songs: 0,
        years_range: [],
        avg_duration: 0,
        songs_with_lyrics: 0,
        instrumentation_stats: {},
      },
      training_datasets: {},
    };

    // Annotation stats
    const annotations = this.cache.get('annotations') || [];
    stats.annotations.total_files = annotations.length;

    for (const annotation of annotations) {
      stats.annotations.sources[annotation.metadata.source] =
        (stats.annotations.sources[annotation.metadata.source] || 0) + 1;

      stats.annotations.total_sections += annotation.sections?.length || 0;

      for (const section of annotation.sections || []) {
        stats.annotations.total_chords += section.chord_progression?.length || 0;
      }
    }

    // BIMMUDA stats
    const bimmuda = this.cache.get('bimmuda');
    if (bimmuda?.songs) {
      stats.bimmuda.total_songs = bimmuda.songs.length;
      stats.bimmuda.years_range = [
        Math.min(...bimmuda.songs.map((s) => s.year)),
        Math.max(...bimmuda.songs.map((s) => s.year)),
      ];

      const totalDuration = bimmuda.songs.reduce((sum, s) => sum + s.metadata.duration_seconds, 0);
      stats.bimmuda.avg_duration = totalDuration / bimmuda.songs.length;

      stats.bimmuda.songs_with_lyrics = bimmuda.songs.filter((s) => s.metadata.has_lyrics).length;

      // Instrumentation stats
      const instruments = {};
      for (const song of bimmuda.songs) {
        for (const instrument of song.training_features.instrumentation.unique_instruments) {
          instruments[instrument] = (instruments[instrument] || 0) + 1;
        }
      }
      stats.bimmuda.instrumentation_stats = instruments;
    }

    // Training dataset stats
    const datasetNames = [
      'chord_progression_prediction',
      'melody_generation',
      'style_classification',
      'lyric_alignment',
    ];
    for (const name of datasetNames) {
      const dataset = this.cache.get(`dataset_${name}`);
      if (dataset) {
        stats.training_datasets[name] = {
          total_samples: dataset.total_samples,
          created_date: dataset.created_date,
        };
      }
    }

    return stats;
  }

  /**
   * Find unified annotation files
   */
  async findUnifiedAnnotationFiles() {
    const files = [];

    async function scan(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            await scan(fullPath);
          } else if (entry.name.endsWith('_unified.json')) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    await scan(this.libraryPath);
    return files;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get data for a specific song by ID
   */
  getSongById(songId) {
    const bimmuda = this.cache.get('bimmuda');
    return bimmuda?.songs?.find((song) => song.id === songId) || null;
  }

  /**
   * Get annotations for a specific song
   */
  getAnnotationsForSong(title, artist = null) {
    const annotations = this.cache.get('annotations') || [];
    return annotations.filter((annotation) => {
      const matchesTitle = annotation.metadata.title?.toLowerCase() === title.toLowerCase();
      const matchesArtist =
        !artist || annotation.metadata.artist?.toLowerCase() === artist.toLowerCase();
      return matchesTitle && matchesArtist;
    });
  }
}

module.exports = AITrainingDataManager;
