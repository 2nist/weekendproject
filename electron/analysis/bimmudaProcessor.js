/**
 * BIMMUDA Dataset Processor for AI Training
 * Processes BIMMUDA MIDI dataset for music analysis training
 */

const fs = require('fs').promises;
const path = require('path');
const { Midi } = require('@tonejs/midi'); // Assuming Tone.js MIDI support

class BIMMUDAProcessor {
  constructor(libraryPath) {
    this.libraryPath = libraryPath;
    this.bimmudaPath = path.join(libraryPath, 'midi', 'bimmuda_dataset');
    this.processedData = [];
  }

  /**
   * Process entire BIMMUDA dataset
   */
  async processDataset() {
    console.log('Starting BIMMUDA dataset processing...');

    const years = await this.getYears();
    const trainingData = [];

    for (const year of years) {
      console.log(`Processing year ${year}...`);
      const yearData = await this.processYear(year);
      trainingData.push(...yearData);
    }

    this.processedData = trainingData;
    console.log(`Processed ${trainingData.length} songs from BIMMUDA dataset`);

    return trainingData;
  }

  /**
   * Get available years in BIMMUDA dataset
   */
  async getYears() {
    const entries = await fs.readdir(this.bimmudaPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  }

  /**
   * Process all songs for a given year
   */
  async processYear(year) {
    const yearPath = path.join(this.bimmudaPath, year);
    const entries = await fs.readdir(yearPath, { withFileTypes: true });
    const songDirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    const yearData = [];

    for (const songDir of songDirs) {
      try {
        const songData = await this.processSong(year, songDir);
        if (songData) {
          yearData.push(songData);
        }
      } catch (error) {
        console.warn(`Failed to process song ${year}/${songDir}:`, error.message);
      }
    }

    return yearData;
  }

  /**
   * Process individual song from BIMMUDA
   */
  async processSong(year, songId) {
    const songPath = path.join(this.bimmudaPath, year, songId);

    // Zero-pad songId for file naming (BIMMUDA uses 01, 02, etc.)
    const paddedSongId = songId.toString().padStart(2, '0');

    // Check for required files
    const midiFile = path.join(songPath, `${year}_${paddedSongId}_full.mid`);
    const lyricsFile = path.join(songPath, `${year}_${paddedSongId}_lyrics.txt`);
    const museScoreFile = path.join(songPath, `${year}_${paddedSongId}_full.mscz`);

    const hasMidi = await this.fileExists(midiFile);
    const hasLyrics = await this.fileExists(lyricsFile);

    if (!hasMidi) {
      console.warn(`No MIDI file found for ${year}/${songId}`);
      return null;
    }

    // Parse MIDI file
    const midiData = await this.parseMidiFile(midiFile);

    // Parse lyrics if available
    let lyrics = null;
    if (hasLyrics) {
      lyrics = await this.parseLyricsFile(lyricsFile);
    }

    // Extract training features
    const trainingFeatures = await this.extractTrainingFeatures(midiData, lyrics);

    return {
      id: `${year}_${songId}`,
      year: parseInt(year),
      song_id: songId,
      metadata: {
        has_lyrics: hasLyrics,
        has_musescore: await this.fileExists(museScoreFile),
        midi_tracks: midiData.tracks.length,
        duration_seconds: midiData.duration,
      },
      midi_data: midiData,
      lyrics: lyrics,
      training_features: trainingFeatures,
    };
  }

  /**
   * Parse MIDI file using Tone.js
   */
  async parseMidiFile(filePath) {
    try {
      const fs = require('node:fs').promises;
      const { Midi } = require('@tonejs/midi');

      // Read file as buffer
      const buffer = await fs.readFile(filePath);
      const midiData = new Midi(buffer);

      return {
        duration: midiData.duration,
        tracks: midiData.tracks.map((track) => ({
          name: track.name,
          instrument: track.instrument,
          notes: track.notes.map((note) => ({
            name: note.name,
            midi: note.midi,
            time: note.time,
            duration: note.duration,
            velocity: note.velocity,
          })),
          controlChanges: track.controlChanges || [],
          pitchBends: track.pitchBends || [],
        })),
        timeSignatures: midiData.timeSignatures || [],
        keySignatures: midiData.keySignatures || [],
        tempoChanges: midiData.tempoChanges || [],
      };
    } catch (error) {
      throw new Error(`Failed to parse MIDI file: ${error.message}`);
    }
  }

  /**
   * Parse lyrics file
   */
  async parseLyricsFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim());

      // Simple lyrics parsing - could be enhanced with timing if available
      return {
        raw_text: content,
        lines: lines,
        word_count: lines.join(' ').split(/\s+/).length,
        line_count: lines.length,
      };
    } catch (error) {
      console.warn(`Failed to parse lyrics file: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract training features from MIDI and lyrics data
   */
  async extractTrainingFeatures(midiData, lyrics) {
    const features = {
      // Harmonic features
      chord_progressions: await this.extractChordProgressions(midiData),

      // Rhythmic features
      rhythmic_patterns: this.extractRhythmicPatterns(midiData),

      // Melodic features
      melodic_contours: this.extractMelodicContours(midiData),

      // Structural features
      form_analysis: this.analyzeForm(midiData),

      // Text-music relationships (if lyrics available)
      lyric_alignment: lyrics ? this.analyzeLyricAlignment(midiData, lyrics) : null,

      // Metadata features
      instrumentation: this.analyzeInstrumentation(midiData),

      // Temporal features
      tempo_analysis: this.analyzeTempo(midiData),

      // Key and mode features
      tonal_analysis: this.analyzeTonality(midiData),
    };

    return features;
  }

  /**
   * Extract chord progressions from MIDI data
   */
  async extractChordProgressions(midiData) {
    // Simplified chord extraction - would use music theory algorithms
    const chords = [];

    // Group notes by time windows
    const timeWindows = this.createTimeWindows(midiData, 2); // 2-second windows

    for (const window of timeWindows) {
      const notesInWindow = this.getNotesInWindow(midiData, window.start, window.end);
      const chord = this.inferChordFromNotes(notesInWindow);

      if (chord) {
        chords.push({
          time: window.start,
          duration: window.end - window.start,
          chord: chord,
          notes: notesInWindow.map((n) => n.name),
          confidence: this.calculateChordConfidence(notesInWindow),
        });
      }
    }

    return chords;
  }

  /**
   * Extract rhythmic patterns
   */
  extractRhythmicPatterns(midiData) {
    const patterns = {
      onset_times: [],
      inter_onset_intervals: [],
      rhythmic_density: 0,
      syncopation_score: 0,
    };

    // Extract onset times from all tracks
    for (const track of midiData.tracks) {
      patterns.onset_times.push(...track.notes.map((note) => note.time));
    }

    patterns.onset_times.sort((a, b) => a - b);

    // Calculate inter-onset intervals
    for (let i = 1; i < patterns.onset_times.length; i++) {
      patterns.inter_onset_intervals.push(patterns.onset_times[i] - patterns.onset_times[i - 1]);
    }

    // Calculate rhythmic density (notes per second)
    patterns.rhythmic_density = patterns.onset_times.length / midiData.duration;

    return patterns;
  }

  /**
   * Extract melodic contours
   */
  extractMelodicContours(midiData) {
    const contours = [];

    // Find melody track (highest track or track with most notes)
    const melodyTrack = this.findMelodyTrack(midiData);

    if (melodyTrack) {
      const notes = melodyTrack.notes;
      const contour = {
        pitch_sequence: notes.map((n) => n.midi),
        duration_sequence: notes.map((n) => n.duration),
        interval_sequence: [],
      };

      // Calculate melodic intervals
      for (let i = 1; i < notes.length; i++) {
        contour.interval_sequence.push(notes[i].midi - notes[i - 1].midi);
      }

      contours.push(contour);
    }

    return contours;
  }

  /**
   * Analyze musical form
   */
  analyzeForm(midiData) {
    // Simplified form analysis
    const sections = [];

    // Divide into rough sections based on instrumentation changes
    const sectionLength = midiData.duration / 4; // Assume 4 sections

    for (let i = 0; i < 4; i++) {
      const start = i * sectionLength;
      const end = (i + 1) * sectionLength;

      sections.push({
        start_time: start,
        end_time: end,
        type: this.inferSectionType(midiData, start, end),
        instrumentation: this.getInstrumentationInRange(midiData, start, end),
      });
    }

    return { sections };
  }

  /**
   * Analyze lyric alignment (simplified)
   */
  analyzeLyricAlignment(midiData, lyrics) {
    return {
      lyric_density: lyrics.word_count / midiData.duration,
      estimated_syllables_per_second: lyrics.word_count / midiData.duration,
      vocal_range_analysis: null, // Would require vocal track identification
    };
  }

  /**
   * Analyze instrumentation
   */
  analyzeInstrumentation(midiData) {
    const instruments = new Map();

    for (const track of midiData.tracks) {
      const instrument = track.instrument || 'unknown';
      instruments.set(instrument, (instruments.get(instrument) || 0) + 1);
    }

    return {
      unique_instruments: Array.from(instruments.keys()),
      instrument_counts: Object.fromEntries(instruments),
      total_tracks: midiData.tracks.length,
    };
  }

  /**
   * Analyze tempo changes
   */
  analyzeTempo(midiData) {
    return {
      average_tempo:
        midiData.tempoChanges?.length > 0
          ? midiData.tempoChanges.reduce((sum, t) => sum + t.bpm, 0) / midiData.tempoChanges.length
          : 120, // default
      tempo_changes: midiData.tempoChanges || [],
      tempo_stability: this.calculateTempoStability(midiData.tempoChanges),
    };
  }

  /**
   * Analyze tonality
   */
  analyzeTonality(midiData) {
    // Simplified key detection
    const allNotes = [];
    for (const track of midiData.tracks) {
      allNotes.push(...track.notes.map((n) => n.midi % 12)); // Convert to pitch classes
    }

    const keyProfile = this.calculateKeyProfile(allNotes);

    return {
      detected_key: this.findBestKey(keyProfile),
      key_confidence: Math.max(...keyProfile) / allNotes.length,
      modality: 'major', // Simplified
      key_changes: midiData.keySignatures || [],
    };
  }

  // Helper methods
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  createTimeWindows(midiData, windowSize) {
    const windows = [];
    for (let time = 0; time < midiData.duration; time += windowSize) {
      windows.push({
        start: time,
        end: Math.min(time + windowSize, midiData.duration),
      });
    }
    return windows;
  }

  getNotesInWindow(midiData, start, end) {
    const notes = [];
    for (const track of midiData.tracks) {
      notes.push(...track.notes.filter((note) => note.time >= start && note.time < end));
    }
    return notes;
  }

  inferChordFromNotes(notes) {
    if (notes.length === 0) return null;

    // Very simplified chord inference
    const pitchClasses = notes.map((n) => n.midi % 12);
    const uniquePitches = [...new Set(pitchClasses)];

    // Basic triad detection
    if (uniquePitches.length >= 3) {
      // Sort and check for common chord patterns
      uniquePitches.sort((a, b) => a - b);

      // Check for major/minor triads
      for (let root = 0; root < 12; root++) {
        if (this.isMajorTriad(uniquePitches, root)) {
          return this.midiToNoteName(root) + ':major';
        }
        if (this.isMinorTriad(uniquePitches, root)) {
          return this.midiToNoteName(root) + ':minor';
        }
      }
    }

    return null;
  }

  isMajorTriad(pitches, root) {
    const majorTriad = [0, 4, 7].map((interval) => (root + interval) % 12);
    return majorTriad.every((interval) => pitches.includes(interval));
  }

  isMinorTriad(pitches, root) {
    const minorTriad = [0, 3, 7].map((interval) => (root + interval) % 12);
    return minorTriad.every((interval) => pitches.includes(interval));
  }

  midiToNoteName(midi) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return notes[midi % 12];
  }

  calculateChordConfidence(notes) {
    // Simple confidence based on note density and uniqueness
    if (notes.length === 0) return 0;
    const uniquePitches = new Set(notes.map((n) => n.midi % 12));
    return Math.min(uniquePitches.size / 7, 1); // Max confidence for 7 unique pitches
  }

  findMelodyTrack(midiData) {
    // Find track with highest average pitch (likely melody)
    let bestTrack = null;
    let highestAvgPitch = 0;

    for (const track of midiData.tracks) {
      if (track.notes.length === 0) continue;

      const avgPitch = track.notes.reduce((sum, note) => sum + note.midi, 0) / track.notes.length;

      if (avgPitch > highestAvgPitch) {
        highestAvgPitch = avgPitch;
        bestTrack = track;
      }
    }

    return bestTrack;
  }

  inferSectionType(midiData, start, end) {
    // Very simplified section type inference
    const notesInSection = this.getNotesInWindow(midiData, start, end);
    const density = notesInSection.length / (end - start);

    if (density > 5) return 'chorus'; // High density = chorus
    if (density > 2) return 'verse'; // Medium density = verse
    return 'bridge'; // Low density = bridge
  }

  getInstrumentationInRange(midiData, start, end) {
    const instruments = new Set();

    for (const track of midiData.tracks) {
      const notesInRange = track.notes.filter((note) => note.time >= start && note.time < end);

      if (notesInRange.length > 0) {
        instruments.add(track.instrument || 'unknown');
      }
    }

    return Array.from(instruments);
  }

  calculateTempoStability(tempoChanges) {
    if (!tempoChanges || tempoChanges.length < 2) return 1; // Perfectly stable

    const tempos = tempoChanges.map((t) => t.bpm);
    const mean = tempos.reduce((sum, t) => sum + t, 0) / tempos.length;
    const variance = tempos.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / tempos.length;

    return 1 / (1 + Math.sqrt(variance)); // Higher stability = lower variance
  }

  calculateKeyProfile(pitchClasses) {
    // Krumhansl-Schmuckler key profiles (simplified)
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

    const majorCorrelation = this.calculateCorrelation(pitchClasses, majorProfile);
    const minorCorrelation = this.calculateCorrelation(pitchClasses, minorProfile);

    return [majorCorrelation, minorCorrelation];
  }

  calculateCorrelation(pitchClasses, profile) {
    const pitchHistogram = new Array(12).fill(0);
    for (const pc of pitchClasses) {
      pitchHistogram[pc]++;
    }

    let correlation = 0;
    for (let i = 0; i < 12; i++) {
      correlation += pitchHistogram[i] * profile[i];
    }

    return correlation;
  }

  findBestKey(keyProfile) {
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const bestIndex = keyProfile.indexOf(Math.max(...keyProfile));
    return keys[bestIndex] + (bestIndex < 12 ? ':major' : ':minor');
  }

  /**
   * Save processed data to JSON file
   */
  async saveProcessedData(outputPath) {
    const data = {
      metadata: {
        dataset: 'BIMMUDA',
        version: '1.0.0',
        processed_date: new Date().toISOString(),
        total_songs: this.processedData.length,
        years_covered: [...new Set(this.processedData.map((d) => d.year))].sort(),
      },
      songs: this.processedData,
    };

    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
    console.log(`Saved processed BIMMUDA data to ${outputPath}`);
  }

  /**
   * Generate training datasets for different AI tasks
   */
  generateTrainingDatasets() {
    const datasets = {
      chord_progression_prediction: this.createChordProgressionDataset(),
      melody_generation: this.createMelodyGenerationDataset(),
      style_classification: this.createStyleClassificationDataset(),
      lyric_alignment: this.createLyricAlignmentDataset(),
    };

    return datasets;
  }

  createChordProgressionDataset() {
    const dataset = [];

    for (const song of this.processedData) {
      if (song.training_features.chord_progressions.length > 0) {
        const chords = song.training_features.chord_progressions;

        // Create sequence prediction examples
        for (let i = 0; i < chords.length - 1; i++) {
          dataset.push({
            input: chords.slice(0, i + 1).map((c) => c.chord),
            target: chords[i + 1].chord,
            context: {
              year: song.year,
              instrumentation: song.training_features.instrumentation,
            },
          });
        }
      }
    }

    return dataset;
  }

  createMelodyGenerationDataset() {
    const dataset = [];

    for (const song of this.processedData) {
      if (song.training_features.melodic_contours.length > 0) {
        const contour = song.training_features.melodic_contours[0];

        // Create melody continuation examples
        for (let i = 4; i < contour.pitch_sequence.length; i++) {
          dataset.push({
            input_sequence: contour.pitch_sequence.slice(0, i),
            target_pitch: contour.pitch_sequence[i],
            context: {
              year: song.year,
              tempo: song.training_features.tempo_analysis.average_tempo,
            },
          });
        }
      }
    }

    return dataset;
  }

  createStyleClassificationDataset() {
    const dataset = [];

    for (const song of this.processedData) {
      dataset.push({
        features: {
          instrumentation: song.training_features.instrumentation,
          rhythmic_density: song.training_features.rhythmic_patterns.rhythmic_density,
          tempo: song.training_features.tempo_analysis.average_tempo,
          tonality: song.training_features.tonal_analysis,
        },
        label: this.inferGenreFromFeatures(song),
        year: song.year,
      });
    }

    return dataset;
  }

  createLyricAlignmentDataset() {
    const dataset = [];

    for (const song of this.processedData) {
      if (song.lyrics && song.training_features.lyric_alignment) {
        dataset.push({
          lyrics: song.lyrics.lines,
          musical_features: song.training_features.lyric_alignment,
          alignment_score: this.calculateAlignmentScore(song),
        });
      }
    }

    return dataset;
  }

  inferGenreFromFeatures(song) {
    // Very simplified genre inference based on year and features
    const year = song.year;

    if (year < 1960) return 'early_rock';
    if (year < 1970) return 'classic_rock';
    if (year < 1980) return 'disco_pop';
    if (year < 1990) return 'pop_rock';
    if (year < 2000) return 'alternative';
    return 'modern_pop';
  }

  calculateAlignmentScore(song) {
    // Simplified alignment scoring
    if (!song.lyrics || !song.training_features.lyric_alignment) return 0;

    const lyricDensity = song.training_features.lyric_alignment.lyric_density;
    // Higher density might indicate better alignment
    return Math.min(lyricDensity * 10, 1);
  }
}

module.exports = BIMMUDAProcessor;
