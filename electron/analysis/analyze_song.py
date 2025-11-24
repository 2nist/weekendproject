#!/usr/bin/env python3
"""Enhanced Librosa-based audio analysis with full feature extraction.
Outputs structure compatible with existing Electron pipeline.
Includes: Key detection, time signature, downbeats, enhanced chords, spectral features, etc."""
import sys
import json
import numpy as np
import librosa
import tempfile
from scipy.signal import butter, filtfilt
from scipy.stats import mode

# --- Enhanced Chord Templates with Psychoacoustic Weighting ---
ROOTS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
TEMPLATES = []
LABELS = []

# Major triads (with natural overtone series)
for i in range(12):
    v = np.zeros(12)
    v[i] = 1.0                    # Root (fundamental)
    v[(i + 4) % 12] = 0.9         # Major 3rd (strong)
    v[(i + 7) % 12] = 0.85        # Perfect 5th (strong)
    v[(i + 11) % 12] = 0.25       # Major 7th (natural overtone)
    TEMPLATES.append(v)
    LABELS.append(ROOTS[i])

# Minor triads
for i in range(12):
    v = np.zeros(12)
    v[i] = 1.0                    # Root
    v[(i + 3) % 12] = 0.9         # Minor 3rd (strong)
    v[(i + 7) % 12] = 0.85        # Perfect 5th
    v[(i + 10) % 12] = 0.2        # Minor 7th (weak overtone)
    TEMPLATES.append(v)
    LABELS.append(ROOTS[i] + 'm')

# Dominant 7ths (very common in pop/rock)
for i in range(12):
    v = np.zeros(12)
    v[i] = 1.0                    # Root
    v[(i + 4) % 12] = 0.85        # Major 3rd
    v[(i + 7) % 12] = 0.8         # Perfect 5th
    v[(i + 10) % 12] = 0.75       # Minor 7th (STRONG in dom7)
    TEMPLATES.append(v)
    LABELS.append(ROOTS[i] + '7')

# Major 7ths (jazz/sophisticated pop)
for i in range(12):
    v = np.zeros(12)
    v[i] = 1.0                    # Root
    v[(i + 4) % 12] = 0.85        # Major 3rd
    v[(i + 7) % 12] = 0.8         # Perfect 5th
    v[(i + 11) % 12] = 0.7        # Major 7th (strong in maj7)
    TEMPLATES.append(v)
    LABELS.append(ROOTS[i] + 'maj7')

# Minor 7ths
for i in range(12):
    v = np.zeros(12)
    v[i] = 1.0                    # Root
    v[(i + 3) % 12] = 0.85        # Minor 3rd
    v[(i + 7) % 12] = 0.8         # Perfect 5th
    v[(i + 10) % 12] = 0.75       # Minor 7th
    TEMPLATES.append(v)
    LABELS.append(ROOTS[i] + 'm7')

# Sus4 chords (common in rock)
for i in range(12):
    v = np.zeros(12)
    v[i] = 1.0                    # Root
    v[(i + 5) % 12] = 0.9         # Perfect 4th (replaces 3rd)
    v[(i + 7) % 12] = 0.85        # Perfect 5th
    TEMPLATES.append(v)
    LABELS.append(ROOTS[i] + 'sus4')

TEMPLATE_MATRIX = np.array(TEMPLATES)  # (72, 12) - 12 major + 12 minor + 12 dom7 + 12 maj7 + 12 min7 + 12 sus4


def detect_bass_note(y_perc: np.ndarray, sr: int, timestamp: float) -> int:
    """
    Extract actual bass frequency (40-200Hz) for proper inversion detection.
    Returns pitch class (0-11) of the bass note.
    """
    # Get 200ms window around the beat for bass analysis
    window_size = int(0.2 * sr)  # 200ms
    center_sample = int(timestamp * sr)
    start_sample = max(0, center_sample - window_size // 2)
    end_sample = min(len(y_perc), center_sample + window_size // 2)
    
    if end_sample <= start_sample:
        return None
    
    bass_window = y_perc[start_sample:end_sample]
    
    # Apply band-pass filter (40-200Hz - bass fundamental range)
    b, a = butter(4, [40 / (sr / 2), 200 / (sr / 2)], btype='band')
    bass_signal = filtfilt(b, a, bass_window)
    
    # Find dominant frequency using FFT
    fft = np.fft.rfft(bass_signal)
    freqs = np.fft.rfftfreq(len(bass_signal), 1/sr)
    
    # Only look at bass range
    bass_range = (freqs >= 40) & (freqs <= 200)
    if not np.any(bass_range):
        return None
    
    bass_fft = np.abs(fft[bass_range])
    bass_freqs = freqs[bass_range]
    
    if len(bass_fft) == 0:
        return None
    
    # Find peak with minimum threshold
    peak_idx = np.argmax(bass_fft)
    peak_magnitude = bass_fft[peak_idx]
    
    # Threshold: bass must be 30% of max energy
    if peak_magnitude < 0.3 * np.max(bass_fft):
        return None
    
    peak_freq = bass_freqs[peak_idx]
    
    # Convert to MIDI note and then pitch class
    if peak_freq < 30:  # Too low to be musical
        return None
    
    midi_note = 12 * np.log2(peak_freq / 440.0) + 69
    pitch_class = int(round(midi_note)) % 12
    
    return pitch_class


def estimate_chord_enhanced(chroma_frame: np.ndarray, bass_pitch_class: int = None) -> tuple:
    """Enhanced chord detection with confidence scores and bass note"""
    norm = np.linalg.norm(chroma_frame)
    if norm == 0:
        return 'N', 0.0, 'unknown', None
    
    cf = chroma_frame / norm
    scores = TEMPLATE_MATRIX @ cf
    
    # Get best match
    best_idx = int(np.argmax(scores))
    best_score = float(scores[best_idx])
    best_label = LABELS[best_idx]
    
    # Extract root pitch class from chord label
    root_map = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 
                'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    root_str = best_label.split('m')[0].split('7')[0].split('sus')[0]
    root_pitch_class = root_map.get(root_str, 0)
    
    # Determine inversion using actual bass note
    inversion = 0
    if bass_pitch_class is not None and bass_pitch_class != root_pitch_class:
        # Calculate interval from root to bass
        interval = (bass_pitch_class - root_pitch_class) % 12
        
        # Map interval to inversion
        # Root position: bass = root (0)
        # 1st inversion: bass = 3rd (3 or 4 semitones)
        # 2nd inversion: bass = 5th (7 semitones)
        if interval in [3, 4]:  # Minor or major 3rd
            inversion = 1
        elif interval == 7:  # Perfect 5th
            inversion = 2
        elif interval in [10, 11]:  # Minor or major 7th
            inversion = 3
    
    # Normalize confidence (0-1)
    confidence = min(1.0, max(0.0, best_score))
    
    # Determine quality
    if 'maj7' in best_label:
        quality = 'major7'
    elif 'm7' in best_label:
        quality = 'minor7'
    elif '7' in best_label and 'maj' not in best_label:
        quality = 'dominant7'
    elif 'sus' in best_label:
        quality = 'suspended'
    elif 'm' in best_label:
        quality = 'minor'
    else:
        quality = 'major'
    
    return best_label, confidence, quality, inversion


def detect_key(chroma: np.ndarray) -> tuple:
    """Detect key using Krumhansl-Schmuckler algorithm"""
    try:
        # Average chroma over time
        chroma_mean = np.mean(chroma, axis=1)
        key_profile = chroma_mean / (np.sum(chroma_mean) + 1e-10)
        
        # Krumhansl-Schmuckler key profiles (normalized)
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        
        # Normalize profiles
        major_profile = major_profile / np.sum(major_profile)
        minor_profile = minor_profile / np.sum(minor_profile)
        
        # Correlate with all 24 keys (12 major + 12 minor)
        correlations = []
        for shift in range(12):
            # Major
            shifted_major = np.roll(major_profile, shift)
            corr_major = np.corrcoef(key_profile, shifted_major)[0, 1]
            if np.isnan(corr_major):
                corr_major = 0.0
            correlations.append(('major', shift, corr_major))
            
            # Minor
            shifted_minor = np.roll(minor_profile, shift)
            corr_minor = np.corrcoef(key_profile, shifted_minor)[0, 1]
            if np.isnan(corr_minor):
                corr_minor = 0.0
            correlations.append(('minor', shift, corr_minor))
        
        # Find best match
        best = max(correlations, key=lambda x: x[2])
        mode_str, shift, confidence = best
        
        # Convert shift to key name
        detected_key = ROOTS[shift]
        
        # Normalize confidence (0-1)
        confidence = float(max(0.0, min(1.0, (confidence + 1) / 2)))  # Map from [-1,1] to [0,1]
        
        return detected_key, mode_str, confidence
    except Exception as e:
        # Fallback
        return 'C', 'major', 0.5


def detect_time_signature(beat_times: np.ndarray, tempo: float) -> tuple:
    """Detect time signature from beat patterns"""
    try:
        if len(beat_times) < 8:
            return '4/4', 0.5  # Default for short segments
        
        # Calculate beat intervals
        beat_intervals = np.diff(beat_times)
        
        # Group beats into measures by analyzing intervals
        # Look for patterns in beat intervals
        # Common patterns:
        # 4/4: relatively uniform intervals
        # 3/4: groups of 3 beats
        # 6/8: groups of 6 beats (compound time)
        
        # Analyze interval consistency
        mean_interval = np.mean(beat_intervals)
        std_interval = np.std(beat_intervals)
        cv = std_interval / (mean_interval + 1e-10)  # Coefficient of variation
        
        # If very consistent, likely 4/4
        if cv < 0.15:
            return '4/4', 0.8
        
        # Look for groupings
        # Try to find measure boundaries (downbeats)
        # Use autocorrelation to find repeating patterns
        if len(beat_intervals) >= 12:
            # Autocorrelation to find measure length
            autocorr = np.correlate(beat_intervals, beat_intervals, mode='full')
            autocorr = autocorr[len(autocorr)//2:]
            
            # Find peaks (potential measure boundaries)
            # Look for peaks at positions that suggest 3/4 or 6/8
            if len(autocorr) > 6:
                # Check for 3-beat pattern (3/4)
                if autocorr[3] > 0.7 * np.max(autocorr[1:6]):
                    return '3/4', 0.7
                # Check for 6-beat pattern (6/8)
                if len(autocorr) > 6 and autocorr[6] > 0.7 * np.max(autocorr[1:10]):
                    return '6/8', 0.7
        
        # Default to 4/4
        return '4/4', 0.6
    except Exception:
        return '4/4', 0.5


def detect_downbeats(y_perc: np.ndarray, sr: int, beat_times: np.ndarray, time_sig: str) -> np.ndarray:
    """Detect downbeats (measure boundaries)"""
    try:
        # Parse time signature
        if '/' in time_sig:
            numerator = int(time_sig.split('/')[0])
        else:
            numerator = 4
        
        # Use onset strength to find strong beats (downbeats)
        onset_strength = librosa.onset.onset_strength(y=y_perc, sr=sr)
        onset_times = librosa.frames_to_time(np.arange(len(onset_strength)), sr=sr)
        
        # Find peaks in onset strength aligned to beats
        downbeats = []
        beats_per_measure = numerator
        
        for i in range(0, len(beat_times), beats_per_measure):
            if i < len(beat_times):
                # The first beat of each measure is likely a downbeat
                downbeats.append(float(beat_times[i]))
        
        return np.array(downbeats)
    except Exception:
        # Fallback: every 4th beat
        return beat_times[::4] if len(beat_times) >= 4 else np.array([])


def detect_drums(y_perc: np.ndarray, sr: int, beat_times: np.ndarray):
    """Enhanced drum detection with proper frequency bands"""
    
    # KICK: 40-150Hz (bass drum fundamental + low harmonics)
    bk, ak = butter(4, [40 / (sr / 2), 150 / (sr / 2)], btype='band')
    kick_sig = filtfilt(bk, ak, y_perc)
    
    # SNARE: Two-band approach (body + crack)
    # Body: 150-400Hz (fundamental resonance)
    bs_low, as_low = butter(4, [150 / (sr / 2), 400 / (sr / 2)], btype='band')
    snare_body = filtfilt(bs_low, as_low, y_perc)
    
    # Crack: 2-6kHz (snare wires rattle)
    bs_high, as_high = butter(4, [2000 / (sr / 2), 6000 / (sr / 2)], btype='band')
    snare_crack = filtfilt(bs_high, as_high, y_perc)
    
    # Blend snare components (body is primary)
    snare_sig = snare_body + snare_crack * 0.5
    
    # Adaptive onset detection
    kick_onsets = librosa.onset.onset_detect(
        y=kick_sig, 
        sr=sr, 
        units='time',
        delta=0.05,  # Stricter threshold
        pre_max=3,   # Adaptive peak picking
        post_max=3,
        pre_avg=3,
        post_avg=3,
        wait=int(0.1 * sr / 512)  # Min 100ms between kicks
    )
    
    snare_onsets = librosa.onset.onset_detect(
        y=snare_sig,
        sr=sr,
        units='time',
        delta=0.1,   # Snares have sharper transients
        pre_max=3,
        post_max=3,
        pre_avg=3,
        post_avg=3,
        wait=int(0.15 * sr / 512)  # Min 150ms between snares
    )
    
    kick_set = np.array(kick_onsets)
    snare_set = np.array(snare_onsets)
    tol = 0.05  # 50ms tolerance
    drum_grid = []
    
    for i, t in enumerate(beat_times):
        has_kick = len(kick_set) > 0 and np.min(np.abs(kick_set - t)) < tol
        has_snare = len(snare_set) > 0 and np.min(np.abs(snare_set - t)) < tol
        
        # Calculate confidence based on proximity and energy
        kick_conf = 0.0
        snare_conf = 0.0
        
        if has_kick:
            min_dist = np.min(np.abs(kick_set - t))
            # Get energy at this point
            sample_idx = int(t * sr)
            if sample_idx < len(kick_sig):
                energy = np.abs(kick_sig[max(0, sample_idx-512):sample_idx+512]).mean()
                kick_conf = max(0.0, (1.0 - (min_dist / tol)) * min(1.0, energy * 10))
        
        if has_snare:
            min_dist = np.min(np.abs(snare_set - t))
            sample_idx = int(t * sr)
            if sample_idx < len(snare_sig):
                energy = np.abs(snare_sig[max(0, sample_idx-512):sample_idx+512]).mean()
                snare_conf = max(0.0, (1.0 - (min_dist / tol)) * min(1.0, energy * 10))
        
        drums = []
        if has_kick:
            drums.append('kick')
        if has_snare:
            drums.append('snare')
        
        drum_grid.append({
            'time': float(t),
            'drums': drums,
            'hasKick': bool(has_kick),
            'hasSnare': bool(has_snare),
            'kickConfidence': float(kick_conf),
            'snareConfidence': float(snare_conf)
        })
    
    return drum_grid


def extract_spectral_features(y: np.ndarray, sr: int, frame_times: np.ndarray) -> dict:
    """Extract spectral features for timbre analysis"""
    try:
        spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
        spectral_rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)[0]
        spectral_bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr)[0]
        zero_crossing_rate = librosa.feature.zero_crossing_rate(y)[0]
        
        # Ensure same length as frame_times
        min_len = min(len(spectral_centroid), len(frame_times))
        
        return {
            'centroid': spectral_centroid[:min_len].tolist(),
            'rolloff': spectral_rolloff[:min_len].tolist(),
            'bandwidth': spectral_bandwidth[:min_len].tolist(),
            'zero_crossing_rate': zero_crossing_rate[:min_len].tolist(),
            'timestamps': frame_times[:min_len].tolist()
        }
    except Exception:
        return {
            'centroid': [],
            'rolloff': [],
            'bandwidth': [],
            'zero_crossing_rate': [],
            'timestamps': []
        }


def extract_onsets(y: np.ndarray, sr: int) -> list:
    """Extract general onset events"""
    try:
        onsets = librosa.onset.onset_detect(y=y, sr=sr, units='time', delta=0.1)
        onset_strength = librosa.onset.onset_strength(y=y, sr=sr)
        onset_times = librosa.frames_to_time(np.arange(len(onset_strength)), sr=sr)
        
        # Classify onsets as percussive or harmonic
        # Simple heuristic: high-frequency content suggests percussive
        y_harm, y_perc = librosa.effects.hpss(y, margin=(1.0, 5.0))
        
        onset_events = []
        for onset_time in onsets:
            # Find closest frame
            frame_idx = np.argmin(np.abs(onset_times - onset_time))
            strength = float(onset_strength[frame_idx])
            
            # Classify based on energy in percussive vs harmonic
            onset_frame = int(onset_time * sr)
            if onset_frame < len(y_perc) and onset_frame < len(y_harm):
                perc_energy = np.abs(y_perc[onset_frame:onset_frame+1024]).mean()
                harm_energy = np.abs(y_harm[onset_frame:onset_frame+1024]).mean()
                onset_type = 'percussive' if perc_energy > harm_energy else 'harmonic'
            else:
                onset_type = 'unknown'
            
            onset_events.append({
                'timestamp': float(onset_time),
                'strength': float(strength),
                'type': onset_type
            })
        
        return onset_events
    except Exception:
        return []


def calculate_beat_strength(y_perc: np.ndarray, sr: int, beat_times: np.ndarray) -> list:
    """Calculate strength/confidence for each beat"""
    try:
        onset_strength = librosa.onset.onset_strength(y=y_perc, sr=sr)
        onset_times = librosa.frames_to_time(np.arange(len(onset_strength)), sr=sr)
        
        beat_strengths = []
        for beat_time in beat_times:
            # Find closest onset frame
            frame_idx = np.argmin(np.abs(onset_times - beat_time))
            strength = float(onset_strength[frame_idx])
            
            # Normalize (0-1)
            max_strength = np.max(onset_strength)
            normalized = strength / (max_strength + 1e-10)
            
            beat_strengths.append(float(normalized))
        
        return beat_strengths
    except Exception:
        return [0.5] * len(beat_times)


def track_tempo(y_perc: np.ndarray, sr: int, window_size: int = 8192) -> tuple:
    """Track tempo over time (not just single value)"""
    try:
        # Calculate tempo in windows
        hop_length = 2048
        tempo_track = []
        tempo_times = []
        
        for start in range(0, len(y_perc) - window_size, hop_length):
            window = y_perc[start:start+window_size]
            if len(window) < window_size:
                break
            
            tempo, _ = librosa.beat.beat_track(y=window, sr=sr, start_bpm=120, std_bpm=1.0)
            if isinstance(tempo, (np.ndarray, list)):
                tempo = float(np.squeeze(tempo))
            
            time = start / sr
            tempo_track.append(float(tempo))
            tempo_times.append(float(time))
        
        # Overall tempo and confidence
        if len(tempo_track) > 0:
            overall_tempo = float(np.median(tempo_track))
            # Confidence based on consistency
            tempo_std = np.std(tempo_track)
            tempo_mean = np.mean(tempo_track)
            confidence = float(max(0.0, min(1.0, 1.0 - (tempo_std / (tempo_mean + 1e-10)))))
        else:
            overall_tempo = 120.0
            confidence = 0.5
        
        return overall_tempo, confidence, tempo_track, tempo_times
    except Exception:
        return 120.0, 0.5, [], []


def analyze_harmonic_content(y_harm: np.ndarray, sr: int) -> dict:
    """Analyze harmonic content"""
    try:
        # Harmonic/percussive ratio
        y_full = y_harm  # Assuming y_harm is already separated
        # Re-separate to get ratio
        y_h, y_p = librosa.effects.hpss(y_full, margin=(1.0, 5.0))
        harmonic_energy = np.sum(y_h ** 2)
        total_energy = np.sum(y_full ** 2)
        harmonic_ratio = float(harmonic_energy / (total_energy + 1e-10))
        
        # Pitch salience (simplified)
        chroma = librosa.feature.chroma(y=y_harm, sr=sr)
        pitch_salience = float(np.mean(np.max(chroma, axis=0)))
        
        return {
            'harmonic_ratio': harmonic_ratio,
            'pitch_salience': pitch_salience
        }
    except Exception:
        return {
            'harmonic_ratio': 0.5,
            'pitch_salience': 0.5
        }


def extract_tonnetz(y_harm: np.ndarray, sr: int, frame_times: np.ndarray) -> dict:
    """Extract Tonnetz (Tonal Network) features"""
    try:
        tonnetz = librosa.feature.tonnetz(y=y_harm, sr=sr)
        
        # Ensure same length as frame_times
        min_len = min(tonnetz.shape[1], len(frame_times))
        
        return {
            'tonnetz': tonnetz[:, :min_len].T.tolist(),
            'timestamps': frame_times[:min_len].tolist()
        }
    except Exception:
        return {
            'tonnetz': [],
            'timestamps': []
        }


def analyze(file_path: str):
    """Enhanced analysis with all features"""
    try:
        # Stage 1: Loading
        print(json.dumps({'status': 'progress', 'value': 5, 'stage': 'loading'}), flush=True)
        try:
            y, sr = librosa.load(file_path, sr=22050, mono=True)
        except Exception as load_error:
            # Provide more specific error message for audio format issues
            error_msg = f"Failed to load audio file: {str(load_error)}"
            if "format" in str(load_error).lower() or "ffmpeg" in str(load_error).lower():
                error_msg += ". This may be due to unsupported audio format or missing ffmpeg. Try converting to WAV format."
            print(json.dumps({'error': error_msg}), flush=True)
            return
        duration = float(librosa.get_duration(y=y, sr=sr))
        print(json.dumps({'status': 'progress', 'value': 10, 'stage': 'loaded'}), flush=True)

        # Stage 2: HPSS
        print(json.dumps({'status': 'progress', 'value': 15, 'stage': 'hpss'}), flush=True)
        y_harm, y_perc = librosa.effects.hpss(y, margin=(1.0, 5.0))
        print(json.dumps({'status': 'progress', 'value': 25, 'stage': 'hpss_complete'}), flush=True)

        # Stage 3: Tempo and Beat Tracking
        print(json.dumps({'status': 'progress', 'value': 30, 'stage': 'beat_tracking'}), flush=True)
        tempo, tempo_confidence, tempo_track, tempo_times = track_tempo(y_perc, sr)
        tempo, beat_frames = librosa.beat.beat_track(y=y_perc, sr=sr, start_bpm=tempo)
        if isinstance(tempo, (np.ndarray, list)):
            tempo = float(np.squeeze(tempo))
        beat_times = librosa.frames_to_time(beat_frames, sr=sr)
        print(json.dumps({'status': 'progress', 'value': 40, 'stage': 'beats_detected'}), flush=True)

        # Stage 4: Time Signature and Downbeats
        time_sig, time_sig_confidence = detect_time_signature(beat_times, tempo)
        downbeats = detect_downbeats(y_perc, sr, beat_times, time_sig)
        beat_strengths = calculate_beat_strength(y_perc, sr, beat_times)
        print(json.dumps({'status': 'progress', 'value': 45, 'stage': 'rhythm_analysis'}), flush=True)

        # Stage 5: Chroma Features
        print(json.dumps({'status': 'progress', 'value': 50, 'stage': 'chroma_extraction'}), flush=True)
        chroma_cqt = librosa.feature.chroma_cqt(
            y=y_harm, sr=sr, threshold=0.1, n_chroma=12, bins_per_octave=36
        )
        chroma_cens = librosa.feature.chroma_cens(
            y=y_harm, sr=sr, win_len_smooth=11, n_chroma=12, bins_per_octave=36
        )
        chroma = (0.6 * chroma_cqt) + (0.4 * chroma_cens)
        
        # Stage 6: Key Detection
        detected_key, detected_mode, key_confidence = detect_key(chroma)
        print(json.dumps({'status': 'progress', 'value': 55, 'stage': 'key_detected'}), flush=True)

        # Stage 7: MFCC and Spectral Features
        print(json.dumps({'status': 'progress', 'value': 60, 'stage': 'feature_extraction'}), flush=True)
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        chroma_transposed = chroma.T
        mfcc_transposed = mfcc.T
        times = librosa.frames_to_time(np.arange(len(chroma_transposed)), sr=sr)
        
        # Spectral features
        spectral_features = extract_spectral_features(y, sr, times)
        
        # Stage 8: Onset Detection
        print(json.dumps({'status': 'progress', 'value': 65, 'stage': 'onset_detection'}), flush=True)
        onsets = extract_onsets(y, sr)
        
        # Stage 9: Harmonic Analysis
        print(json.dumps({'status': 'progress', 'value': 70, 'stage': 'harmonic_analysis'}), flush=True)
        harmonic_content = analyze_harmonic_content(y_harm, sr)
        
        # Stage 10: Tonnetz
        print(json.dumps({'status': 'progress', 'value': 75, 'stage': 'tonnetz'}), flush=True)
        tonnetz_features = extract_tonnetz(y_harm, sr, times)

        # Stage 11: Enhanced Chord Detection
        print(json.dumps({'status': 'progress', 'value': 80, 'stage': 'chord_detection'}), flush=True)
        raw_events = []
        # Use beat-aligned chroma for better stability
        beat_aligned_chroma = []
        for beat_time in beat_times:
            # Find closest chroma frame
            frame_idx = np.argmin(np.abs(times - beat_time))
            if frame_idx < len(chroma_transposed):
                beat_aligned_chroma.append(chroma_transposed[frame_idx])
        
        last_label = None
        for i, chroma_frame in enumerate(beat_aligned_chroma):
            if i >= len(beat_times):
                break
            
            # Detect bass note for this beat
            bass_pitch_class = detect_bass_note(y_perc, sr, beat_times[i])
            
            # Enhanced chord detection with bass
            chord, confidence, quality, inversion = estimate_chord_enhanced(
                chroma_frame, 
                bass_pitch_class
            )
            
            if chord == last_label and confidence < 0.7:
                continue
            last_label = chord
            
            raw_events.append({
                'timestamp': float(beat_times[i]),
                'event_type': 'chord_candidate',
                'chord': chord,
                'chord_quality': quality,
                'chord_inversion': int(inversion) if inversion is not None else 0,
                'bass_pitch_class': int(bass_pitch_class) if bass_pitch_class is not None else None,
                'confidence': float(confidence),
                'source': 'PY_Enhanced_Bass'
            })
        
        # Stage 12: Drum Detection
        print(json.dumps({'status': 'progress', 'value': 85, 'stage': 'drum_detection'}), flush=True)
        drum_grid = detect_drums(y_perc, sr, beat_times)
        
        print(json.dumps({'status': 'progress', 'value': 90, 'stage': 'finalizing'}), flush=True)

        # Build result
        result = {
            'fileHash': 'py_enhanced_v1',
            'linear_analysis': {
                'metadata': {
                    'duration_seconds': duration,
                    'sample_rate': int(sr),
                    'frame_hop_seconds': float(librosa.frames_to_time(1, sr=sr)),
                    'detected_key': detected_key,
                    'detected_mode': detected_mode,
                    'key_confidence': float(key_confidence),
                    'time_signature': time_sig,
                    'time_signature_confidence': float(time_sig_confidence)
                },
                'beat_grid': {
                    'tempo_bpm': float(tempo),
                    'tempo_confidence': float(tempo_confidence),
                    'tempo_track': tempo_track,
                    'tempo_track_times': tempo_times,
                    'beat_timestamps': beat_times.tolist(),
                    'beat_strengths': beat_strengths,
                    'downbeat_timestamps': downbeats.tolist(),
                    'time_signature': time_sig,
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
                'spectral_features': spectral_features,
                'onsets': onsets,
                'harmonic_content': harmonic_content,
                'tonnetz_features': tonnetz_features,
                'semantic_features': {'frames': []}
            }
        }

        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json') as tmp:
            json.dump(result, tmp)
            print(json.dumps({'status': 'complete', 'path': tmp.name}), flush=True)
    except Exception as e:
        import traceback
        print(json.dumps({'error': f"{e}\n{traceback.format_exc()}"}), flush=True)
        sys.exit(1)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No file provided'}), flush=True)
        sys.exit(1)
    analyze(sys.argv[1])

