# Architecture

This document outlines the "Hybrid Engine" architecture of the Progression app.

## The Hybrid Engine

The app is built on a hybrid model that leverages the strengths of different technologies for specific tasks.

### Python: The Eyes

*   **Role:** Initial audio processing and feature extraction.
*   **Technologies:**
    *   **HPSS (Harmonic-Percussive Source Separation):** Separates the harmonic and percussive elements of the audio.
    *   **Chroma:** Extracts chroma features, which represent the distribution of energy across the 12 pitch classes.
    *   **MFCC (Mel-Frequency Cepstral Coefficients):** Provides a compact representation of the spectral envelope.
*   **Why Python?** The scientific computing ecosystem in Python (NumPy, SciPy, Librosa, Essentia) is unparalleled for audio analysis and signal processing.

### TypeScript: The Brain

*   **Role:** Higher-level musical analysis, structure detection, and user interaction logic.
*   **Technologies:**
    *   **Viterbi Algorithm:** Used for finding the most likely sequence of hidden states (e.g., chords, structural segments) given a sequence of observations (e.g., chroma features).
    *   **Theory Glue:** A collection of modules that apply music theory rules to refine the analysis, such as identifying cadences, chord progressions, and key changes.
*   **Why TypeScript?** TypeScript provides the safety of static typing, which is crucial for building a complex, maintainable application. It also allows for seamless integration with the React front-end.

### SQLite: The Memory

*   **Role:** Data persistence for all project-related information.
*   **Technology:** **SQLite**
*   **Why SQLite?** It's a lightweight, file-based database that is perfect for a desktop application. It requires no separate server process and makes the entire project self-contained and portable. All analysis data, MIDI mappings, and user edits are stored in a single SQLite file.
