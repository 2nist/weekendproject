# Harmonic Grid UI - Implementation Guide

## Overview

The Harmonic Grid UI translates linear time (seconds) into musical time (Bars & Beats), providing a visual, interactive interface for editing song structure at the beat level.

## Architecture

### Data Flow

```
Linear Analysis (seconds) 
  ↓
musicTimeTransform.ts (transformAnalysisToGrid)
  ↓
Grid Structure (bars & beats)
  ↓
React Components (BeatCard → Measure → Section)
```

### Component Hierarchy

```
HarmonicGrid (Main orchestrator)
  └── SectionContainer (Section wrapper with editing)
       ├── ProgressionBracket (Progression overlays)
       └── MeasureGroup (4-beat container)
            └── BeatCard × 4 (Individual beats)
```

## Components

### 1. BeatCard (`src/components/grid/BeatCard.tsx`)

**Purpose**: Atomic unit representing a single quarter note beat.

**Props**:
- `beat: BeatNode` - Beat data (chord, function, timestamp)
- `onClick?: (beat) => void` - Click handler
- `onDoubleClick?: (beat) => void` - Double-click handler (edit)

**Features**:
- Visual distinction between "Attack" beats (new chord) and "Sustain" beats
- Displays chord name and function label (e.g., "V7")
- Hover effects and selection state

### 2. MeasureGroup (`src/components/grid/MeasureGroup.tsx`)

**Purpose**: Container for 4 beat cards (one measure in 4/4 time).

**Props**:
- `measure: Measure` - Measure data (bar number, beats)
- `onBeatClick?: (beat) => void` - Beat click handler
- `onBeatDoubleClick?: (beat) => void` - Beat edit handler

**Features**:
- Groups 4 beats horizontally
- Displays bar number header
- Rounded container with dark background

### 3. ProgressionBracket (`src/components/grid/ProgressionBracket.tsx`)

**Purpose**: Visual overlay showing chord progressions spanning multiple measures.

**Props**:
- `progression: ProgressionGroup` - Progression data
- `measureWidth: number` - Width of a single measure in pixels
- `onEdit?: (progression) => void` - Edit handler

**Features**:
- Spans across multiple measures
- Displays progression label (e.g., "ii-V-I Turnaround")
- Clickable for editing

### 4. SectionContainer (`src/components/grid/SectionContainer.tsx`)

**Purpose**: Wrapper for multiple measures, representing a song section (Verse, Chorus, etc.).

**Props**:
- `section: Section` - Section data
- `progressions?: ProgressionGroup[]` - Progression overlays
- `onBeatClick`, `onBeatDoubleClick` - Beat handlers
- `onSectionEdit`, `onSectionClone` - Section editing handlers
- `onProgressionEdit` - Progression editing handler

**Features**:
- Color-coded left border (blue for verse, green for chorus, etc.)
- Collapsible/expandable
- Section header with edit/clone buttons
- Displays progression brackets above measures

### 5. HarmonicGrid (`src/components/grid/HarmonicGrid.tsx`)

**Purpose**: Main orchestrator component that transforms analysis data and renders the grid.

**Props**:
- `linearAnalysis: any` - Output from Pass 1 (The Listener)
- `structuralMap?: any` - Output from Pass 2/3 (The Architect/Theorist)
- Event handlers for beats, sections, and progressions

**Features**:
- Transforms linear time to musical time
- Groups measures into sections
- Detects and displays progression groups
- Handles beat selection and editing

## Data Transformation

### `transformAnalysisToGrid()` Function

Located in `src/utils/musicTimeTransform.ts`, this function:

1. **Extracts timing data**:
   - Tempo (BPM) from `beat_grid.tempo_bpm`
   - Beat timestamps from `beat_grid.beat_timestamps`
   - Downbeat timestamps from `beat_grid.downbeat_timestamps`

2. **Maps chord events to beats**:
   - Finds closest chord event to each beat timestamp
   - Determines if beat is an "attack" (new chord) or "sustain" (holding chord)
   - Extracts function labels from theorist data

3. **Groups beats into measures**:
   - Assumes 4/4 time (4 beats per measure)
   - Uses downbeats to determine measure boundaries
   - Falls back to tempo calculation if beat timestamps unavailable

4. **Groups measures into sections**:
   - Uses `structural_map.sections` to determine section boundaries
   - Assigns color codes based on section type
   - Creates section containers

### Example Transformation

**Input** (Linear Analysis):
```json
{
  "beat_grid": {
    "tempo_bpm": 120,
    "beat_timestamps": [0.0, 0.5, 1.0, 1.5, 2.0, ...]
  },
  "events": [
    {"timestamp": 0.5, "event_type": "chord_candidate", "chord": "Cmaj7"},
    {"timestamp": 2.0, "event_type": "chord_candidate", "chord": "Am7"}
  ]
}
```

**Output** (Grid Structure):
```typescript
[
  {
    id: "section-1",
    label: "Verse",
    measures: [
      {
        index: 1,
        beats: [
          {beatIndex: 0, chordLabel: null, isAttack: false},
          {beatIndex: 1, chordLabel: "Cmaj7", isAttack: true},
          {beatIndex: 2, chordLabel: "Cmaj7", isAttack: false},
          {beatIndex: 3, chordLabel: "Cmaj7", isAttack: false}
        ]
      },
      {
        index: 2,
        beats: [
          {beatIndex: 0, chordLabel: "Am7", isAttack: true},
          ...
        ]
      }
    ]
  }
]
```

## Integration

### In Architect View

The HarmonicGrid is integrated into `src/pages/Architect.jsx`:

1. **View Mode Toggle**: Added "Harmonic Grid" button to switch views
2. **Data Loading**: Listens for `analysis:data` events from AnalysisJobManager
3. **State Management**: Stores `analysisData` and `structuralMap` in component state

### Data Flow from Analysis

1. Analysis completes in `AnalysisJobManager`
2. Analysis result is fetched via `ANALYSIS:GET_RESULT`
3. `analysis:data` event is dispatched with `linear_analysis` and `structural_map`
4. `HarmonicGrid` receives data and transforms it
5. Grid is rendered with sections, measures, and beats

## Usage

### Accessing the Grid

1. Run an audio analysis
2. Navigate to Architect view
3. Click "Harmonic Grid" button
4. View the beat-level structure

### Interactions

- **Click Beat**: Select/deselect beat
- **Double-Click Beat**: Open edit modal (placeholder - implement as needed)
- **Click Progression Bracket**: Edit progression group
- **Click Section Header**: Expand/collapse section
- **Click "Edit" on Section**: Edit section properties
- **Click "Clone" on Section**: Duplicate section

## Styling

Uses Tailwind CSS with dark mode theme:
- Background: `slate-900` / `gray-900`
- Accent: `indigo-500` / `indigo-600`
- Cards: `h-24 w-20` (96px × 80px)
- Spacing: `gap-2` (8px) between beats, `gap-4` (16px) between measures

## Future Enhancements

- [ ] Beat editing modal with chord picker
- [ ] Drag-and-drop section reordering
- [ ] Progression replacement UI
- [ ] Real-time updates when analysis completes
- [ ] Export grid to MIDI or notation
- [ ] Keyboard shortcuts for navigation
- [ ] Multi-select beats for bulk editing
- [ ] Undo/redo functionality

## Files Created

1. `src/utils/musicTimeTransform.ts` - Data transformation utilities
2. `src/components/grid/BeatCard.tsx` - Beat card component
3. `src/components/grid/MeasureGroup.tsx` - Measure container
4. `src/components/grid/ProgressionBracket.tsx` - Progression overlay
5. `src/components/grid/SectionContainer.tsx` - Section wrapper
6. `src/components/grid/HarmonicGrid.tsx` - Main grid component

## Integration Points

- `src/pages/Architect.jsx` - Added grid view mode
- `src/components/AnalysisJobManager.jsx` - Dispatches analysis data events



