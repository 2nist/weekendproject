# Final Verification - Smoke Test Guide

## ✅ Pre-Flight Status

**Script Consolidation**: ✅ Complete
- Only `analyze_song.py` exists (canonical, enhanced version)
- Backup created: `analyze_song.py.backup`
- Code updated to use canonical name

**Logging Pipeline**: ✅ Complete
- Connection check logging added
- Before/after override logging added
- Theorist logging added
- Python bridge logging added

**Code Quality**: ✅ Complete
- Undefined value handling added
- Optional chaining for safety
- Override protection (only if confidence < 0.3)

---

## 🧪 The Smoke Test

### Step 1: Start the App
```bash
npm run dev
```

### Step 2: Import a Song
- Import "Come Together" or any well-known song
- Watch the terminal/console carefully

---

## 🟢 Green Flags to Verify

### Flag 1: The Wiring ✅
**Look for this exact log:**
```
[PythonBridge] Targeted Script: .../electron/analysis/analyze_song.py
[PythonBridge] Script exists: true
[PythonBridge] Using canonical Python analyzer script: analyze_song.py
```

**✅ PASS**: Points to `analyze_song.py` (canonical)  
**❌ FAIL**: Points to `_enhanced.py` or `_hpss.py` (ghost script!)

---

### Flag 2: The Logic ✅
**Look for this log:**
```
[PythonBridge] ✅ Analysis complete - Key: D, Mode: minor, TimeSig: 4/4
```

**✅ PASS**: 
- Key is NOT "C" or "NOT SET"
- Mode is NOT "major" (unless song is actually major)
- TimeSig is NOT "unknown" or "NOT SET"
- Actual detected values (e.g., "D", "A", "F#", etc.)

**❌ FAIL**: 
- Returns "C", "major", "unknown"
- Shows "NOT SET"
- Default fallback values

**Note**: For "Come Together", expect D minor or A major depending on version.

---

### Flag 3: The Handoff ✅
**Look for these logs:**
```
[Analyzer] BEFORE overrides - Key: D, Mode: minor, TimeSig: 4/4
[Analyzer] AFTER overrides - Key: D, Mode: minor, TimeSig: 4/4
```

**✅ PASS**: 
- BEFORE and AFTER show same values
- Values match Flag 2 (from Python)
- Key is NOT "C" or "NOT SET"
- No override messages (unless confidence was low)

**❌ FAIL**: 
- BEFORE and AFTER differ (overrides breaking detection)
- Values are defaults ("C", "major")
- Missing logs entirely

---

### Flag 4: Theorist Integration ✅
**Look for:**
```
[Theorist] Key detection - Detected: D minor (confidence: 85%), Hint: none
[Theorist] Key context: D minor
```

**✅ PASS**: Theorist receives and uses detected key  
**❌ FAIL**: Shows "C" or uses hint instead

---

## 👁️ Visual Verification (The Sandbox)

### Step 3: Open Sandbox for Analyzed Song

### Check 1: Kick Borders (HPSS Verification)
**Look for**: Visual kick drum indicators in the grid

**✅ PASS**: You see kick indicators/borders  
**❌ FAIL**: No kick indicators (HPSS not working)

### Check 2: Chord Progression (Chroma Verification)
**Look for**: Chord labels in the grid

**For "Come Together" (D minor):**
- ✅ Should see: **Dm, A, G, Dm** or similar
- ❌ Should NOT see: **C, F, G, C** (default progression)

**✅ PASS**: Chords match detected key  
**❌ FAIL**: Generic default chords

---

## 📋 Expected Full Log Sequence

Here's what a successful analysis should look like:

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

## 🔴 Red Flags (Problems)

### Red Flag 1: Ghost Script
```
[PythonBridge] Targeted Script: .../analyze_song_enhanced.py
```
**Problem**: Still pointing to old script  
**Fix**: Check `pythonEssentia.js` line 88

### Red Flag 2: Default Fallback
```
[PythonBridge] ✅ Analysis complete - Key: C, Mode: major
```
**Problem**: Detection not working  
**Fix**: Check Python/Librosa installation

### Red Flag 3: Override Breaking Detection
```
[Analyzer] BEFORE overrides - Key: D minor
[Analyzer] AFTER overrides - Key: C major
```
**Problem**: Overrides overriding good detection  
**Fix**: Check `applyMetadataOverrides()` logic

### Red Flag 4: Missing Logs
**Problem**: No logs appear  
**Fix**: Check if falling back to Essentia.js or simple analyzer

---

## ✅ Success Criteria

**All Green Flags Pass** = Backend refactor complete!  
**Visual checks pass** = Data foundation is rock solid!

You can now proceed to building the rest of the Workstation UI (Layout, Inspector, etc.) knowing the data foundation is correct.

---

## 🚀 Quick Test (Optional)

If you want to test the Python script directly:

```bash
python electron/analysis/analyze_song.py path/to/audio.mp3
```

**Expected Output:**
- JSON with `detected_key`, `detected_mode`, `time_signature`
- Should NOT be "C", "major", or hardcoded defaults
- Should have confidence scores

---

## 📝 Verification Checklist

- [ ] Flag 1: Script path points to `analyze_song.py`
- [ ] Flag 2: Detected key is NOT "C" or "unknown"
- [ ] Flag 3: BEFORE and AFTER overrides match
- [ ] Flag 4: Theorist uses detected key
- [ ] Visual: Kick borders visible in sandbox
- [ ] Visual: Chords match detected key

**All checked?** ✅ Backend refactor complete!

