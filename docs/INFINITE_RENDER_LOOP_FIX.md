# Infinite Render Loop Fix

## Problem

The app was experiencing "Maximum update depth exceeded" errors due to infinite render loops. The console showed the same logs repeating hundreds of times before crashing.

## Root Causes

### 1. SandboxView.tsx - useEffect Dependency Loop
**Issue**: `useEffect` had `state.songData` in dependency array, causing:
- Effect runs → calls `updateSongData()` → updates `state.songData` → effect runs again → loop

**Fix**: 
- Removed `state.songData` from dependency array
- Added refs to track if data has already been loaded
- Only update when `data` prop actually changes

### 2. BottomDeck.tsx - useEffect Dependency Issue
**Issue**: `useEffect` depended on `state.songData` (entire object), causing re-runs on every state update

**Fix**: 
- Changed dependency to `songDataId` (just the ID/hash) instead of entire object
- Only runs when song actually changes, not on every state update

### 3. Console.log in Render Bodies
**Issue**: `console.log` statements in component render bodies execute on every render, creating log spam

**Fix**: 
- Moved logging to `useEffect` hooks that only run when values change
- Removed or commented out render-time logging

## Files Fixed

### 1. `src/views/SandboxView.tsx`
**Before:**
```tsx
React.useEffect(() => {
  if (data && (data.linear_analysis || data.fileHash || data.file_hash)) {
    editorActions.updateSongData(data);
  } else {
    const fileHash = globalThis.__lastAnalysisHash || globalThis.__currentFileHash;
    if (fileHash && !state.songData?.linear_analysis) {
      editorActions.updateSongData({ fileHash, file_hash: fileHash });
    }
  }
}, [data, editorActions, state.songData]); // 🔴 state.songData causes loop
```

**After:**
```tsx
const hasLoadedDataRef = React.useRef(false);
const lastDataRef = React.useRef<any>(null);

React.useEffect(() => {
  // Skip if we've already processed this exact data
  if (lastDataRef.current === data) {
    return;
  }
  
  if (data && (data.linear_analysis || data.fileHash || data.file_hash)) {
    if (!hasLoadedDataRef.current || lastDataRef.current !== data) {
      editorActions.updateSongData(data);
      hasLoadedDataRef.current = true;
      lastDataRef.current = data;
    }
  } else if (!hasLoadedDataRef.current) {
    const fileHash = globalThis.__lastAnalysisHash || globalThis.__currentFileHash;
    if (fileHash) {
      editorActions.updateSongData({ fileHash, file_hash: fileHash });
      hasLoadedDataRef.current = true;
      lastDataRef.current = { fileHash, file_hash: fileHash };
    }
  }
}, [data, editorActions]); // ✅ Removed state.songData
```

### 2. `src/components/layout/BottomDeck.tsx`
**Before:**
```tsx
useEffect(() => {
  if (audioRef.current) {
    const dur = audioRef.current.getDuration();
    setDuration(dur);
  }
}, [state.songData]); // 🔴 Entire object causes re-runs
```

**After:**
```tsx
const songDataId = state.songData?.id || state.songData?.fileHash || state.songData?.file_hash;
useEffect(() => {
  if (audioRef.current && songDataId) {
    const dur = audioRef.current.getDuration();
    if (dur > 0) {
      setDuration(dur);
    }
  }
}, [songDataId]); // ✅ Only ID, not entire object
```

### 3. `src/components/player/AudioEngine.tsx`
**Before:**
```tsx
const mediaUrl = React.useMemo(() => { ... }, [projectId, songFilename, src]);
console.log('[AudioEngine] Building media URL:', { ... }); // 🔴 Logs on every render
```

**After:**
```tsx
const mediaUrl = React.useMemo(() => { ... }, [projectId, songFilename, src]);
React.useEffect(() => {
  console.log('[AudioEngine] Media URL changed:', mediaUrl);
}, [mediaUrl]); // ✅ Only logs when URL changes
```

## Key Principles

1. **Never put state objects in dependency arrays** - Use IDs or specific values instead
2. **Use refs to track "already loaded" state** - Prevents re-running effects unnecessarily
3. **Move logging to useEffect** - Prevents log spam from render-time logging
4. **Compare data before updating** - Check if data actually changed before calling setters

## Testing

After these fixes:
- ✅ No infinite re-renders
- ✅ No "Maximum update depth exceeded" errors
- ✅ Console logs appear only when values actually change
- ✅ App remains responsive

---

**Status**: ✅ Fixed - All infinite render loops resolved

