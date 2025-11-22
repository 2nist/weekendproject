# User Guide

This guide provides a complete overview of the Progression app, from installation to advanced analysis and editing.

## Getting Started

### Installation

1.  **Install Dependencies:**
    *   Run `npm install` to get all the necessary Node.js packages.
    *   This app uses `yt-dlp` to download audio from YouTube. Install it with `pip install yt-dlp`.

2.  **Run in Development Mode:**
    *   Execute `npm run dev` to start the application. This will launch the Electron front-end and the back-end services.

## The Library

The Library is your central hub for managing audio files.

### Importing Audio

*   **YouTube URL:** Paste a YouTube URL into the input field and click "Import." The audio will be downloaded, analyzed, and added to your library.
*   **Drag & Drop:** Drag an MP3 file directly onto the Library table to import it.

### Attaching MIDI

For a perfect "ground truth" analysis of harmony and rhythm, you can attach a MIDI file to an audio track.

1.  Select a track in the Library table.
2.  Click the "Attach MIDI" button.
3.  Choose the corresponding MIDI file.

The app will then use the MIDI data for a precise analysis.

## The Sandbox (Editor)

The Sandbox is where you can visualize, edit, and fine-tune the analysis of your audio.

### Harmonic Grid

The Harmonic Grid is the primary visual interface.

*   **Beat Cards:** Each card on the grid represents a single beat.
    *   **Color:** The color of the card indicates the harmony (chord) at that beat.
    *   **Border:** A border around a card highlights a rhythmic event.

### Tuning the Analysis

The "Analysis Lab" provides tools to correct any inaccuracies in the automated analysis.

*   **Key:** If the key is wrong, select the correct one from the dropdown.
*   **Stability & Sensitivity:** These sliders control the segmentation of the song.
    *   **Stability:** Higher values favor fewer, longer sections.
    *   **Sensitivity:** Higher values will detect more subtle changes and create more sections.

### Structuring the Song

*   **Split Tool:** To split a section, click the "Split" button and then click on the beat where you want the split to occur.
*   **Re-segmentation:** Adjust the "Stability" and "Sensitivity" sliders to re-run the structure analysis with different parameters.

### Saving Your Work

*   **Commit Changes:** When you're satisfied with your edits, click "Commit Changes" to save the new analysis to the project's database. This ensures your work is persisted.
