# Debugging Librosa Integration

## Added Diagnostic Logging

I've added extensive logging to help diagnose why you might be seeing defaults instead of detected values:

### 1. Python Bridge Logging
- **Location**: `electron/analysis/pythonEssentia.js`
- **What it logs**:
  - Which script is being used (enhanced vs standard)
  - Detected key, mode, and time signature from Python analysis
  - Stage information during analysis

### 2. Listener Logging
- **Location**: `electron/analysis/listener.js`
- **What it logs**:
  - Detected values BEFORE metadata overrides are applied
  - Detected values AFTER metadata overrides are applied
  - Which overrides are being applied

### 3. Theorist Logging
- **Location**: `electron/analysis/theorist.js`
- **What it logs**:
  - Detected key and mode from analysis
  - Key confidence score
  - Which key is being used (detected vs hint)

### 4. Metadata Override Protection
- **Location**: `electron/analysis/listener.js` - `applyMetadataOverrides()`
- **What changed**:
  - Now only overrides detected values if:
    - No detection exists, OR
    - Confidence is very low (< 0.3)
  - Logs when overrides are applied vs when detected values are kept

## How to Debug

### Step 1: Check Console Logs
When you run an analysis, look for these log messages:

1. **Python Bridge**:
   ```
   [PythonBridge] Using enhanced Python analyzer script: analyze_song_enhanced.py
   [PythonBridge] ✅ Analysis complete - Key: X, Mode: Y, TimeSig: Z
   ```

2. **Listener**:
   ```
   [Analyzer] BEFORE overrides - Key: X, Mode: Y, TimeSig: Z
   [Analyzer] AFTER overrides - Key: X, Mode: Y, TimeSig: Z
   ```

3. **Theorist**:
   ```
   [Theorist] Key detection - Detected: X Y (confidence: Z%), Hint: none
   ```

### Step 2: Verify Enhanced Script is Running
Check if you see:
- `[PythonBridge] Using enhanced Python analyzer script: analyze_song_enhanced.py`
- If you see "standard" instead, the enhanced script might not be found

### Step 3: Check for Overrides
If you see:
- `[MetadataOverrides] Overriding key: ...`
- This means a metadata hint is overriding the detected value

### Step 4: Check Confidence Scores
If confidence is low (< 0.3), the system might fall back to defaults or hints.

## Common Issues

### Issue 1: Enhanced Script Not Found
**Symptom**: Logs show "Using standard Python analyzer script"
**Fix**: Verify `electron/analysis/analyze_song_enhanced.py` exists

### Issue 2: Overrides Overriding Detected Values
**Symptom**: Logs show "Overriding key" even with good confidence
**Fix**: The new logic should prevent this - only overrides if confidence < 0.3

### Issue 3: Default Values in Theorist
**Symptom**: Theorist shows 'C' or 'major' even when detection exists
**Fix**: Check theorist logs to see what it's receiving

### Issue 4: Python Analysis Failing Silently
**Symptom**: No Python logs, falls back to Essentia.js or simple analyzer
**Fix**: Check Python/Librosa installation and console for errors

## Next Steps

1. Run an analysis and check the console logs
2. Look for the diagnostic messages above
3. Share the logs if you're still seeing defaults
4. We can then identify exactly where the values are being lost

