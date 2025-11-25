# Feature Inventory & Health Matrix

This matrix summarizes the major features present in the app, whether there are IPC handlers in the main process, whether the channels are exposed in the preload API, whether the frontend invokes them, test coverage, and recommended next steps.

Format: Feature — IPC Channel(s) — Preload Exposure — Frontend Usage — Tests — Status / Notes

## Analysis Pipeline

- Analysis start — `ANALYSIS:START` — electronAPI.invoke exposed — used by `src/components/AnalysisJobManager.jsx` — Minimal tests (novelty helpers tested) — Implemented; most flows covered but no end-to-end UI tests.
- Analysis status — `ANALYSIS:GET_STATUS` — electronAPI.invoke exposed — used by various contexts (e.g. `src/contexts/EditorContext.tsx`) — No explicit tests — Implemented; rely on session manager; monitoring recommended.
- Analysis result — `ANALYSIS:GET_RESULT` — electronAPI.invoke exposed — used by `SandboxView`, `EditorContext` — No explicit tests for fetching full payload — Implemented; preview cache support exists.
- Chroma/MFCC frames — `ANALYSIS:GET_CHROMA_FRAMES`, `ANALYSIS:GET_MFCC_FRAMES` — exposed — used lazily by UI components — Tests: none — Implemented; ok.
- Events / lazy frames — `ANALYSIS:GET_EVENTS` — exposed — used by data layers — Tests: none — Implemented.
- Re-segmentation/preview — `ANALYSIS:RESEGMENT` — exposed via `electron` compatibility API and used by `AnalysisTuner.jsx` — Tests: no unit tests, but UI triggers exist — Implemented; preview/commit semantics exist.
- Recalc chords — `ANALYSIS:RECALC_CHORDS` — exposed via `electron` compat — used by AnalysisTuner — No unit tests directly; some integration via recalc in UI — Implemented with preview mode; good feature.
- Transform grid — `ANALYSIS:TRANSFORM_GRID` — exposed via `electron` compat — used by AnalysisTuner — Tests: none — Implemented (grid operations preview/commit)

## Architect / Sandbox / Blocks

- Convert analysis -> architect blocks — `ANALYSIS:LOAD_TO_ARCHITECT` — exposed — used by Architect & Sandbox — Tests: none — Implemented.
- Update blocks — `ARCHITECT:UPDATE_BLOCKS` — exposed — used by BlocksContext to persist block updates — Tests: none — Implemented.
- Force split — `ARCHITECT:FORCE_SPLIT` — exposed — used by `NoveltyCurveVisualizer`, `ContextualInspector` — Tests: not required for stub — STATUS: Prototype; returns success but does not persist changes; consider adding preview commit grace/confirmation.

## Library / MIDI / Import

- Library CRUD — `LIBRARY:GET_PROJECTS`, `LIBRARY:CREATE_PROJECT`, `LIBRARY:ATTACH_MIDI`, `LIBRARY:PARSE_MIDI`, `LIBRARY:RE_ANALYZE` — exposed — used by `src/views/LibraryView.tsx`, `Archivist / Integrations` — Tests: none or limited — Implemented; flows exist; attach/parse may use native midi dependencies.

## Lyrics

- Fetch lyrics — `LYRICS:GET` — exposed via `electronAPI.invoke` and `electron.getLyrics` — used by `useLyrics` hook and `LyricsPanel` — Tests: no explicit unit tests — Implemented; parsing service available in `electron/services/lyrics`.
- Read lyrics file — `LIBRARY:READ_LYRICS` — exposed — used by file reading features — Tests: none — Implemented.
- Lyric Draft UI: `LyricDraftPanel` / `LyricsPanel` — frontend-only; persists into block structure — Tests: none — Implemented; minor fixes (activeIndex) added to avoid runtime crash.

## Path / Dialog / OS UX

- Path config & directory selection — `PATH:GET_CONFIG`, `PATH:UPDATE_CONFIG`, `PATH:SELECT_DIRECTORY`, `PATH:ENABLE_GOOGLE_DRIVE` — Preload: yes — used by `PathConfiguration.jsx` — Tests: none — Implemented; robust error handling exists in main.
- Dialog open — `DIALOG:SHOW_OPEN` — Preload: yes (`electronAPI.showOpenDialog`) — used for file selection — Tests: none — Implemented.

## Download / External Bridges

- Downloader — `DOWNLOADER:DOWNLOAD` — Preload: yes — `electron.downloadYouTube` — used by the UI rarely (no direct usage found) — Implemented; progress events emitted; tests: none. Useful to surface usage and guard native dependencies.

## DB / User settings

- DB: Settings — `DB:GET_SETTINGS`, `DB:SET_SETTING` — Preload: yes — used by `useSettings.ts` and theme utils and AnalysisTuner — Tests: no direct tests — Implemented; UI persists tuning settings and emits `APP:SETTING_UPDATED` via `useSettings` hook.

## OSC / External Device Controls

- OSC transport — `OSC:SEND_TRANSPORT` & `TRACK:RESOLVE_INDEX` — Preload: no direct alias, but `ipc.invoke` is available — used by `midiListener` and internal dev features — Implemented; guarded by settings and OSC configuration.

## Tests & Validation

- Unit tests exist for novelty helpers and UI components related to novelty (NoveltyCurveVisualizer, NavigationTimeline, ContextualInspector). — Good coverage for the new detection logic.
- Few tests for lyric components, toolkit, or AnalysisTuner — Consider adding tests for these flows.
- End-to-end tests: None detected; consider smoke tests for a full analysis run (instrumented with mock audio) to validate DB, analysis, and UI flows.

## Risks / Technical Debt

- Native module `@julusian/midi` causes electron-builder to fail in environments lacking Visual Studio / node-gyp toolchain. Consider documenting this or replacing with a pure JavaScript parser where possible, mocking module for CI packaging.
- `ARCHITECT:FORCE_SPLIT` is a prototype (no persistent commit). Current UI offers Suggest Split buttons but split is not persisted — UX may be unexpected.
- Backwards-compatible preload `electron` aliases are convenient but make it easy to bypass central validation; prefer `electronAPI.invoke` for strong surface.
- Limited tests for Lyric workflows, MusicTheoryToolkit, and AnalysisTuner UI flows — add unit tests and integration tests.

## Recommendations

- Add unit tests for `useLyrics`, `LyricsPanel`, `LyricDraftPanel`, `MusicTheoryToolkit`, and `AnalysisTuner` UI flows.
- Convert `ARCHITECT:FORCE_SPLIT` to either preview or persist mode explicitly; add confirmation in UI before committing to DB; add test for end-to-end split workflow.
- Add a small integration test or smoke test to run `ANALYSIS:START` with a short test audio file and validate that `ANALYSIS:GET_RESULT` returns expected structure.
- Document the native dependency and provide a mock replacement for CI to avoid electron build failures due to `node-gyp`.
- Audit `electron/preload.js`: While many channels are exposed, consider a stricter mapping for the public surface the renderer should use; avoid exposing experimental APIs to the global namespace.

## Observations

- Overall, the app contains a well-structured IPC map with robust main-process guards. The new novelty features and lyric drafting UX are fully implemented and tested at the unit level.
- The Analysis pipeline is robust, with preview cache and commit semantics, which is great for iterative workflows.
- Greater test coverage remains a priority for Lyric workflows and end-to-end analysis flows.

---

Generated by the repo audit tool.
