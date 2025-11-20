#!/usr/bin/env python3
import sys
import json
import numpy as np
import librosa
import tempfile
import os

def analyze_audio(file_path):
    try:
        print(json.dumps({"status": "progress", "value": 10}))
        
        # 1. Load Audio (mono)
        y, sr = librosa.load(file_path, sr=None, mono=True)
        
        print(json.dumps({"status": "progress", "value": 20}))

        # 2. HPSS Separation (aggressive)
        y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)

        print(json.dumps({"status": "progress", "value": 40}))

        # 3. Beat Tracking (on percussive stem)
        tempo, beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr)
        # Ensure tempo is a float scalar
        try:
            tempo = float(np.squeeze(tempo))
        except Exception:
            tempo = float(tempo)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)

        print(json.dumps({"status": "progress", "value": 60}))

        # 4. Chroma Extraction (harmonic stem)
        hop_length = 512
        chroma = librosa.feature.chroma_cens(
            y=y_harmonic, sr=sr, n_chroma=12, bins_per_octave=36, hop_length=hop_length,
        )
        chroma = chroma.T

        print(json.dumps({"status": "progress", "value": 80}))

        # 5. MFCCs (use original audio)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)
        mfcc = mfcc.T

        # 6. Construct output JSON
        output = {
            "metadata": {
                "duration": librosa.get_duration(y=y, sr=sr),
                "sample_rate": sr,
                "hop_length": int(hop_length),
                "frame_hop_seconds": float(hop_length / sr),
            },
            "beat_grid": {
                "tempo": float(tempo),
                "beat_timestamps": beat_times.tolist(),
                "time_signature": "4/4",
            },
            "chroma_frames": [{"timestamp": float(librosa.frames_to_time(i, sr=sr, hop_length=hop_length)), "chroma": c.tolist()} for i, c in enumerate(chroma)],
            "mfcc_frames": [{"timestamp": float(librosa.frames_to_time(i, sr=sr, hop_length=hop_length)), "mfcc": m.tolist()} for i, m in enumerate(mfcc)],
            "events": [],
        }

        # Write to temp file and emit path for the bridge
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as tmp:
            json.dump(output, tmp)
            print(json.dumps({"status": "complete", "path": tmp.name}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        analyze_audio(sys.argv[1])
#!/usr/bin/env python3
"""Librosa-based audio analyzer (HPSS-enabled).
Routes percussive signal to beat tracker and harmonic to chroma.
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
        # Load at original sample rate to preserve timing info
        y, sr = librosa.load(file_path, sr=None, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({'status': 'progress', 'value': 30}), flush=True)

        # HPSS
        try:
            y_harmonic, y_percussive = librosa.effects.hpss(y, margin=3.0)
        except Exception:
            y_harmonic, y_percussive = y, y

        tempo, beat_frames = librosa.beat.beat_track(y=y_percussive, sr=sr)
        beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()
        print(json.dumps({'status': 'progress', 'value': 50}), flush=True)

        # Chroma from harmonic signal (tuned to match Essentia/HPCP)
        chroma = librosa.feature.chroma_cqt(
            y=y_harmonic, sr=sr, bins_per_octave=12, threshold=0.05,
        )
        # Smooth chroma with a nearest-neighbors filter (median aggregate, cosine)
        try:
            chroma = librosa.decompose.nn_filter(
                chroma, aggregate=np.median, metric='cosine'
            )
        except Exception:
            pass
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)
        flux = librosa.onset.onset_strength(y=y, sr=sr, hop_length=512)
        # ---- Drum Mapping (Kick vs Snare) ----
        try:
            from scipy import signal
            have_scipy = True
        except Exception:
            have_scipy = False

        hop_length = 512
        kick_timestamps = []
        snare_timestamps = []

        # Helper: map onset frames to timestamps
        def frames_to_times(frames):
            return librosa.frames_to_time(frames, sr=sr, hop_length=hop_length)
        def detect_onsets_with_scipy(y_percussive_in):
            sos_low = signal.butter(
                4, 100, btype='low', fs=sr, output='sos'
            )
            y_kick = signal.sosfiltfilt(sos_low, y_percussive_in)
            sos_band = signal.butter(
                4, [250, 500], btype='band', fs=sr, output='sos'
            )
            y_snare = signal.sosfiltfilt(sos_band, y_percussive_in)
            onset_env_kick = librosa.onset.onset_strength(
                y=y_kick, sr=sr, hop_length=hop_length
            )
            onset_env_snare = librosa.onset.onset_strength(
                y=y_snare, sr=sr, hop_length=hop_length
            )
            kick_frames_out = librosa.onset.onset_detect(
                onset_envelope=onset_env_kick, sr=sr, hop_length=hop_length
            )
            snare_frames_out = librosa.onset.onset_detect(
                onset_envelope=onset_env_snare, sr=sr, hop_length=hop_length
            )
            return (
                frames_to_times(kick_frames_out).tolist(),
                frames_to_times(snare_frames_out).tolist(),
            )

        def detect_onsets_fallback(y_percussive_in):
            S = np.abs(
                librosa.stft(y_percussive_in, n_fft=2048, hop_length=hop_length)
            )
            freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
            kick_bins = np.nonzero(freqs <= 100)[0]
            snare_bins = np.nonzero((freqs >= 250) & (freqs <= 500))[0]
            kick_energy = S[kick_bins, :].sum(axis=0)
            snare_energy = S[snare_bins, :].sum(axis=0)
            kick_ts = []
            snare_ts = []
            if kick_energy.max() > 0:
                kick_env = kick_energy / (kick_energy.max() + 1e-9)
                kick_frames_out = librosa.util.peak_pick(
                    kick_env.astype(float), 3, 3, 3, 5, 0.4, 10
                )
                kick_ts = librosa.frames_to_time(
                    kick_frames_out, sr=sr, hop_length=hop_length
                ).tolist()
            if snare_energy.max() > 0:
                snare_env = snare_energy / (snare_energy.max() + 1e-9)
                snare_frames_out = librosa.util.peak_pick(
                    snare_env.astype(float), 3, 3, 3, 5, 0.4, 10
                )
                snare_ts = librosa.frames_to_time(
                    snare_frames_out, sr=sr, hop_length=hop_length
                ).tolist()
            return kick_ts, snare_ts

        if have_scipy:
            try:
                kick_timestamps, snare_timestamps = detect_onsets_with_scipy(
                    y_percussive
                )
            except Exception:
                have_scipy = False

        if not have_scipy:
            # Fallback: STFT energy-based approach
            kick_timestamps, snare_timestamps = detect_onsets_fallback(
                y_percussive
            )

        # Map onsets to beat grid
        drum_grid = []
        beats_per_measure = 4
        tolerance = 0.12  # seconds tolerance to map onsets to beat
        for i, t in enumerate(beat_times):
            has_kick = any(abs(t - k) <= tolerance for k in kick_timestamps)
            has_snare = any(abs(t - s) <= tolerance for s in snare_timestamps)
            bar = (i // beats_per_measure) + 1
            beat_in_bar = (i % beats_per_measure) + 1
            drums = []
            if has_kick:
                drums.append('kick')
            if has_snare:
                drums.append('snare')
            drum_grid.append({'time': float(t), 'bar': int(bar), 'beat': int(beat_in_bar), 'chord': None, 'drums': drums})

        print(json.dumps({'status': 'progress', 'value': 70}), flush=True)

        target_len = chroma.shape[1]
        frames = []
        events = []
        prev_chord = None
        for i in range(0, target_len, 2):
            t = float(librosa.frames_to_time(i, sr=sr))
            vec = chroma[:, i].astype(float).tolist()
            chord = estimate_chord(vec)
            mf = mfcc[:, i].astype(float).tolist() if mfcc.shape[1] > i else mfcc[:, -1].astype(float).tolist()
            r = float(rms[0, i]) if rms.shape[1] > i else float(rms[0, -1])
            f = float(flux[i]) if flux.shape[0] > i else float(flux[-1])
            frames.append({'timestamp': t, 'chroma': vec, 'mfcc': mf, 'rms': r, 'flux': f})
            if chord != prev_chord:
                events.append({'timestamp': t, 'event_type': 'chord_candidate', 'chord_candidate': {'root_candidates': [{'root': chord, 'probability': 0.9}]}, 'confidence': 0.8})
                prev_chord = chord

        print(json.dumps({'status': 'progress', 'value': 90}), flush=True)

        result = {
            'fileHash': 'python_librosa_hp',
            'linear_analysis': {
                'metadata': {'duration_seconds': duration, 'sample_rate': int(sr), 'detected_key': 'C', 'detected_mode': 'major'},
                'beat_grid': {'tempo_bpm': float(tempo), 'beat_timestamps': beat_times, 'time_signature': '4/4', 'drum_grid': drum_grid},
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
