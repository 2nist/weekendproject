#!/usr/bin/env python3
"""Librosa-based audio analyzer (single, cleaned version).

Implements HPSS routing and tuned chroma extraction.
"""
import sys
import json
import tempfile
import os
import warnings
from typing import List

import numpy as np
import librosa

warnings.filterwarnings('ignore')


CHORD_TEMPLATES = {
    'C': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
}


def estimate_chord(chroma_vector: List[float]) -> str:
    arr = np.array(chroma_vector, dtype=float)
    if arr.sum() == 0:
        return 'N'
    idx = int(np.argmax(arr))
    NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    return NOTE_NAMES[idx % 12]


def analyze(file_path: str):
    try:
        print(json.dumps({'status': 'progress', 'value': 10}), flush=True)

        # 1. load at original SR
        y, sr = librosa.load(file_path, sr=None, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({'status': 'progress', 'value': 30}), flush=True)

        # 2. HPSS split
        try:
            y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)
        except Exception:
            y_harmonic, y_percussive = y, y

        # 3. beat track on percussive signal
        tempo, beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        print(json.dumps({'status': 'progress', 'value': 50}), flush=True)

        # 4. tuned chroma on harmonic signal
        chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, bins_per_octave=12, threshold=0.05)
        try:
            chroma = librosa.decompose.nn_filter(chroma, aggregate=np.median, metric='cosine')
        except Exception:
            pass

        # 5. other features on full signal
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)
        flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
        print(json.dumps({'status': 'progress', 'value': 70}), flush=True)

        # 6. build frames
        frames = []
        events = []
        prev = None
        step = 2
        target_len = chroma.shape[1]
        for i in range(0, target_len, step):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            chord = estimate_chord(vec)
            mf = mfcc[:, i].astype(float).tolist() if i < mfcc.shape[1] else mfcc[:, -1].astype(float).tolist()
            r = float(rms[0, i]) if i < rms.shape[1] else float(rms[0, -1])
            f = float(flux[i]) if i < flux.shape[0] else float(flux[-1])
            frames.append({'timestamp': t, 'chroma': vec, 'mfcc': mf, 'rms': r, 'flux': f})
            if chord != prev:
                events.append({'timestamp': t, 'event_type': 'chord_candidate', 'chord_candidate': {'root_candidates': [{'root': chord, 'probability': 0.9}]}, 'confidence': 0.8})
                prev = chord

        print(json.dumps({'status': 'progress', 'value': 90}), flush=True)

        result = {
            'fileHash': 'python_librosa_clean',
            'linear_analysis': {
                'metadata': {'duration_seconds': duration, 'sample_rate': int(sr), 'detected_key': 'C', 'detected_mode': 'major'},
                'beat_grid': {'tempo_bpm': float(tempo), 'beat_timestamps': beat_times, 'time_signature': '4/4'},
                'events': events,
                'chroma_frames': frames,
                'semantic_features': {'frames': []},
            },
        }

        fd, tmp_path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as f:
            json.dump(result, f)
        print(json.dumps({'status': 'complete', 'path': tmp_path}), flush=True)
    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file provided'}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])
#!/usr/bin/env python3
"""Simple Librosa-based analyzer with HPSS integration.

This script exposes a single `analyze(file_path)` entrypoint used by the
Node.js python bridge (`pythonEssentia.js`). The analyzer does the following:
 - Load audio with librosa (sr=22050)
 - Apply HPSS (librosa.effects.hpss) with margin=3.0
 - Beat tracking using the percussive signal
 - Chroma extraction using the harmonic signal
 - Spectral flux (onset strength) computed on the original signal
 - MFCC / RMS computed on original signal (timbre)
 - Export a `linear_analysis` JSON via a temporary file path with progress
messages so the Node bridge can pick up the result.
"""
import sys
import json
import tempfile
import os
import warnings
from typing import List

import numpy as np
import librosa

warnings.filterwarnings('ignore')


CHORD_TEMPLATES = {
    'C': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'D': [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'D#': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
    'E': [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    'F': [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'F#': [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    'G': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    'G#': [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    'A': [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#': [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'B': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
    'Cm': [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    'C#m': [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    'Dm': [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'D#m': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
    'Em': [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
    'Fm': [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'F#m': [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'Gm': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
    'G#m': [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    'Am': [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#m': [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'Bm': [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
}


def estimate_chord(chroma_vector: List[float]) -> str:
    arr = np.array(chroma_vector, dtype=float)
    if arr.sum() == 0:
        return 'N'
    norm = arr / (np.max(arr) + 1e-6)
    best = 'N'
    best_score = -1.0
    for chord, template in CHORD_TEMPLATES.items():
        t = np.array(template, dtype=float)
        score = float(np.dot(norm, t))
        if score > best_score:
            best_score = score
            best = chord
    return best


def analyze(file_path: str):
    try:
        print(json.dumps({'status': 'progress', 'value': 10}), flush=True)

        # Load at original sample rate to preserve timing accuracy
        y, sr = librosa.load(file_path, sr=None, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({'status': 'progress', 'value': 30}), flush=True)

        # HPSS split; margin=3.0 for aggressive harmonic extraction
        try:
            y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)
        except Exception:
            y_harmonic, y_percussive = y, y

        # Beat tracking on percussive
        tempo, beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        print(json.dumps({'status': 'progress', 'value': 50}), flush=True)

        # Chroma from harmonic signal (tuned to match Essentia/HPCP expectations)
        chroma = librosa.feature.chroma_cqt(
            y=y_harmonic, sr=sr, bins_per_octave=12, threshold=0.05,
        )
        # Smooth chroma with nearest-neighbors filter to reduce jitter
        try:
            chroma = librosa.decompose.nn_filter(chroma, aggregate=np.median, metric='cosine')
        except Exception:
            pass
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)
        # Keep flux based on the original mixed audio
        flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
        print(json.dumps({'status': 'progress', 'value': 70}), flush=True)

        # Aggregate frames for export
        target_len = chroma.shape[1]
        frames = []
        events = []
        prev_chord = None
        step = 2
        for i in range(0, target_len, step):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            chord = estimate_chord(vec)
            mf = mfcc[:, i].astype(float).tolist() if mfcc.shape[1] > i else mfcc[:, -1].astype(float).tolist()
            r = float(rms[0, i]) if rms.shape[1] > i else float(rms[0, -1])
            f = float(flux[i]) if flux.shape[0] > i else float(flux[-1])
            frames.append({'timestamp': t, 'chroma': vec, 'mfcc': mf, 'rms': r, 'flux': f})
            if chord != prev_chord:
                events.append({'timestamp': t, 'event_type': 'chord_candidate', 'chord_candidate': {'root_candidates': [{'root': chord, 'probability': 0.9}], 'quality_candidates': [{'quality': 'major', 'probability': 0.9}]}, 'confidence': 0.8})
                prev_chord = chord

        print(json.dumps({'status': 'progress', 'value': 90}), flush=True)

        result = {
            'fileHash': 'python_librosa_hp_v1',
            'linear_analysis': {
                'metadata': {'duration_seconds': duration, 'sample_rate': int(sr), 'detected_key': 'C', 'detected_mode': 'major'},
                'beat_grid': {'tempo_bpm': float(tempo), 'beat_timestamps': beat_times, 'time_signature': '4/4'},
                'events': events,
                'chroma_frames': frames,
                'semantic_features': {'frames': []},
            },
        }

        fd, tmp_path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as f:
            json.dump(result, f)
        print(json.dumps({'status': 'complete', 'path': tmp_path}), flush=True)
    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file provided'}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])
#!/usr/bin/env python3
"""Librosa-based audio analyzer used by the python bridge.
Produces a `linear_analysis` JSON with chroma_frames and mfcc_frames aligned.
"""
import sys
import json
import tempfile
import os
import librosa
import warnings
import numpy as np

warnings.filterwarnings('ignore')

def estimate_chord(chroma_vector):
    # Simple chord estimation: pick root with max chroma (placeholder)
    arr = np.array(chroma_vector, dtype=float)
    if arr.sum() == 0: return 'N'
    idx = int(np.argmax(arr))
    NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']
    return NOTE_NAMES[idx % 12]

def analyze(file_path):
    try:
        print(json.dumps({'status': 'progress', 'value': 10}), flush=True)
        y, sr = librosa.load(file_path, sr=22050, mono=True)
        # Apply HPSS and route harmonic/percussive signals
        try:
            y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)
        except Exception:
            y_harmonic, y_percussive = y, y
        # Apply Harmonic-Percussive Source Separation to split signals
        # margin=3.0 for aggressive harmonic separation (remove percussive attacks)
        try:
            y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)
        except Exception:
            # Fallback if not available / fails: keep original signal as both
            y_harmonic, y_percussive = y, y
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({'status': 'progress', 'value': 30}), flush=True)

        # Use percussive channel for beat tracking to avoid mistaking harmonic onsets
        tempo, beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        print(json.dumps({'status': 'progress', 'value': 50}), flush=True)

        # Extract features: chroma and MFCCs
        # Use the harmonic channel for chroma extraction to reduce transient noise
        chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr)
        # Also compute onset strength/spectral flux on the original mixed signal
        flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)
        flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
        print(json.dumps({'status': 'progress', 'value': 70}), flush=True)

        # Align features to chroma frame count (frames are along axis=1)
        target_len = chroma.shape[1]
        def pick_col(feat, idx):
            if feat is None: return []
            if getattr(feat, 'ndim', 1) == 1:
                if idx < feat.shape[0]:
                    return float(feat[idx])
                return float(feat[-1])
            # 2D features
            if feat.shape[1] == 0: return []
            if idx < feat.shape[1]:
                return feat[:, idx].astype(float).tolist()
            return feat[:, -1].astype(float).tolist()

        frames = []
        mfcc_frames = []
        events = []
        prev_chord = None
        step = 2
        for i in range(0, target_len, step):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            chord = estimate_chord(vec)
            mf = pick_col(mfcc, i)
            r = pick_col(rms, i)
            f = pick_col(flux, i)
            frames.append({'timestamp': t, 'chroma': vec, 'rms': float(r) if isinstance(r, float) else float(r[0]) if r else 0})
            mfcc_frames.append({'timestamp': t, 'mfcc': mf})
            if chord != prev_chord:
                events.append({'timestamp': t, 'event_type': 'chord_candidate', 'chord_candidate': {'root_candidates': [{'root': chord, 'probability': 0.9}], 'quality_candidates': [{'quality': 'major', 'probability': 0.9}]}, 'confidence': 0.8})
                prev_chord = chord

        print(json.dumps({'status': 'progress', 'value': 90}), flush=True)

        result = {
            'fileHash': 'python_librosa_v3',
            'linear_analysis': {
                'metadata': {'duration_seconds': duration, 'sample_rate': int(sr), 'detected_key': 'C', 'detected_mode': 'major'},
                'beat_grid': {'tempo_bpm': float(tempo), 'beat_timestamps': beat_times, 'time_signature': '4/4'},
                'events': events,
                'chroma_frames': frames,
                'mfcc_frames': mfcc_frames,
                'semantic_features': {'frames': []},
            }
        }

        fd, tmp_path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as f:
            json.dump(result, f)
        print(json.dumps({'status': 'complete', 'path': tmp_path}), flush=True)
    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)
        sys.exit(1)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file provided'}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])
#!/usr/bin/env python3
import sys
import json
import numpy as np
import librosa
import warnings
import os
import tempfile

warnings.filterwarnings('ignore')

# --- CHORD TEMPLATES (Simple Major/Minor detection) ---
CHORD_TEMPLATES = {
    'C':  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'D':  [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'D#': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
    'E':  [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    'F':  [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'F#': [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    'G':  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    'G#': [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    'A':  [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#': [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'B':  [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
    'Cm':  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    'C#m': [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    'Dm':  [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'D#m': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
    'Em':  [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
    'Fm':  [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'F#m': [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'Gm':  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
    'G#m': [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    'Am':  [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#m': [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'Bm':  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
}


def estimate_chord(chroma_vector):
    arr = np.array(chroma_vector, dtype=float)
    if arr.sum() == 0:
        return 'N'
    norm = arr / (np.max(arr) + 1e-6)
    best = 'N'
    best_score = -1.0
    for chord, template in CHORD_TEMPLATES.items():
        t = np.array(template, dtype=float)
        score = float(np.dot(norm, t))
        if score > best_score:
            best_score = score
            best = chord
    return best


def analyze(file_path):
    try:
        print(json.dumps({'status': 'progress', 'value': 10}), flush=True)

        y, sr = librosa.load(file_path, sr=22050, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({'status': 'progress', 'value': 30}), flush=True)

        tempo, beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        print(json.dumps({'status': 'progress', 'value': 50}), flush=True)

        chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr)
        flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)
        flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
        print(json.dumps({'status': 'progress', 'value': 70}), flush=True)

        target_len = chroma.shape[1]
        def resize_feat(feat, axis=-1):
            return librosa.util.fix_length(feat, size=target_len, axis=axis)

        mfcc = resize_feat(mfcc, axis=-1)
        rms = resize_feat(rms, axis=-1)
        flux = resize_feat(flux, axis=-1)

        # Normalize scalar features
        try:
            rms = librosa.util.normalize(rms, axis=1)
        except Exception:
            pass
        try:
            flux = librosa.util.normalize(flux)
        except Exception:
            pass

        frames = []
        events = []
        prev_chord = None
        step = 2
        for i in range(0, target_len, step):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            chord = estimate_chord(vec)
            mf = mfcc[:, i].astype(float).tolist() if mfcc.shape[1] > i else mfcc[:, -1].astype(float).tolist()
            frame = {
                'timestamp': float(t),
                'chroma': vec,
                'mfcc': mf,
                'rms': float(rms[0, i]) if rms.shape[1] > i else float(rms[0, -1]),
                'flux': float(flux[i]) if flux.shape[0] > i else float(flux[-1]),
            }
            frames.append(frame)
            if chord != prev_chord:
                events.append({'timestamp': t, 'event_type': 'chord_candidate', 'chord_candidate': {'root_candidates': [{'root': chord, 'probability': 0.9}], 'quality_candidates': [{'quality': 'major', 'probability': 0.9}]}, 'confidence': 0.8})
                prev_chord = chord

        print(json.dumps({'status': 'progress', 'value': 90}), flush=True)

        result = {
            'fileHash': 'python_librosa_v2',
            'linear_analysis': {
                'metadata': {'duration_seconds': duration, 'sample_rate': int(sr), 'detected_key': 'C', 'detected_mode': 'major'},
                'beat_grid': {'tempo_bpm': float(tempo), 'beat_timestamps': beat_times.tolist(), 'time_signature': '4/4'},
                'events': events,
                'chroma_frames': frames,
                'semantic_features': {'frames': []},
            },
        }

        fd, tmp_path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as f:
            json.dump(result, f)
        print(json.dumps({'status': 'complete', 'path': tmp_path}), flush=True)
    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file provided'}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])
#!/usr/bin/env python3
"""Fast Librosa analyzer with file handoff for large JSON results.
Usage: python analyze_song.py /path/to/audio.mp3
"""
import sys
import json
import numpy as np
import librosa
import warnings
import os
import tempfile

warnings.filterwarnings('ignore')

# Simple chord templates
CHORD_TEMPLATES = {
    'C': [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'D': [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'D#': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
    'E': [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    'F': [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'G': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    'A': [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'B': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
}


def estimate_chord(chroma_vector):
    arr = np.array(chroma_vector, dtype=float)
    if arr.sum() == 0:
        return 'N'
    norm = arr / (np.max(arr) + 1e-6)
    best = 'N'
    best_score = -1.0
    for chord, template in CHORD_TEMPLATES.items():
        t = np.array(template, dtype=float)
        score = float(np.dot(norm, t))
        if score > best_score:
            best_score = score
            best = chord
    return best


def analyze(file_path):
    try:
        # Start
        print(json.dumps({'status': 'progress', 'value': 10}), flush=True)

        # 1: load
        y, sr = librosa.load(file_path, sr=22050, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({'status': 'progress', 'value': 30}), flush=True)

        # 2: beats
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        print(json.dumps({'status': 'progress', 'value': 50}), flush=True)

        # 3: chroma (fast stft) and MFCC (timbre)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=4096)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        print(json.dumps({'status': 'progress', 'value': 70}), flush=True)

        # 4: collect frames and simple chord events (downsample frames to avoid massive JSON)
        frames = []
        events = []
        prev_chord = None
        step = 3
        num_frames = chroma.shape[1]
        for i in range(0, num_frames, step):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            chord = estimate_chord(vec)
            frames.append({'timestamp': t, 'chroma': vec})
            # Add MFCC frame aligned with chroma frame if available
            if 'mfcc' not in locals():
                pass
            else:
                # Ensure index safety
                mf = mfcc[:, i].astype(float).tolist() if i < mfcc.shape[1] else mfcc[:, -1].astype(float).tolist()
                # Store in separate list for export
                if 'mfcc_frames' not in locals():
                    mfcc_frames = []
                mfcc_frames.append({'timestamp': t, 'mfcc': mf})
            if chord != prev_chord:
                events.append({'timestamp': t, 'event_type': 'chord_candidate', 'chord_candidate': {'root_candidates': [{'root': chord, 'probability': 0.9}], 'quality_candidates': [{'quality': 'major', 'probability': 0.9}]}, 'confidence': 0.8})
                prev_chord = chord
        print(json.dumps({'status': 'progress', 'value': 90}), flush=True)

        # 5: format
        result = {
            'fileHash': 'python_librosa_fast',
            'linear_analysis': {
                'metadata': {'duration_seconds': duration, 'sample_rate': int(sr), 'detected_key': 'C', 'detected_mode': 'major'},
                'beat_grid': {'tempo_bpm': float(tempo), 'beat_timestamps': beat_times, 'time_signature': '4/4'},
                'events': events,
                'chroma_frames': frames,
                'semantic_features': {'frames': []},
                'mfcc_frames': mfcc_frames if 'mfcc_frames' in locals() else [],
            },
        }

        # 6: write to temp file and print the path
        fd, tmp_path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as f:
            json.dump(result, f)
        print(json.dumps({'status': 'complete', 'path': tmp_path}), flush=True)
    except Exception as e:
        print(json.dumps({'error': str(e)}), flush=True)
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file provided'}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])
#!/usr/bin/env python3
import sys
import json
import numpy as np
import librosa
import warnings
import os
import tempfile

# Suppress non-critical warnings
warnings.filterwarnings("ignore")

# --- CHORD TEMPLATES (Simple Major/Minor detection) ---
CHORD_TEMPLATES = {
    'C':  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'D':  [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'D#': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
    'E':  [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    'F':  [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'F#': [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    'G':  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    'G#': [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    'A':  [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#': [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'B':  [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
    'Cm':  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    'C#m': [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    'Dm':  [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'D#m': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
    'Em':  [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
    'Fm':  [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'F#m': [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'Gm':  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
    'G#m': [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    'Am':  [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#m': [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'Bm':  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
}


def estimate_chord(chroma_vector):
    chroma = np.array(chroma_vector, dtype=float)
    if chroma.sum() == 0:
        return "N"
    chroma_norm = chroma / (np.max(chroma) + 1e-6)
    best_score = -1
    best_chord = "N"
    for chord, template in CHORD_TEMPLATES.items():
        template_arr = np.array(template, dtype=float)
        score = float(np.dot(chroma_norm, template_arr))
        if score > best_score:
            best_score = score
            best_chord = chord
    return best_chord


def analyze(file_path):
    try:
        print(json.dumps({"status": "progress", "value": 10}), flush=True)

        # 1. Load audio - reduced SR for speed
        y, sr = librosa.load(file_path, sr=22050, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({"status": "progress", "value": 30}), flush=True)

        # 2. Beat tracking
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        print(json.dumps({"status": "progress", "value": 50}), flush=True)

        # 3. Chroma extraction (STFT for speed)
        chroma = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=4096)
        print(json.dumps({"status": "progress", "value": 70}), flush=True)

        # 4. Build frames and chord events
        frames_to_export = []
        events = []
        prev_chord = None
        num_frames = chroma.shape[1]
        step = 3
        for i in range(0, num_frames, step):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            detected_chord = estimate_chord(vec)
            frames_to_export.append({"timestamp": t, "chroma": vec})
            if detected_chord != prev_chord:
                events.append({
                    "timestamp": t,
                    "event_type": "chord_candidate",
                    "chord_candidate": {
                        "root_candidates": [{"root": detected_chord, "probability": 0.9}],
                        "quality_candidates": [{"quality": "major", "probability": 0.9}],
                    },
                    "confidence": 0.8,
                })
                prev_chord = detected_chord

        print(json.dumps({"status": "progress", "value": 90}), flush=True)

        result = {
            "fileHash": "python_librosa_fast",
            "linear_analysis": {
                "metadata": {"duration_seconds": duration, "sample_rate": int(sr), "detected_key": "C", "detected_mode": "major"},
                "beat_grid": {"tempo_bpm": float(tempo), "beat_timestamps": beat_times, "time_signature": "4/4"},
                "events": events,
                "chroma_frames": frames_to_export,
                "semantic_features": {"frames": []},
            },
        }

        # 5. Write result to temp file to avoid pipe backpressure
        fd, temp_path = tempfile.mkstemp(suffix='.json')
        with os.fdopen(fd, 'w') as tmp:
            json.dump(result, tmp)

        # 6. Emit complete message with temp path
        print(json.dumps({"status": "complete", "path": temp_path}), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file provided"}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])
#!/usr/bin/env python3
import sys
import json
import numpy as np
import librosa
import warnings

# Suppress non-critical warnings to keep JSON output clean
warnings.filterwarnings("ignore")

# --- CHORD TEMPLATES (Simple Major/Minor detection) ---
CHORD_TEMPLATES = {
    'C':  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'D':  [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'D#': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
    'E':  [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    'F':  [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'F#': [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    'G':  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    'G#': [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    'A':  [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#': [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'B':  [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
    'Cm':  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    'C#m': [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    'Dm':  [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'D#m': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
    'Em':  [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
    'Fm':  [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'F#m': [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'Gm':  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
    'G#m': [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    'Am':  [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#m': [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'Bm':  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
}


def estimate_chord(chroma_vector):
    """Identify the best matching chord from a 12-bin chroma vector."""
    best_score = -1
    best_chord = "N"
    chroma = np.array(chroma_vector, dtype=float)
    if chroma.sum() == 0:
        return best_chord
    chroma_norm = chroma / (np.max(chroma) + 1e-6)
    for chord, template in CHORD_TEMPLATES.items():
        t = np.array(template, dtype=float)
        score = float(np.dot(chroma_norm, t))
        if score > best_score:
            best_score = score
            best_chord = chord
    return best_chord


def analyze(file_path):
    try:
        print(json.dumps({"status": "progress", "value": 10}), flush=True)

        # 1. Load Audio (Resample to 22050Hz for speed)
        y, sr = librosa.load(file_path, sr=22050, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({"status": "progress", "value": 30}), flush=True)

        # 2. Beat Tracking
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        print(json.dumps({"status": "progress", "value": 50}), flush=True)

        # 3. Harmonic Analysis (Chroma) and MFCC for timbre
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        print(json.dumps({"status": "progress", "value": 70}), flush=True)

        # 4. Build output frames & chord events (fast)
        frames_to_export = []
        events = []
        prev_chord = None
        num_frames = chroma.shape[1]

        mfcc_frames = []
        for i in range(0, num_frames, 2):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            detected_chord = estimate_chord(vec)
            # Align MFCC with chroma frame
            mf = []
            try:
                mf = mfcc[:, i].astype(float).tolist() if i < mfcc.shape[1] else mfcc[:, -1].astype(float).tolist()
            except Exception:
                mf = []
            frames_to_export.append({"timestamp": t, "chroma": vec})
            mfcc_frames.append({"timestamp": t, "mfcc": mf})
            if detected_chord != prev_chord:
                events.append({
                    "timestamp": t,
                    "event_type": "chord_candidate",
                    "chord_candidate": {
                        "root_candidates": [{"root": detected_chord, "probability": 0.9}],
                        "quality_candidates": [{"quality": "major", "probability": 0.9}],
                    },
                    "confidence": 0.8,
                })
                prev_chord = detected_chord

        print(json.dumps({"status": "progress", "value": 90}), flush=True)

        # 5. Build final structure-less result (fast mode)
        result = {
            "fileHash": "python_librosa_fast",
            "linear_analysis": {
                "metadata": {
                    "duration_seconds": duration,
                    "sample_rate": int(sr),
                    "detected_key": "C",
                    "detected_mode": "major",
                },
                "beat_grid": {"tempo_bpm": float(tempo), "beat_timestamps": beat_times, "time_signature": "4/4"},
                "events": events,
                "chroma_frames": frames_to_export,
                "semantic_features": {"frames": []},
                "mfcc_frames": mfcc_frames,
            },
        }

        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file provided"}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])
#!/usr/bin/env python3
import sys
import json
import numpy as np

try:
    import librosa
except Exception as e:
    print(json.dumps({"error": "librosa import failed: %s" % str(e)}))
    sys.exit(1)

# --- CHORD TEMPLATES (Simple Major/Minor detection) ---
CHORD_TEMPLATES = {
    'C':  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0],
    'C#': [0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'D':  [0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'D#': [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0],
    'E':  [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    'F':  [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'F#': [0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    'G':  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    'G#': [1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
    'A':  [0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#': [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'B':  [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1],
    'Cm':  [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0],
    'C#m': [0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    'Dm':  [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0],
    'D#m': [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0],
    'Em':  [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1],
    'Fm':  [1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0],
    'F#m': [0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
    'Gm':  [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0],
    'G#m': [0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1],
    'Am':  [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0],
    'A#m': [0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    'Bm':  [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
}

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def estimate_chord(chroma_vector):
    chroma = np.array(chroma_vector, dtype=float)
    if chroma.sum() == 0:
        return "N"
    chroma_norm = chroma / (np.max(chroma) + 1e-6)
    best_score = -1
    best_chord = "N"
    for chord, template in CHORD_TEMPLATES.items():
        template_arr = np.array(template, dtype=float)
        score = float(np.dot(chroma_norm, template_arr))
        if score > best_score:
            best_score = score
            best_chord = chord
    return best_chord


def analyze(file_path):
    try:
        # Signal start
        print(json.dumps({"status": "progress", "value": 10}), flush=True)
        y, sr = librosa.load(file_path, sr=22050, mono=True)
        # Loaded
        print(json.dumps({"status": "progress", "value": 30}), flush=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        # Beat detection done
        print(json.dumps({"status": "progress", "value": 50}), flush=True)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
        # Chroma extraction done
        print(json.dumps({"status": "progress", "value": 70}), flush=True)

        frames_to_export = []
        events = []
        prev_chord = None
        num_frames = chroma.shape[1]

        for i in range(0, num_frames, 2):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            detected_chord = estimate_chord(vec)
            frames_to_export.append({"timestamp": t, "chroma": vec})
            if detected_chord != prev_chord:
                events.append({
                    "timestamp": t,
                    "event_type": "chord_candidate",
                    "chord_candidate": {
                        "root_candidates": [{"root": detected_chord, "probability": 0.9}],
                        "quality_candidates": [{"quality": "major", "probability": 0.9}]
                    },
                    "confidence": 0.8,
                })
                prev_chord = detected_chord

        # Simple segmentation using recurrence and path_enhance just to provide structure
        # Make the recurrence and smoothing extremely sensitive for debug
        chroma_stack = librosa.feature.stack_memory(chroma, n_steps=6, delay=2)
        # Use fewer nearest neighbors to make recurrence more local (k=5)
        rec = librosa.segment.recurrence_matrix(chroma_stack, mode='affinity', k=5, sym=True)
        # Reduce path enhance width to 3 to avoid smoothing over short transitions
        rec_smooth = librosa.segment.path_enhance(rec, 3, window='hann', n_filters=3)

        # Compute a simple novelty curve for debugging and emit candidate splits
        try:
            # novelty = column-sum diff
            import numpy as _np

            col_sums = _np.sum(rec_smooth, axis=0)
            novelty = _np.abs(_np.diff(_np.pad(col_sums, (1, 0), mode='edge')))
            # Peak picking: pick small local maxima
            try:
                peaks = librosa.util.peak_pick(novelty, pre_max=1, post_max=1, pre_avg=3, post_avg=3, delta=0.05, wait=1)
            except Exception:
                # fallback to simple threshold
                peaks = [i for i, v in enumerate(novelty) if v > 0.05]
            for p in peaks:
                t = float(librosa.frames_to_time(p, sr=sr))
                events.append({
                    "timestamp": t,
                    "event_type": "novelty_candidate",
                    "score": float(novelty[p]),
                })
        except Exception:
            pass

        # We won't compute a full section map; return the chroma, beats, and events
        result = {
            "fileHash": "python_analysis",
            "linear_analysis": {
                "metadata": {
                    "duration_seconds": duration,
                    "sample_rate": int(sr),
                    "detected_key": "C",
                    "detected_mode": "major"
                },
                "beat_grid": {
                    "tempo_bpm": float(tempo),
                    "beat_timestamps": beat_times,
                    "time_signature": "4/4"
                },
                "events": events,
                "chroma_frames": frames_to_export,
                "flux_frames": [{'timestamp': float(librosa.frames_to_time(i, sr=sr)), 'flux': float(flux[i]) if i < flux.shape[0] else 0} for i in range(0, flux.shape[0], 1)],
                "semantic_features": {
                    "frames": []
                }
            }
        }

        # Final JSON output
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file provided"}))
        sys.exit(1)
    analyze(sys.argv[1])
