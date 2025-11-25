# Workflow Refinement Feature Brief

Goal: make the analysis-to-sandbox workflow feel intuitive while reusing the existing analysis caches, EditorContext, and playback logic.

## Feature Backlog

| #   | Feature                     | Description                                                                                                                                                                      | Key Reuse                                                         | Difficulty |
| --- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------- |
| 1   | Resume Latest Analysis      | Surface "Resume last analysis" CTA in Analysis/Library views by reading the persisted sandbox context (already stored in `localStorage`) and dispatching `OPEN_SANDBOX`.         | `analysisCache`, persisted sandbox snapshot, `OPEN_SANDBOX` event | Small      |
| 2   | Auto-Open on Completion     | Allow users to opt into automatically opening Sandbox when an analysis job reaches `completed` by hooking into `AnalysisJobManager` progress stream.                             | `AnalysisJobManager` events, existing event bus                   | Medium     |
| 3   | Context Chips               | Show track metadata (title, artist, key, duration, confidence flag) at the top of Sandbox using `songData.metadata`. Chips update when `EditorContext` changes.                  | `EditorContext` state, `analysisCache`                            | Small      |
| 4   | Synced Playback UI          | Tie BottomDeck and Sandbox grid together: when one seeks, the other scrolls; selection highlights active measures. Uses shared playback state already in `EditorContext`.        | `EditorContext` playback state, `useAnalysisSandbox`              | Medium     |
| 5   | Structure Summary Panel     | Populate Inspector panel with Verse/Chorus patterns, novelty spikes, and key changes derived from `songData.structural_map` and novelty data.                                    | `useAnalysisSandbox`, novelty curve data                          | Medium     |
| 6   | ~~Quick Compare Runs~~ (V2) | Deferred to a later release. Focus current cycle on nailing core editing before introducing historical diffing complexity.                                                       | —                                                                 | —          |
| 7   | Library Sparklines          | Render lightweight novelty-curve sparklines (SVG polylines) beside each project instead of full audio waveforms, keeping scroll performant even with 50+ rows.                   | Novelty curve data, existing library list                         | Medium     |
| 8   | Guided Workflow Checklist   | Add an always-on checklist (SidePanel) reflecting common steps (Run → Review → Adjust → Export). Uses existing `isProcessing`, `isDirty`, `selection` flags to auto-check steps. | `EditorContext` flags, SidePanel                                  | Medium     |
| 9   | Contextual Inspector Edits  | When a beat/section is selected, Inspector shows harmonic + raw metadata with edit controls wired to `updateBeat`/`updateSection`.                                               | `EditorContext` actions                                           | Medium     |
| 10  | Inline Docs Links           | Link contextual tooltips to relevant files under `/docs` (e.g., novelty explanation). Provide quick open actions from the UI.                                                    | Existing docs (`/docs/*.md`)                                      | Small      |

## Suggested Sequencing

1. **Quick wins** (1,3,10) improve perceived polish immediately.
2. **Workflow glue** (2,4,8,9) deepens flow by keeping audio + selections in sync.
3. **Insight layers** (5,7) expose more analytical value once fundamentals feel solid. (Feature 6 is explicitly deferred to V2.)

## Deferred / V2 Candidates

- **Quick Compare Runs (Feature 6)** – keep the idea, but revisit after Feature 9 (Contextual Inspector Edits) ships so the current editing flow is flawless before diffing past analyses.

## Notes

- Difficulty is relative: _Small_ (<1 day), _Medium_ (1–2 days), _Large_ (multi-day / cross-cutting).
- All features deliberately reuse existing IPC bridges, caches, and context state to minimize backend churn.
- When implementing, keep persistence consistent with `analysisCache`/`localStorage` to avoid regressions.
- Full waveforms in Library are intentionally avoided; novelty sparklines give the same quick read without the performance hit of rendering dozens of canvases.
