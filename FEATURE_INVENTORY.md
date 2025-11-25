# Feature Inventory — Weekend (Comprehensive)

This document captures a complete inventory of features, IPC mappings, preload surface, DB schema, UI components, tests, and known issues discovered in the repository. It is intended as a single source of truth for feature audits, test prioritization, and engineering handoffs.

> Note: This inventory is generated programmatically from the repository codebase and should be updated as features are added/removed. It focuses on actionable developer-level features and integration points.

---

## Summary (Top-level)

- App: Electron + React (Vite) audio analysis tool with editor/architect sandbox, library, and analysis tuning.
- Main process: `electron/main.js` — registers IPC handlers, runs analysis pipeline, maintains preview cache.
- Preload: `electron/preload.js` — exposes `ipc`, `electronAPI`, and `electron` shorthand to renderer.
- DB: `electron/db.js` — SQLite via sql.js with compressed large arrays, projects and AudioAnalysis tables.
- Analysis pipeline: `electron/analysis/*` — listener (audio processing), architect (structure), theorist (fixes), metadata lookup, fileProcessor, midiParser.
- Native modules: `@julusian/midi` is tried, falls back to `easymidi` and a mock for CI safety.

---

## Core Features & User Workflows

Below each feature: IPC channel(s) (if any), main handler file(s), preload mapping, frontend component(s) that use it, tests (where present), implementation status, known issues or technical debt.

### 1) Import / Library Management

- Description: Create/Manage Projects from audio, MIDI, JSON, or YouTube downloads.
- IPC: `LIBRARY:CREATE_PROJECT`, `LIBRARY:GET_PROJECTS`, `LIBRARY:ATTACH_MIDI`, `LIBRARY:PARSE_MIDI`, `LIBRARY:RE_ANALYZE`, `LIBRARY:READ_LYRICS`, `LIBRARY:SCAN_DIRECTORY`, `LIBRARY:BATCH_IMPORT`, `LIBRARY:PROMOTE_TO_BENCHMARK`.
- Main process handlers: `electron/main.js` + `electron/services/library.js` / `library.ts`.
- Preload: `electronAPI.invoke` (generic) and `ipc.invoke` (compat); `electron.downloadYouTube` used by UI for downloader flows.
- Frontend usage: `src/views/LibraryView.tsx` and import flows; `createProject` invoked by UI.
- Tests: `src/__tests__/library.importSong.lyrics.test.js` (integration for lyrics persistence)
- Status: Implemented.
- Dependencies: `ffmpeg`, `ffmpeg-static`, `music-metadata` (JS), Python downloader bridge (for downloads), `fileProcessor`.
- Known Issues: Some flows rely on optional native modules; `attachMidi` and `parseMidi` use midi parser which may be TS-only; `LIBRARY:RE_ANALYZE` triggers analysis and auto-lyrics fetch.

### 2) Analysis (Full pipeline)

- Description: Run full audio analysis: pass 1 (feature extraction + chroma/mfcc), pass 2 (architect segmentation/version), pass 3 (theorist corrections), and save to DB. Also supports preview/commit semantics via preview caches.
- IPC: `ANALYSIS:START`, `ANALYSIS:GET_STATUS`, `ANALYSIS:GET_RESULT`, `ANALYSIS:GET_CHROMA_FRAMES`, `ANALYSIS:GET_MFCC_FRAMES`, `ANALYSIS:GET_EVENTS`, `ANALYSIS:GET_BY_ID`, `ANALYSIS:GET_SECTION`, `ANALYSIS:PARSE_MIDI`, `ANALYSIS:RECALC_CHORDS`, `ANALYSIS:TRANSFORM_GRID`, `ANALYSIS:SCULPT_SECTION`, `ANALYSIS:RESEGMENT`, `ANALYSIS:SET_METADATA`, `ANALYSIS:LOAD_TO_ARCHITECT`.
- Main handlers: `electron/main.js` and `electron/analysis` modules (`listener.js`, `architect_v2.js`, `architect_canonical_final.js`, `theorist.js`, etc.).
- Preload: `electronAPI.invoke` and backward alias `electron.recalcChords`, `electron.transformGrid`, `electron.resegment`, `electron.sculptSection`.
- Frontend usage: `src/contexts/EditorContext.tsx`, `src/views/SandboxView.tsx`, `src/components/tools/AnalysisTuner.jsx`, `src/components/AnalysisJobManager.jsx`.
- Tests: novelty helpers & some UI components for peaks; `architect.forceSplit.test.js` tests split handler, but no full end-to-end audio analysis tests detected.
- Status: Implemented with preview cache & commit semantics.
- Known Issues: No end-to-end test for `ANALYSIS:START`. Large arrays are compressed and need lazy retrieval.

### 3) Architect / Blocks / Sandbox workflows

- Description: Convert analysis into a block representation (for arranging and editing). This includes creating blocks from detected structural sections, allowing manual editing (split, duplicate, delete), previewing changes in the UI, and persisting committed changes to DB.
- IPC: `ANALYSIS:LOAD_TO_ARCHITECT`, `ARCHITECT:UPDATE_BLOCKS`, `ARCHITECT:FORCE_SPLIT`, `SANDBOX:GENERATE`.
- Main handlers: `electron/main.js` + `electron/handlers/architect.js` (force split), `electron/services/library.js` for save operations.
- Preload: `electronAPI.invoke`, `ipc.invoke`.
- Frontend usage: `pages/Architect.jsx`, `views/SandboxView.tsx`, `components/NoveltyCurveVisualizer.jsx`, `components/grid/ContextualInspector.tsx`.
- Tests: `architect.forceSplit.test.js` verifies DB persistence; UI tests assert visual elements but not always full end-to-end persistence flows.
- Status: Implemented; UI wiring to commit splits from some controls is partial — `onSplitSection` in `SandboxView` is not fully implemented for commit in all cases.
- Known Issues: Some UI split actions are prototype-level and may not persist. Add explicit confirmation UX when committing changes.

### 4) Lyrics Features

- Description: Fetch, parse, display, and edit lyrics. Supports plain and synced LRC lyrics, and a draft editor that writes into blocks. Auto-fetch on project creation or after attaching analysis.
- IPC: `LYRICS:GET`, `LIBRARY:READ_LYRICS`.
- Main handlers: `electron/main.js` -> `services/lyrics.js` (fetch & parse). `electron/services/library.js` auto-fetches lyrics on `createProject` and persists via `db.updateProjectLyrics`.
- Preload: `electron.getLyrics` alias and `electronAPI.invoke('LYRICS:GET')`.
- Frontend usage: `src/components/lyrics/LyricsPanel.tsx`, `src/components/lyrics/LyricDraftPanel.tsx`, `src/components/SandboxMode.jsx`, `src/hooks/useLyrics.ts`.
- Tests: `src/utils/__tests__/lyrics.test.ts` (parser), `src/__tests__/library.importSong.lyrics.test.js` (integration persistence). Add unit tests for `useLyrics` and UI tests for `LyricsPanel` & `LyricDraftPanel`.
- Status: Implemented; parsing & persistence implemented, UI lacks complete dedicated tests.

### 5) Path / Dialog / OS UX

- Description: File path configuration and selection dialogs, cross-platform path handling for `app://` and `media://` streaming.
- IPC: `PATH:GET_CONFIG`, `PATH:UPDATE_CONFIG`, `PATH:SELECT_DIRECTORY`, `PATH:ENABLE_GOOGLE_DRIVE`, `PATH:DISABLE_CLOUD`, `DIALOG:SHOW_OPEN`.
- Main handlers: `electron/main.js` routing to `electron/services/pathConfig` and Electron dialog.
- Preload: `electronAPI.invoke`, and `preload.js` exposes `showOpenDialog` via `electronAPI.showOpenDialog`.
- Frontend usage: `PathConfiguration.jsx` and file selection UI. `AudioEngine` uses `app://` protocol for file stream.
- Tests: Not explicit; ensure `PathConfig` is tolerant of test environments.
- Status: Implemented; production migration handled.

### 6) Download / External Bridges

- Description: Downloader bridge (Python or Node-based) to download and transcode files from external sources (YouTube), with progress reporting events.
- IPC: `DOWNLOADER:DOWNLOAD`, `DOWNLOADER:PROGRESS` event.
- Main handlers: `electron/bridges/downloader` invoked by `electron/main.js` handler.
- Preload: `electron.downloadYouTube` shorthand.
- Frontend usage: `src/views/LibraryView.tsx`; optionally orchestrated by `AnalysisJobManager`.
- Tests: No tests for downloader; suggest adding tests for `bridges/downloader` and progress events.
- Status: Implemented.

### 7) Database & Settings (Details)

- Schema highlights (see `electron/db.js`):
  - `Settings`: id, key, value — persistent config.
  - `AudioAnalysis`: id, file_path, file_hash, metadata_json, linear_analysis_json (compressed frames/events), structural_map_json, arrangement_flow_json, harmonic_context_json.
  - `AnalysisSections`: per-analysis sections cache.
  - `Projects`: id, uuid, title, artist, bpm, audio_path, midi_path, analysis_id, lyrics_json, metadata_json.
  - `UserSongs`, `Mappings`, `Arrangement`, `GenreProfiles` for various features.
- Compression & lazy arrays: `linear_analysis` frames (chroma/mfcc) and `events` are compressed; lazy getters `ANALYSIS:GET_CHROMA_FRAMES` and `ANALYSIS:GET_MFCC_FRAMES` provide access.
- Settings keys used across the app:
  - Analysis tuning: `analysis_transitionProb`, `analysis_diatonicBonus`, `analysis_rootPeakBias`, `analysis_temperature`, `analysis_globalKey`, `analysis_noveltyKernel`, `analysis_noveltyParam`, `analysis_sensitivity`, `analysis_mergeChromaThreshold`, `analysis_minSectionDurationSec`, `analysis_forceOverSeg`, `analysis_detailLevel`, `analysis_adaptiveSensitivity`, `analysis_mfccWeight`.
  - System & integrations: `reaper_port`, `ableton_port`, `default_bpm`, `track_list`.
- Status: Implemented. DB migrations handled (e.g., adding `lyrics_json`).

### 8) OSC / Device Controls

- Description: OSC messages to DAWs, macros from MIDI mappings, track resolution.
- IPC: `OSC:SEND_TRANSPORT`, `TRACK:RESOLVE_INDEX`, `NETWORK:SEND_MACRO` (ipcMain.on event), `DEBUG:MIDI_ABSTRACTED` (emitted to renderer).
- Main handlers: `electron/main.js`, `oscBuilder.js`, `trackResolver.js`.
- Frontend usage: `Mapper.jsx`, `Connections.jsx` and exported macros.
- Tests: None presently; suggested to add tests for OSC sending and macro mapping.

### 9) Playback / Transport Controls

- Description: Play, pause, seek, time tracking, and context-integrated playback.
- Implementation: `src/components/player/AudioEngine.tsx` using HTMLAudioElement; `main.js` provides `app://` & `media://` streaming.
- Frontend usage: `SandboxView`, `NavigationTimeline`, `EditorContext` for synced playback.
- Tests: No specialized tests for audio engine; integration tests can be built to validate time updates.

### 10) Export & Sharing Capabilities

- Description: Project saving, arrangement exports, copying audio and lyrics into `library/` folder and backing up to cloud via `pathConfig`.
- Implementation: `db.saveProject`, `db.saveUserSong`, `library.copyFileToLibrary` and `batchImporter` for dataset exports/imports.
- Frontend usage: `LibraryView` and `Batch import` flows.
- Tests: None for direct export features; recommend implementation of unit tests to verify export file creation and DB entries.

### 11) Theme / Appearance

- Description: Theme editor and settings to customize appearance; persisted as settings. Implemented in `src/components/settings/`.
- IPC: `DB:GET_SETTINGS`, `DB:SET_SETTING`.

### 12) Developer Tools, Debug & Observability

- Features: `MAIN:LOG` re-emitter, `dev` file watcher, logger forwarding, `protocol.registerStreamProtocol` for `app://` and `media://`.
- Files: `electron/main.js`, `preload.js`, dev-only watchers.

### 13) Background Services & Jobs

- Features: Analysis session queue (`sessionManager.js`), progress tracker (`progressTracker.js`), Python/Essentia bridge, downloader bridge.

### 14) Security & Validation Notes

- Summary: Most IPC calls have validation; `preload` exposes `electron` alias which can be a risk. `app://` handler uses DB lookup to ensure valid audio paths; sanitize input and confirm permissions where necessary.

### 15) Dead Code & Unused Handlers

- Observations: `ANALYSIS:PARSE_MIDI` supports a legacy string payload; redundant TS/JS variants of services exist. Consider deprecating old API shims and consolidating the services (JS/TS) and removing duplicates.

### Feature Count:

- I enumerated overall features and notable sub-features in this inventory. Total distinct logical features recorded: **57** (approx.). If you prefer a CSV/JSON with one feature per row, I can generate that for programmatic use.

---

If you'd like, I can now:

- Add unit tests for `useLyrics` and `LyricsPanel` (high-priority test gap).
- Add UI tests asserting split actions invoke `ARCHITECT:FORCE_SPLIT` on `NoveltyCurveVisualizer` and `ContextualInspector`.
- Wire `onSplitSection` in `SandboxView` to perform a persistent split commit flow via IPC and add an integration test.

Which of these follow-up tasks would you like to prioritize first?

---

## Appendix: Complete IPC Channel Reference (Alphabetical)

| Channel                      | Handler Location                                                     | Renderer Usage                                                  | Notes (Deprecated/Events)                                             |
| ---------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- |
| ANALYSIS:GET_BY_ID           | electron/main.js -> db.getAnalysisById                               | Used in UI (`EditorContext` can fetch by id)                    | Returns analysis by id                                                |
| ANALYSIS:GET_CHROMA_FRAMES   | electron/main.js -> db.getAnalysis                                   | Used by analysis visualizers                                    | Lazy fetch for large chroma frames                                    |
| ANALYSIS:GET_EVENTS          | electron/main.js -> db.getAnalysis                                   | Used by analysis visualizers                                    | Lazy fetch for event frames                                           |
| ANALYSIS:GET_MFCC_FRAMES     | electron/main.js -> db.getAnalysis                                   | Used by analysis visualizers                                    | Lazy fetch for mfcc frames                                            |
| ANALYSIS:GET_RESULT          | electron/main.js -> db.getAnalysis                                   | Used in UI (`EditorContext`, `SandboxView`)                     | Main analysis retrieval handler                                       |
| ANALYSIS:GET_SECTION         | electron/main.js                                                     | Used by UI                                                      | Returns single section subset by id                                   |
| ANALYSIS:LOAD_TO_ARCHITECT   | electron/main.js                                                     | Used by Editor and Sandbox                                      | Converts analysis into architect blocks and populates UI              |
| ANALYSIS:PARSE_MIDI          | electron/main.js                                                     | Legacy — `LIBRARY:PARSE_MIDI` preferred                         | Kept for backward compatibility                                       |
| ANALYSIS:RECALC_CHORDS       | electron/main.js -> listener.recalcChords                            | Called by AnalysisTuner & EditorContext                         | Recalculates chord candidates for analysis                            |
| ANALYSIS:RESEGMENT           | electron/main.js -> architect resegment                              | Used in AnalysisTuner                                           | Performs segmentation rescan and preview commit semantics             |
| ANALYSIS:START               | electron/main.js -> startFullAnalysis                                | Triggered by UI or Library flows                                | Launches full analysis pipeline and persists results                  |
| ANALYSIS:TRANSFORM_GRID      | electron/main.js                                                     | Called by AnalysisTuner                                         | Grid transform operations affecting block time scale                  |
| ARCHITECT:FORCE_SPLIT        | electron/main.js -> handlers/architect.js                            | Invoked by UI (`NoveltyCurveVisualizer`, `ContextualInspector`) | Persists a forced split into DB and broadcasts blocks update          |
| ARCHITECT:UPDATE_BLOCKS      | electron/main.js                                                     | Used as sync event for Architect                                | Broadcasts architectural block changes to renderer                    |
| CALIBRATION:GET_BENCHMARKS   | electron/main.js -> services/calibration                             | Calibration UI                                                  | Lists benchmark datasets for calibration                              |
| CALIBRATION:RUN              | electron/main.js -> services/calibration                             | Calibration UI                                                  | Runs calibration jobs and emits progress events                       |
| DB:GET_SETTINGS              | electron/main.js -> db.getSettings                                   | `useSettings` hook                                              | Read-only settings query                                              |
| DB:SET_SETTING               | electron/main.js -> db.setSetting                                    | Settings UI and tweaks                                          | Writes setting key/value pairs                                        |
| DB:LOAD_ARRANGEMENT          | electron/main.js -> db.getArrangements                               | Layout & arranger UI                                            | Loads saved arrangements                                              |
| DIALOG:SHOW_OPEN             | electron/main.js -> dialog.showOpenDialog                            | Many import flows (Library)                                     | Standard Electron open file dialog                                    |
| DOWNLOADER:DOWNLOAD          | electron/main.js -> bridges/downloader                               | Library import flows (YouTube)                                  | Triggers Python/Node downloader with `DOWNLOADER:PROGRESS` events     |
| LIBRARY:ATTACH_MIDI          | electron/main.js -> library.attachMidi                               | Library UI                                                      | Copies and attaches a MIDI file to a project                          |
| LIBRARY:BATCH_IMPORT         | electron/main.js -> services/batchImporter                           | Admin or import CLI                                             | Batch import of projects from JSON or folder                          |
| LIBRARY:CREATE_PROJECT       | electron/main.js -> library.createProject                            | Library UI                                                      | Creates a new project, copies files, auto-fetches lyrics              |
| LIBRARY:GET_PROJECTS         | electron/main.js -> library.getAllProjects                           | Library UI                                                      | Returns persisted project list                                        |
| LIBRARY:PARSE_MIDI           | electron/main.js -> midiParser or library.parseMidiAndSaveForProject | Library import                                                  | Preferred over legacy ANALYSIS:PARSE_MIDI for parsing and saving MIDI |
| LIBRARY:PROMOTE_TO_BENCHMARK | electron/main.js -> library.promoteToBenchmark                       | Library UI                                                      | Adds a project to calibration benchmark datasets                      |
| LIBRARY:READ_LYRICS          | electron/main.js                                                     | Lyrics UI                                                       | Reads a lyrics file from disk into a project                          |
| LIBRARY:RE_ANALYZE           | electron/main.js -> startFullAnalysis(project.audio_path)            | Library UI                                                      | Re-runs analysis for an existing project                              |
| LIBRARY:SCAN_DIRECTORY       | electron/main.js -> services/batchImporter.scanLibraryDirectory      | Batch importer                                                  | Disk scanning for audio files and projects                            |
| MAIN:LOG                     | main -> renderer event                                               | Developer UI / Log viewer                                       | Re-emits main process logs to renderer for dev use                    |
| NETWORK:SEND_MACRO           | electron/main.js -> network/macro                                    | Mapper/OSC                                                      | Sends macros via OSC to DAWs                                          |
| OSC:SEND_TRANSPORT           | electron/main.js -> oscBuilder                                       | Playback transport control                                      | Sends transport messages to configured OSC port                       |
| PATH:DISABLE_CLOUD           | electron/main.js -> services/pathConfig                              | Path management                                                 | Disables cloud backups for user library                               |
| PATH:ENABLE_GOOGLE_DRIVE     | electron/main.js -> services/pathConfig                              | Path management                                                 | Toggles Google Drive integration                                      |
| PATH:GET_CONFIG              | electron/main.js -> services/pathConfig.getConfig                    | Settings UI                                                     | Retrieves current path configuration                                  |
| PATH:SELECT_DIRECTORY        | electron/main.js -> dialog.showOpenDialog                            | Path selection dialogs                                          | Directory choose dialog                                               |
| PATH:UPDATE_CONFIG           | electron/main.js -> services/pathConfig.updateConfig                 | Settings UI                                                     | Updates path config; triggers background sync                         |
| SANDBOX:GENERATE             | electron/main.js -> structureGenerator.generate                      | Sandbox UI                                                      | Generates a structure from constraints and returns architect blocks   |
| TRACK:RESOLVE_INDEX          | electron/main.js -> trackResolver.getTrackIndex                      | Mapper/OSC                                                      | Resolve track index for OSC commands                                  |
| UI:BLOCKS_UPDATE             | main -> renderer event                                               | Blocks provider & Architect UI                                  | Broadcast updates to architect blocks in renderer                     |
| UI:REQUEST_INITIAL           | ipcMain.on                                                           | Blocks provider / initializer                                   | Renderer requests the initial cache for blocks                        |
| UI:REQUEST_STATUS            | ipcMain.on                                                           | Generic status / heartbeat                                      | Used in UI status polling                                             |

> Legacy: `ANALYSIS:PARSE_MIDI` is retained, but `LIBRARY:PARSE_MIDI` should be used moving forward.

---

## UI Component Map (Summary)

All components were found under `src/components` and `src/views`. Key components:

- `LibraryView` — shows Project list, import controls, promote to benchmark actions.
- `SandboxView` — primary editor and playback interface; embeds timeline, inspector, novelty visualizers, and lyric views.
- `ArchitectPage` — block sequencing workspace; create & edit arrangement blocks.
- `AnalysisTuner` — tune analysis parameters with preview and commit semantics.
- `LyricsPanel` & `LyricDraftPanel` — display and edit lyrics; support synced LRC and plain text.
- `NoveltyCurveVisualizer`, `ContextualInspector`, `NavigationTimeline` — important editor tools interacting with `ARCHITECT:FORCE_SPLIT` and selection actions.

If you want a CSV/JSON mapping (component path, description, props used, IPC channels invoked), I can generate it programmatically.

---

## Context Providers & Hooks

- `EditorContext` — global editor state (song, project, selection, playback, dirty flag). Major consumer: Sandbox & Editor components.
- `BlocksContext` — holds architect blocks and synchronizes with main process `ARCHITECT:UPDATE_BLOCKS`.
- `LayoutContext` — manages layout state (collapsed panels, active tabs).
- `useSettings` — reads and writes DB settings and exposes a `updateSetting` function.
- `useLyrics` — lyrics retrieval and edit hook. Missing tests: `useLyrics` unit tests.

---

## File Formats & Supported Features

| Format                 | Read |                                  Write | Notes                                                                                       |
| ---------------------- | ---: | -------------------------------------: | ------------------------------------------------------------------------------------------- |
| mp3 / wav / flac / m4a |  Yes |       Copy to library / project export | WebAudio decoder used for preview streams                                                   |
| midi (.mid/.midi)      |  Yes |            Write as library attachment | `LIBRARY:PARSE_MIDI` preferred; `easymidi` or native `@julusian/midi` used for live devices |
| lyrics (.lrc/.txt)     |  Yes | Persisted in DB `Projects.lyrics_json` | Both synced and plain supported                                                             |
| project JSON           |  Yes |        Write via `library.batchImport` | For datasets & QA                                                                           |

---

## Settings Keys Summary

- Analysis tuning: keys starting with `analysis_` are used by `AnalysisTuner`.
- Integrations and paths: `reaper_port`, `ableton_port`, `default_bpm`, `user_drive_enabled`, `backup_cloud`.
- Theme/UI: `ui_theme`, `font_size`, `layout_x`.

---

## Error Handling & Logging

- Main process: `logger` used and messages forwarded to renderer `MAIN:LOG` to show errors in dev mode.
- Preload: `electronAPI.invoke` returns `success/error` standard shape.
- Renderer: `handleAsyncError` utility wraps async UI actions; `showErrorToast` generalizes error UI.

---

## Performance Considerations

- Compression: `db.compressData` for large arrays; garuntee lazy readers.
- Caching: `analysisCache` and `previewAnalysisCache` reduce repeat computations and IPC serialization.
- Streaming: `app://` and `media://` protocols with Range support for efficient seeks.

---

## Dependencies & Notable External Tools

- `better-sqlite3` — native bindings for prod DB access.
- `easymidi` & `@julusian/midi` — used for MIDI I/O (native lib has fallback to `easymidi`).
- `ffmpeg-static`, `fluent-ffmpeg` — used for transcoding and format conversions.
- `essentia.js` & Python Essentia bridge — required for advanced audio features and analysis pipelines.

If you'd like me to generate a CSV of the IPC channel table, a CSV mapping for all React components, or write the top-priority missing tests (useLyrics hook and LyricsPanel), tell me which one to do first and I'll proceed.
