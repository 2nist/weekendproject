# Essentia Integration Guide

## Overview

The audio analysis pipeline (Pass 1: The Listener) uses Essentia for DSP analysis. The implementation supports two approaches:

1. **Python Essentia** (Recommended for Electron main process)
2. **JavaScript Essentia.js** (Browser-based, may require renderer process)

## Setup Options

### Option 1: Python Essentia (Recommended for Linux/macOS)

Python Essentia is more reliable for Node.js/Electron main process, but **building from source on Windows is difficult**:

**Linux/macOS:**
```bash
# Install Python Essentia
pip install essentia

# Or with TensorFlow support
pip install essentia-tensorflow
```

**Windows:**
- Essentia requires building from source on Windows, which needs:
  - Visual Studio Build Tools with C++ support
  - CMake
  - Various C++ dependencies
- **Recommendation for Windows:** Use JavaScript Essentia.js (Option 2) instead
- Alternative: Use WSL (Windows Subsystem for Linux) to run Python Essentia

The code automatically detects if Python Essentia is available and uses it, gracefully falling back to JavaScript if not.

### Option 2: JavaScript Essentia.js (Recommended for Windows)

Essentia.js is browser-based and uses WebAssembly. It works well in Electron:

```bash
# Install essentia.js (already in package.json)
npm install essentia.js
```

**Note**: Essentia.js is primarily designed for browser environments but works in Electron. This is the recommended option for Windows users.

## Implementation Details

### Current Implementation

The `listener.js` module tries three approaches in order:

1. **Python Essentia** - If `python3` with `essentia` is available
2. **JavaScript Essentia.js** - If the package is installed
3. **Placeholder** - Returns schema-compliant structure (for development)

### Algorithms Used

**Pass 1: The Listener** extracts:

- **Beat Tracking**: `BeatTrackerMultiFeature`
- **Tempo**: BPM detection
- **Downbeats**: Measure boundaries
- **Chroma Features**: `Chromagram` for harmonic content
- **Chord Detection**: Template matching on chroma features
- **Note Onsets**: `OnsetRate` for transient detection
- **Key Detection**: `KeyExtractor` for key and mode

### Data Flow

1. **File Preparation**: Audio file is converted to WAV (if needed) using ffmpeg
2. **Audio Loading**: WAV file is decoded using `wav-decoder`
3. **Frame Processing**: Audio is processed in 2048-sample frames with 1024-sample hop
4. **Feature Extraction**: Essentia algorithms extract features
5. **Schema Output**: Results formatted according to music theory schema

## Testing

To test Essentia integration:

1. **For Linux/macOS**: Install Python Essentia: `pip install essentia`
2. **For Windows**: JavaScript Essentia.js is already installed (no additional setup needed)
3. **Test with audio file**: Use the Analysis tab to upload a WAV file
4. **Check console**: Look for:
   - "Using Python Essentia for analysis" (if Python version is available)
   - "Using JavaScript Essentia.js for analysis" (if using JS version)
   - "No Essentia implementation available" (fallback mode - for development)

## Troubleshooting

### Python Essentia Not Found

```bash
# Check if Python Essentia is installed
python3 -c "import essentia.standard; print('OK')"

# Install if needed
pip install essentia
```

### FFmpeg Not Available

FFmpeg is needed for audio format conversion:

```bash
# Install ffmpeg-static (bundled with npm install)
# Or install system ffmpeg
# macOS: brew install ffmpeg
# Windows: Download from ffmpeg.org
# Linux: apt-get install ffmpeg
```

### Essentia.js Not Working

If Essentia.js fails, the system automatically falls back to Python Essentia or placeholder. For browser-based Essentia.js, consider:

- Running analysis in renderer process instead of main process
- Using a Web Worker for heavy processing
- Ensuring WASM files are properly loaded

## Future Enhancements

- [ ] Real-time analysis during playback
- [ ] Batch processing multiple files
- [ ] Custom algorithm pipeline configuration
- [ ] ML model integration for genre/emotion detection
- [ ] Parallel processing for faster analysis

