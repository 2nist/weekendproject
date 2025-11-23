# Librosa Analysis System Overview & Enhancement Guide

## Current Architecture

### System Components

1. **Bridge Layer** (`electron/analysis/pythonEssentia.js`)
   - Detects Python + Librosa availability
   - Spawns Python subprocess
   - Handles JSON communication via stdout/stderr
   - Progress reporting via JSON messages

2. **Analysis Script** (`electron/analysis/analyze_song.py`)
   - Core Librosa-based audio analysis
   - HPSS (Harmonic-Percussive Source Separation)
   - Feature extraction (Chroma, MFCC, Beats, Tempo)
   - Chord detection via template matching
   - Drum detection (kick/snare)

3. **Integration** (`electron/analysis/listener.js`)
   - Primary analysis entry point
   - Tries Librosa first, falls back to Essentia.js, then simple analyzer
   - Post-processes results with TypeScript ChordAnalyzer
   - Applies metadata overrides

---

## Current Features

### ✅ What It Does

1. **Audio Loading**
   - Loads audio at 22.05kHz (mono)
   - Calculates duration

2. **HPSS (Harmonic-Percussive Source Separation)**
   - Separates harmonic content (melody/harmony) from percussive (drums)
   - Uses `librosa.effects.hpss()` with margin=(1.0, 5.0)

3. **Beat Tracking**
   - Detects tempo and beat positions
   - Uses `librosa.beat.beat_track()` on percussive component
   - Outputs beat timestamps

4. **Chroma Features** (Hybrid Approach)
   - **CQT Chroma** (60% weight): Sharp, precise pitch detection
   - **CENS Chroma** (40% weight): Smooth, context-aware harmonic stability
   - Combined: `0.6 * chroma_cqt + 0.4 * chroma_cens`
   - 12-dimensional chroma vectors per frame

5. **MFCC Features**
   - 13 MFCC coefficients for timbre analysis
   - Used for genre/style classification

6. **Chord Detection**
   - Template matching against 24 chord templates (12 major + 12 minor triads)
   - Vectorized cosine similarity
   - Simple but fast

7. **Drum Detection**
   - **Kick**: Low-pass filter <100Hz, onset detection
   - **Snare**: Band-pass filter 200-500Hz, onset detection
   - Aligned to beat grid with 50ms tolerance

8. **Key Detection**
   - **Currently hardcoded to 'C major'** ⚠️
   - Not actually detecting key from audio

---

## Current Limitations

### ❌ Missing Features

1. **Key Detection**
   - Hardcoded to 'C major' (line 141)
   - Should use `librosa.key.key_to_notes()` or chroma-based key estimation

2. **Time Signature Detection**
   - Hardcoded to '4/4' (line 147)
   - Should analyze beat patterns for actual time signature

3. **Chord Quality**
   - Only detects major/minor triads
   - No 7ths, extensions, or inversions
   - Low confidence scores (0.5)

4. **Downbeat Detection**
   - Not implemented
   - Only beat positions, not measure boundaries

5. **Onset Detection**
   - Only used for drums
   - Not extracted as general events

6. **Spectral Features**
   - No spectral centroid, rolloff, bandwidth
   - Limited timbre analysis

7. **Tempo Confidence**
   - No confidence score for tempo detection
   - Single tempo value (no multi-tempo)

8. **Progress Reporting**
   - Basic progress updates (5%, 20%, 40%, etc.)
   - Could be more granular

---

## Enhancement Opportunities

### 🚀 Priority 1: Critical Missing Features

#### 1. **Key Detection** (High Priority)
```python
# Add to analyze_song.py
from librosa import key

# After chroma extraction
key_result = librosa.key.key_to_notes(chroma, aggregate=np.median)
detected_key = key_result[0]  # e.g., 'C'
detected_mode = 'major' if key_result[1] == 'M' else 'minor'
key_confidence = key_result[2]  # confidence score
```

**Enhancement**: Use chroma-based key estimation
- `librosa.key.key_to_notes()` - Simple key detection
- `librosa.key.key_to_notes()` with aggregate=np.median for stability
- Or use Krumhansl-Schmuckler algorithm for more accuracy

#### 2. **Time Signature Detection** (High Priority)
```python
# Analyze beat intervals to detect time signature
beat_intervals = np.diff(beat_times)
# Group beats into measures
# Detect patterns: 4/4, 3/4, 6/8, etc.
```

**Enhancement**: 
- Analyze beat intervals and downbeat patterns
- Use autocorrelation on beat grid
- Detect common time signatures (4/4, 3/4, 6/8, 2/4)

#### 3. **Downbeat Detection** (Medium Priority)
```python
# Use librosa.beat.tempo() with downbeat tracking
tempo, beats = librosa.beat.beat_track(y=y_perc, sr=sr, units='time')
downbeats = librosa.beat.tempo(y=y_perc, sr=sr, aggregate=np.median)
```

**Enhancement**: 
- Use `librosa.beat.tempo()` with downbeat tracking
- Or analyze beat strength patterns
- Identify measure boundaries

#### 4. **Improved Chord Detection** (High Priority)
```python
# Use librosa's chord recognition or enhanced templates
# Add 7th chords, extensions, inversions
# Use chroma aggregation over beat-aligned windows
```

**Enhancement**:
- Expand chord templates (7ths, 9ths, sus, add, etc.)
- Use beat-aligned chroma aggregation for stability
- Add confidence scores based on template match strength
- Consider inversions using bass note analysis

### 🚀 Priority 2: Quality Improvements

#### 5. **Onset Detection** (Medium Priority)
```python
# Extract general onsets (not just drums)
onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time')
onset_strength = librosa.onset.onset_strength(y=y, sr=sr)
```

**Enhancement**:
- Extract onset times and strengths
- Classify onset types (percussive vs harmonic)
- Add to events array

#### 6. **Spectral Features** (Low Priority)
```python
# Add spectral features for timbre analysis
spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)
zero_crossing_rate = librosa.feature.zero_crossing_rate(y)
```

**Enhancement**:
- Add spectral centroid (brightness)
- Add spectral rolloff (high-frequency content)
- Add spectral bandwidth (timbre width)
- Add zero-crossing rate (noisiness)

#### 7. **Tempo Confidence & Multi-Tempo** (Low Priority)
```python
# Get tempo confidence
tempo, beats = librosa.beat.beat_track(y=y_perc, sr=sr, start_bpm=120, std_bpm=1.0)
tempo_confidence = librosa.beat.tempo(y=y_perc, sr=sr, aggregate=np.median)
```

**Enhancement**:
- Calculate tempo confidence score
- Detect tempo changes
- Support multi-tempo analysis

#### 8. **Better Progress Reporting** (Low Priority)
```python
# More granular progress updates
print(json.dumps({'status': 'progress', 'value': 10, 'stage': 'loading'}), flush=True)
print(json.dumps({'status': 'progress', 'value': 30, 'stage': 'hpss'}), flush=True)
# etc.
```

**Enhancement**:
- Add stage information to progress messages
- More granular updates (every 5% instead of large jumps)
- Include current operation description

### 🚀 Priority 3: Advanced Features

#### 9. **Harmonic Analysis** (Medium Priority)
```python
# Extract harmonic series
harmonics = librosa.harmonic(y_harm)
# Analyze harmonic content
harmonic_ratio = np.mean(harmonics) / np.mean(y_harm)
```

**Enhancement**:
- Harmonic/percussive ratio analysis
- Harmonic series extraction
- Pitch salience analysis

#### 10. **Tonal Centroid** (Low Priority)
```python
# Tonal centroid for harmonic context
tonnetz = librosa.feature.tonnetz(y=y_harm, sr=sr)
```

**Enhancement**:
- Add Tonnetz (Tonal Network) features
- Better harmonic context representation
- Enhances key detection

#### 11. **Tempo Tracking** (Medium Priority)
```python
# Track tempo changes over time
tempo_track = librosa.beat.tempo(y=y_perc, sr=sr, aggregate=None)
```

**Enhancement**:
- Tempo tracking over time (not just single value)
- Detect tempo changes
- Tempo curve for variable-tempo songs

#### 12. **Beat Strength** (Low Priority)
```python
# Calculate beat strength/confidence
beat_strength = librosa.beat.beat_track(y=y_perc, sr=sr, units='time', trim=False)
```

**Enhancement**:
- Add beat strength/confidence scores
- Filter weak beats
- Better beat grid quality

---

## Implementation Recommendations

### Phase 1: Critical Fixes (Week 1)
1. ✅ Implement key detection (replace hardcoded 'C major')
2. ✅ Implement time signature detection (replace hardcoded '4/4')
3. ✅ Add downbeat detection
4. ✅ Improve chord detection (add 7ths, confidence scores)

### Phase 2: Quality Improvements (Week 2)
5. ✅ Add onset detection
6. ✅ Add spectral features
7. ✅ Improve progress reporting
8. ✅ Add tempo confidence

### Phase 3: Advanced Features (Week 3+)
9. ✅ Harmonic analysis
10. ✅ Tonal centroid
11. ✅ Tempo tracking
12. ✅ Beat strength

---

## Code Structure Recommendations

### Current Structure
```
analyze_song.py (191 lines, single function)
├── Chord templates (24 templates)
├── Drum detection
├── Main analyze() function
└── Output formatting
```

### Recommended Refactoring
```
analyze_song.py
├── feature_extraction.py
│   ├── load_audio()
│   ├── extract_chroma()
│   ├── extract_mfcc()
│   ├── extract_spectral_features()
│   └── extract_tonal_features()
├── rhythm_analysis.py
│   ├── detect_beats()
│   ├── detect_downbeats()
│   ├── detect_time_signature()
│   └── detect_tempo()
├── harmony_analysis.py
│   ├── detect_key()
│   ├── detect_chords()
│   └── analyze_harmonic_content()
├── drum_analysis.py
│   ├── detect_kick()
│   ├── detect_snare()
│   └── align_to_beats()
└── analyze_song.py (orchestrator)
    ├── Main analyze() function
    └── Coordinates all modules
```

---

## Performance Considerations

### Current Performance
- **Sample Rate**: 22.05kHz (good balance of quality/speed)
- **Frame Size**: Default Librosa (512 samples @ 22.05kHz = ~23ms)
- **Processing**: Single-pass, vectorized operations

### Optimization Opportunities
1. **Parallel Processing**: Process different features in parallel
2. **Chunked Processing**: For very long files, process in chunks
3. **Caching**: Cache intermediate results (HPSS, chroma)
4. **Selective Features**: Only extract needed features based on options

---

## Integration Points

### Current Integration
- Results passed to TypeScript ChordAnalyzer for refinement
- Metadata overrides applied in listener.js
- Harmony options passed through

### Enhancement Opportunities
1. **Configurable Features**: Pass feature extraction options from Electron
2. **Selective Analysis**: Only run needed analysis modules
3. **Result Validation**: Validate output schema before returning
4. **Error Recovery**: Graceful degradation if features fail

---

## Testing Recommendations

### Unit Tests Needed
1. Key detection accuracy (test with known keys)
2. Time signature detection (test with 4/4, 3/4, 6/8)
3. Chord detection accuracy (test with known progressions)
4. Beat tracking accuracy (test with known tempos)

### Integration Tests
1. End-to-end analysis pipeline
2. Error handling (missing files, corrupted audio)
3. Progress reporting accuracy
4. Result schema validation

---

## Dependencies

### Current
- `librosa` (audio analysis)
- `numpy` (numerical operations)
- `scipy` (signal processing, filters)

### Potential Additions
- `madmom` (advanced beat/downbeat tracking) - Optional
- `music21` (music theory analysis) - Optional
- `mir_eval` (evaluation metrics) - Testing only

---

## Example Enhanced Output Schema

```python
{
    'linear_analysis': {
        'metadata': {
            'duration_seconds': float,
            'sample_rate': int,
            'frame_hop_seconds': float,
            'detected_key': str,  # ✅ Enhanced: Actually detected
            'detected_mode': str,  # ✅ Enhanced: Actually detected
            'key_confidence': float,  # ✅ New
            'time_signature': str,  # ✅ Enhanced: Actually detected
            'time_signature_confidence': float,  # ✅ New
        },
        'beat_grid': {
            'tempo_bpm': float,
            'tempo_confidence': float,  # ✅ New
            'tempo_track': [float],  # ✅ New: Tempo over time
            'beat_timestamps': [float],
            'beat_strengths': [float],  # ✅ New
            'downbeat_timestamps': [float],  # ✅ New
            'time_signature': str,
            'drum_grid': [...]
        },
        'events': [
            {
                'timestamp': float,
                'event_type': str,
                'chord': str,
                'chord_quality': str,  # ✅ New: 'major', 'minor', '7th', etc.
                'chord_inversion': int,  # ✅ New: 0=root, 1=first, etc.
                'confidence': float,  # ✅ Enhanced: Actual confidence
                'source': str
            }
        ],
        'chroma_frames': [...],
        'mfcc_frames': [...],
        'spectral_features': {  # ✅ New
            'centroid': [float],
            'rolloff': [float],
            'bandwidth': [float],
            'zero_crossing_rate': [float]
        },
        'onsets': [  # ✅ New
            {
                'timestamp': float,
                'strength': float,
                'type': str  # 'percussive' or 'harmonic'
            }
        ]
    }
}
```

---

## Quick Start: Implementing Key Detection

Here's a concrete example of how to add key detection:

```python
# In analyze_song.py, after chroma extraction:

def detect_key(chroma, sr):
    """Detect key using chroma-based analysis"""
    try:
        # Method 1: Simple key detection from chroma
        chroma_mean = np.mean(chroma, axis=1)
        key_profile = chroma_mean / (np.sum(chroma_mean) + 1e-10)
        
        # Krumhansl-Schmuckler key profiles
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        
        # Normalize profiles
        major_profile = major_profile / np.sum(major_profile)
        minor_profile = minor_profile / np.sum(minor_profile)
        
        # Correlate with all 24 keys (12 major + 12 minor)
        correlations = []
        for shift in range(12):
            # Major
            shifted_major = np.roll(major_profile, shift)
            corr_major = np.corrcoef(key_profile, shifted_major)[0, 1]
            correlations.append(('major', shift, corr_major))
            
            # Minor
            shifted_minor = np.roll(minor_profile, shift)
            corr_minor = np.corrcoef(key_profile, shifted_minor)[0, 1]
            correlations.append(('minor', shift, corr_minor))
        
        # Find best match
        best = max(correlations, key=lambda x: x[2])
        mode, shift, confidence = best
        
        # Convert shift to key name
        keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        detected_key = keys[shift]
        
        return detected_key, mode, float(confidence)
    except Exception as e:
        # Fallback
        return 'C', 'major', 0.5

# Use in analyze() function:
detected_key, detected_mode, key_confidence = detect_key(chroma, sr)
```

---

## Summary

### Current State
- ✅ Working Librosa-based analysis
- ✅ HPSS, chroma, MFCC, beats, tempo, drums
- ❌ Missing: Key detection, time signature, downbeats
- ❌ Limited: Chord quality, confidence scores

### Recommended Enhancements
1. **Immediate**: Key detection, time signature, downbeats
2. **Short-term**: Better chords, onset detection, spectral features
3. **Long-term**: Advanced features, refactoring, performance optimization

### Next Steps
1. Implement key detection (replace hardcoded 'C major')
2. Implement time signature detection (replace hardcoded '4/4')
3. Add downbeat detection
4. Improve chord detection with 7ths and confidence scores

