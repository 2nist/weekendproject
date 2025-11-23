# Smoke Test Verification Checklist

## Pre-Flight Check ✅

### 1. Verify Script Exists
```bash
# Should show only analyze_song.py (canonical)
ls electron/analysis/analyze_song*.py
```

**Expected Output:**
- `analyze_song.py` (24KB) ✅
- `analyze_song.py.backup` (backup, can ignore)

**❌ If you see `analyze_song_enhanced.py` or `analyze_song_hpss.py`, consolidation failed!**

---

## The Smoke Test

### Step 1: Start the App
```bash
npm run dev
```

### Step 2: Import a Song
- Use a well-known song (e.g., "Come Together" by The Beatles)
- Watch the terminal/console for logs

---

## Green Flags to Look For

### 🟢 Flag 1: The Wiring
**Look for:**
```
[PythonBridge] Targeted Script: .../electron/analysis/analyze_song.py
[PythonBridge] Script exists: true
[PythonBridge] Using canonical Python analyzer script: analyze_song.py
```

**✅ PASS**: Points to canonical `analyze_song.py`  
**❌ FAIL**: Points to `_hpss.py` or `_enhanced.py` (ghost script still exists!)

---

### 🟢 Flag 2: The Logic (Key Detection)
**Look for:**
```
[PythonBridge] ✅ Analysis complete - Key: D Minor, Mode: minor, TimeSig: 4/4
```

**✅ PASS**: Returns actual detected key (e.g., "D Minor", "A Major", "F# Minor")  
**❌ FAIL**: Returns "C Major" (default fallback - detection not working)

**Note**: The key will vary by song. "Come Together" should detect around D minor or A major depending on the version.

---

### 🟢 Flag 3: The Handoff (Data Pipeline)
**Look for:**
```
[Analyzer] BEFORE overrides - Key: D Minor, Mode: minor, TimeSig: 4/4
[Analyzer] AFTER overrides - Key: D Minor, Mode: minor, TimeSig: 4/4
```

**✅ PASS**: 
- BEFORE and AFTER show the same detected values
- Key is NOT "C" or "unknown"
- Mode is NOT "major" (unless actually major)
- TimeSig is NOT "unknown"

**❌ FAIL**: 
- Values are "C", "major", "unknown"
- BEFORE and AFTER differ (overrides breaking detection)
- Missing logs entirely

---

### 🟢 Flag 4: Theorist Integration
**Look for:**
```
[Theorist] Key detection - Detected: D minor (confidence: 85%), Hint: none
[Theorist] Key context: D minor
```

**✅ PASS**: Theorist receives and uses detected key  
**❌ FAIL**: Theorist shows "C" or uses hint instead of detection

---

## Visual Verification (The Sandbox)

### Step 3: Open Sandbox for the Analyzed Song

### Check 1: Kick Borders (HPSS Verification)
**Look for**: Visual indicators of kick drum hits in the grid

**✅ PASS**: You see kick indicators/borders  
**❌ FAIL**: No kick indicators (HPSS y_percussive not working)

### Check 2: Chord Progression (Chroma Verification)
**Look for**: Chord labels in the grid

**For "Come Together" (D minor key):**
- Should see: **Dm, A, G, Dm** or similar
- Should NOT see: **C, F, G, C** (default progression)

**✅ PASS**: Chords match the detected key  
**❌ FAIL**: Chords are generic defaults (C, F, G, Am)

---

## Red Flags (Problems to Watch For)

### 🔴 Red Flag 1: Ghost Script
```
[PythonBridge] Targeted Script: .../analyze_song_enhanced.py
```
**Problem**: Still pointing to old script name  
**Fix**: Check `pythonEssentia.js` - should only reference `analyze_song.py`

### 🔴 Red Flag 2: Default Fallback
```
[PythonBridge] ✅ Analysis complete - Key: C Major
```
**Problem**: Detection not working, falling back to defaults  
**Fix**: Check Python/Librosa installation, check console for errors

### 🔴 Red Flag 3: Override Breaking Detection
```
[Analyzer] BEFORE overrides - Key: D Minor
[Analyzer] AFTER overrides - Key: C Major
```
**Problem**: Metadata overrides are overriding good detections  
**Fix**: Check `applyMetadataOverrides()` - should only override if confidence < 0.3

### 🔴 Red Flag 4: Missing Logs
**Problem**: No logs appear at all  
**Fix**: 
- Check if Python analysis is running
- Check if falling back to Essentia.js or simple analyzer
- Check console for errors

---

## Expected Log Sequence (Full Example)

```
[PythonBridge] Spawning analysis for: come_together.mp3
[PythonBridge] Targeted Script: C:\...\electron\analysis\analyze_song.py
[PythonBridge] Script exists: true
[PythonBridge] Using canonical Python analyzer script: analyze_song.py
[PythonBridge] Stage: loading (5%)
[PythonBridge] Stage: hpss (15%)
[PythonBridge] Stage: beat_tracking (30%)
[PythonBridge] Stage: key_detected (55%)
[PythonBridge] ✅ Analysis complete - Key: D, Mode: minor, TimeSig: 4/4
[Analyzer] Python analysis complete: Key=D minor (85%), TimeSig=4/4, Beats=234, Downbeats=59, Onsets=156
[Analyzer] ✅ Spectral features extracted
[Analyzer] ✅ Tonnetz features extracted
[Analyzer] BEFORE overrides - Key: D, Mode: minor, TimeSig: 4/4
[Analyzer] AFTER overrides - Key: D, Mode: minor, TimeSig: 4/4
[Theorist] Key detection - Detected: D minor (confidence: 85%), Hint: none
[Theorist] Key context: D minor
```

---

## Troubleshooting

### If Flag 1 Fails (Wrong Script)
1. Check `electron/analysis/pythonEssentia.js` line 88
2. Should be: `const scriptPath = path.join(__dirname, 'analyze_song.py');`
3. Verify no other script files exist

### If Flag 2 Fails (Default Key)
1. Check Python/Librosa installation: `python -c "import librosa; print('OK')"`
2. Check console for Python errors
3. Verify enhanced script has key detection code (should be in `analyze_song.py`)

### If Flag 3 Fails (Override Issues)
1. Check `applyMetadataOverrides()` in `listener.js`
2. Should only override if confidence < 0.3
3. Check logs for override messages

### If Visual Checks Fail
1. Verify analysis completed successfully
2. Check if blocks have `harmonic_dna` and `rhythmic_dna`
3. Check if `ArrangementBlock` is receiving correct data

---

## Success Criteria

✅ **All Green Flags Pass** = Backend refactor complete!  
✅ **Visual checks pass** = Data foundation is rock solid!

You can now proceed to building the rest of the Workstation UI (Layout, Inspector, etc.) knowing the data foundation is correct.

---

## Quick Test Script

If you want to test the Python script directly:

```bash
python electron/analysis/analyze_song.py path/to/audio.mp3
```

**Expected Output:**
- JSON with `detected_key`, `detected_mode`, `time_signature`
- Should NOT be "C", "major", or "4/4" for most songs
- Should have confidence scores

