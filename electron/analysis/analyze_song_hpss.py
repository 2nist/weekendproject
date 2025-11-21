#!/usr/bin/env python3
"""Optimized single-pass HPSS + vectorized chord & drum analysis.
Outputs structure compatible with existing Electron pipeline.
Produces linear_analysis with beat_grid, events, chroma and mfcc frames."""
import sys
import json
import numpy as np
import librosa
import tempfile
# 'os' can be safely removed (tempfile handles paths)
from scipy.signal import butter, filtfilt

# --- Chord Templates (Major / Minor) ---
ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
TEMPLATES = []
LABELS = []
for i in range(12):  # Major triads
    v = np.zeros(12)
    v[i] = 1
    v[(i + 4) % 12] = 1
    v[(i + 7) % 12] = 1
    TEMPLATES.append(v)
    LABELS.append(ROOTS[i])
for i in range(12):  # Minor triads
    v = np.zeros(12)
    v[i] = 1
    v[(i + 3) % 12] = 1
    v[(i + 7) % 12] = 1
    TEMPLATES.append(v)
    LABELS.append(ROOTS[i] + 'm')
TEMPLATE_MATRIX = np.array(TEMPLATES)  # (24,12)

 
def estimate_chord_vectorized(chroma_frame: np.ndarray) -> str:
    norm = np.linalg.norm(chroma_frame)
    if norm == 0:
        return 'N'
    cf = chroma_frame / norm
    scores = TEMPLATE_MATRIX @ cf
    return LABELS[int(np.argmax(scores))]

 
def detect_drums(y_perc: np.ndarray, sr: int, beat_times: np.ndarray):
    # Kick <100Hz
    bk, ak = butter(4, 100 / (sr / 2), btype='low')
    kick_sig = filtfilt(bk, ak, y_perc)
    kick_onsets = librosa.onset.onset_detect(
        y=kick_sig, sr=sr, units='time', delta=0.1
    )
    # Snare 200-500Hz
    bs, as_ = butter(4, [200 / (sr / 2), 500 / (sr / 2)], btype='band')
    snare_sig = filtfilt(bs, as_, y_perc)
    snare_onsets = librosa.onset.onset_detect(
        y=snare_sig, sr=sr, units='time', delta=0.1
    )
    kick_set = np.array(kick_onsets)
    snare_set = np.array(snare_onsets)
    tol = 0.05
    drum_grid = []
    for i, t in enumerate(beat_times):
        has_kick = len(kick_set) > 0 and np.min(np.abs(kick_set - t)) < tol
        has_snare = len(snare_set) > 0 and np.min(np.abs(snare_set - t)) < tol
        drums = []
        if has_kick:
            drums.append('kick')
        if has_snare:
            drums.append('snare')
        drum_grid.append({
            'time': float(t),
            'drums': drums,
            'hasKick': bool(has_kick),
            'hasSnare': bool(has_snare)
        })
    return drum_grid

 
def analyze(file_path: str):
    try:
        print(json.dumps({'status': 'progress', 'value': 5}), flush=True)
        y, sr = librosa.load(file_path, sr=22050, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({'status': 'progress', 'value': 20}), flush=True)

        y_harm, y_perc = librosa.effects.hpss(y, margin=3.0)
        print(json.dumps({'status': 'progress', 'value': 40}), flush=True)

        tempo, beat_frames = librosa.beat.beat_track(y=y_perc, sr=sr)
        if isinstance(tempo, (np.ndarray, list)):
            tempo = float(np.squeeze(tempo))
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        print(json.dumps({'status': 'progress', 'value': 50}), flush=True)

        chroma = librosa.feature.chroma_cens(
            y=y_harm, sr=sr, n_chroma=12, bins_per_octave=36
        )
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        chroma_transposed = chroma.T
        mfcc_transposed = mfcc.T
        print(json.dumps({'status': 'progress', 'value': 70}), flush=True)

        # Raw chord candidates every Nth frame
        raw_events = []
        times = librosa.frames_to_time(
            np.arange(len(chroma_transposed)), sr=sr
        )
        step = 5
        last_label = None
        for i in range(0, len(chroma_transposed), step):
            chord = estimate_chord_vectorized(chroma_transposed[i])
            if chord == last_label:
                continue
            last_label = chord
            raw_events.append({
                'timestamp': float(times[i]),
                'event_type': 'chord_candidate',
                'chord': chord,
                'confidence': 0.5,
                'source': 'PY_Fallback'
            })

        drum_grid = detect_drums(y_perc, sr, beat_times)
        print(json.dumps({'status': 'progress', 'value': 90}), flush=True)

        result = {
            'fileHash': 'py_hp_v1',
            'linear_analysis': {
                'metadata': {
                    'duration_seconds': duration,
                    'sample_rate': int(sr),
                    'frame_hop_seconds': float(
                        librosa.frames_to_time(1, sr=sr)
                    ),
                    'detected_key': 'C',
                    'detected_mode': 'major'
                },
                'beat_grid': {
                    'tempo_bpm': float(tempo),
                    'beat_timestamps': beat_times.tolist(),
                    'time_signature': '4/4',
                    'drum_grid': drum_grid
                },
                'events': raw_events,
                'chroma_frames': [
                    {
                        'timestamp': float(times[i]),
                        'chroma': chroma_transposed[i].tolist()
                    }
                    for i in range(len(chroma_transposed))
                ],
                'mfcc_frames': [
                    {
                        'timestamp': float(times[i]),
                        'mfcc': mfcc_transposed[i].tolist()
                    }
                    for i in range(len(mfcc_transposed))
                ],
                'semantic_features': {'frames': []}
            }
        }

        with tempfile.NamedTemporaryFile(
            mode='w', delete=False, suffix='.json'
        ) as tmp:
            json.dump(result, tmp)
            print(
                json.dumps({'status': 'complete', 'path': tmp.name}),
                flush=True,
            )
    except Exception as e:
        import traceback
        print(
            json.dumps({'error': f"{e}\n{traceback.format_exc()}"}),
            flush=True,
        )
        sys.exit(1)

 
if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file provided'}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])
