# Data Flow to Sandbox - Fix Applied

## Problem

No analysis data was reaching the Sandbox view. The data flow was broken at multiple points:

1. **LibraryView** → Only passed `fileHash`, not full analysis data
2. **App.jsx** → Didn't load analysis data when only `fileHash` was provided
3. **SandboxView** → Data comparison logic was too strict
4. **EditorContext** → Only checked `initialData`, not `songData` for fileHash
5. **useAnalysisSandbox** → No logging to diagnose missing data

## Root Causes

### 1. App.jsx - Missing Data Loading
**Issue**: When `OPEN_SANDBOX` event only had `fileHash`, App.jsx didn't load the full analysis data.

**Fix**: Enhanced `onOpenSandbox` handler to:
- Try loading by `analysisId` first
- Fall back to loading by `fileHash` if needed
- Store fileHash globally for other components
- Pass full analysis data to SandboxView

### 2. EditorContext - Wrong Data Source
**Issue**: `useEffect` only checked `initialData` for fileHash, but data comes via `updateSongData()` which sets `songData`.

**Fix**: Changed to check `songData?.fileHash` first, then fall back to `initialData`.

### 3. SandboxView - Strict Comparison
**Issue**: Comparing entire `data` object with `===` failed because objects are always different references.

**Fix**: Use stable keys (dataKey) for comparison instead of object references.

### 4. Missing Logging
**Issue**: No visibility into data flow, making debugging impossible.

**Fix**: Added comprehensive logging at each step:
- App.jsx: Logs when loading analysis
- SandboxView: Logs data processing
- EditorContext: Logs loading attempts and results
- useAnalysisSandbox: Logs grid transformation

## Files Fixed

### 1. `src/App.jsx`
**Enhanced `onOpenSandbox` handler:**
- Loads analysis by `analysisId` if provided
- Loads analysis by `fileHash` if only hash is available
- Stores fileHash globally
- Passes full analysis data to SandboxView

### 2. `src/views/SandboxView.tsx`
**Improved data processing:**
- Uses stable keys for comparison (prevents false positives)
- Better logging to track data flow
- Handles both full data and fileHash-only cases

### 3. `src/contexts/EditorContext.tsx`
**Fixed data loading:**
- Checks `songData?.fileHash` (from `updateSongData`) first
- Falls back to `initialData?.fileHash` if needed
- Prevents duplicate loads with better tracking
- Enhanced logging

### 4. `src/hooks/useAnalysisSandbox.ts`
**Added diagnostic logging:**
- Logs when no data is available
- Logs grid transformation steps
- Logs final grid statistics

### 5. `src/types/editor.ts`
**Added missing type:**
- Exported `AnalysisData` interface
- Properly typed all analysis data structures

## Data Flow (Fixed)

```
1. User clicks "Open Sandbox" in Library
   ↓
2. LibraryView dispatches OPEN_SANDBOX event with { fileHash, projectId, analysisId }
   ↓
3. App.jsx receives event
   ↓
4. App.jsx loads analysis data:
   - Try ANALYSIS:GET_BY_ID (if analysisId)
   - Try ANALYSIS:GET_RESULT (if fileHash)
   ↓
5. App.jsx calls editorActions.updateSongData(analysisData)
   ↓
6. EditorContext.setSongData(analysisData)
   ↓
7. EditorContext useEffect detects fileHash, loads if needed
   ↓
8. SandboxView receives data prop
   ↓
9. SandboxView calls editorActions.updateSongData(data)
   ↓
10. useAnalysisSandbox reads from EditorContext.songData
   ↓
11. transformAnalysisToGrid converts to grid structure
   ↓
12. Grid renders in SandboxView
```

## Expected Console Logs

When opening sandbox, you should see:
```
[App] OPEN_SANDBOX event received: { fileHash: "...", ... }
[App] Loading analysis by fileHash: ...
[App] Loaded analysis by fileHash: ...
[App] Updating EditorContext with analysis data
[SandboxView] Processing data: { hasLinearAnalysis: true, ... }
[EditorContext] Loading analysis for fileHash: ...
[EditorContext] ANALYSIS:GET_RESULT response: { success: true, ... }
[EditorContext] ✅ Setting analysis data from response
[useAnalysisSandbox] Transforming grid from songData: { ... }
[useAnalysisSandbox] Grid computed: { sectionsCount: X, measuresCount: Y, ... }
[SandboxView] Grid Data: { gridLength: Y, sectionsLength: X, ... }
```

## Testing

1. ✅ Open Library
2. ✅ Click "Open Sandbox" on a project
3. ✅ Check console for data flow logs
4. ✅ Verify grid renders with beats and sections
5. ✅ Verify Inspector panel works when selecting beats

---

**Status**: ✅ Fixed - Data flow from analysis to sandbox is now complete with proper loading and logging

