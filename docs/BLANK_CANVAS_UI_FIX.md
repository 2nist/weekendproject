# Blank Canvas Button Fix

## Problem

The "Blank Canvas" button on the HOME page was navigating to `/sandbox` (the analysis view) instead of showing the UI for entering song parameters to build a song from scratch.

## Solution

Changed the Blank Canvas button to set `viewMode` to `'sandbox'` instead of navigating, which displays the `SandboxMode` component with the full UI for entering song parameters.

## Changes Made

### 1. `src/pages/Architect.jsx`

**Updated Blank Canvas button handlers:**
- Changed `onClick={() => navigate('/sandbox')}` to `onClick={() => setViewMode('sandbox')}`
- This applies to both instances of the button (when blocks are empty and when blocks are loaded)

**Enhanced error handling:**
- Added better logging for structure generation
- Improved IPC API detection (uses `globalThis` instead of `window`)
- Handles cases where blocks are returned without a `success` flag

**Improved UI:**
- Changed "Back to Arrangement" to "Back to Home" for clarity
- Added proper height and flex layout to SandboxMode container

### 2. `electron/main.js`

**Enhanced SANDBOX:GENERATE handler:**
- Uses `ensureBlockData()` helper to ensure all blocks have complete data structure
- Better logging with `[SANDBOX]` prefix

## How It Works

1. **User clicks "Blank Canvas" icon** on HOME page
2. **`viewMode` is set to `'sandbox'`**
3. **`SandboxMode` component is rendered** with:
   - Left panel: Constraint inputs (Genre, Form, Key, Mode, Tempo, Harmonic Complexity, Rhythmic Density, Sections)
   - Center panel: Generated structure display
   - Right panel: Section sculpting tools (when a section is selected)
4. **User enters parameters** and clicks "Generate Structure"
5. **IPC call to `SANDBOX:GENERATE`** with constraints
6. **Backend generates structure** using `structureGenerator.generateStructure()`
7. **Blocks are returned and displayed** in the center panel
8. **User can edit sections** and switch to grid view

## UI Features

The `SandboxMode` component provides:

### Constraint Panel (Left)
- **Genre**: pop, jazz, jazz_traditional, neo_soul, rock, folk, electronic
- **Song Form**: Verse-Chorus, AABA, Through-Composed, Strophic
- **Key & Mode**: Key selection (C, C#, D, etc.) + Mode (Major, Minor, Dorian, Mixolydian, Lydian)
- **Tempo**: Slider (60-180 BPM)
- **Harmonic Complexity**: Slider (0-100%) with descriptions
- **Rhythmic Density**: Slider (0-100%) with descriptions
- **Sections**: Slider (2-12 sections)
- **Generate Structure** button

### Generated Structure (Center)
- Displays generated sections as `ArrangementBlock` components
- Click to select and edit
- "View in Grid" button to switch to grid view

### Section Sculpting (Right - when selected)
- Section Label input
- Variant number input
- Length (bars) input
- Chord Progression textarea (comma-separated Roman numerals)
- `SectionSculptor` component for advanced editing

## Testing

1. ✅ Click "Blank Canvas" icon on HOME page
2. ✅ Verify `SandboxMode` UI appears with constraint panel
3. ✅ Enter parameters (e.g., Genre: pop, Form: verse-chorus, Key: C, Mode: major)
4. ✅ Click "Generate Structure"
5. ✅ Verify sections appear in center panel
6. ✅ Click a section to edit
7. ✅ Verify right panel shows sculpting tools
8. ✅ Click "View in Grid" to switch to grid view

---

**Status**: ✅ Fixed - Blank Canvas button now properly displays the UI for entering song parameters

