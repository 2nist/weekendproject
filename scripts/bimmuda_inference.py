#!/usr/bin/env python3
"""
BIMMUDA Model Integration Script
Loads trained ML models and provides inference capabilities for music analysis.
"""

import os
import sys
import json
import numpy as np
import tensorflow as tf
from tensorflow import keras
from sklearn.preprocessing import StandardScaler, LabelEncoder
import librosa
import warnings
warnings.filterwarnings('ignore')

class BIMMUDA_ModelLoader:
    def __init__(self, models_path):
        self.models_path = models_path
        self.models = {}
        self.metadata = {}
        self.encoders = {}

    def load_chord_progression_model(self):
        """Load chord progression prediction model"""
        model_path = os.path.join(self.models_path, 'chord_progression_model.h5')
        metadata_path = os.path.join(self.models_path, 'chord_progression_metadata.json')

        if not os.path.exists(model_path) or not os.path.exists(metadata_path):
            print("Chord progression model not found")
            return False

        # Load model and metadata
        self.models['chord_progression'] = keras.models.load_model(model_path)

        with open(metadata_path, 'r') as f:
            self.metadata['chord_progression'] = json.load(f)

        print("✅ Loaded chord progression model")
        return True

    def load_style_classification_model(self):
        """Load style classification model"""
        model_path = os.path.join(self.models_path, 'style_classification_model.h5')
        metadata_path = os.path.join(self.models_path, 'style_classification_metadata.json')

        if not os.path.exists(model_path) or not os.path.exists(metadata_path):
            print("Style classification model not found")
            return False

        # Load model and metadata
        self.models['style_classification'] = keras.models.load_model(model_path)

        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        # Recreate encoders
        self.encoders['style_labels'] = LabelEncoder()
        self.encoders['style_labels'].classes_ = np.array(metadata['label_encoder_classes'])

        # Recreate scaler
        self.encoders['style_scaler'] = StandardScaler()
        self.encoders['style_scaler'].mean_ = np.array(metadata['scaler_mean'])
        self.encoders['style_scaler'].scale_ = np.array(metadata['scaler_scale'])

        self.metadata['style_classification'] = metadata
        print("✅ Loaded style classification model")
        return True

    def load_melody_generation_model(self):
        """Load melody generation model"""
        model_path = os.path.join(self.models_path, 'melody_generation_model.h5')
        metadata_path = os.path.join(self.models_path, 'melody_generation_metadata.json')

        if not os.path.exists(model_path) or not os.path.exists(metadata_path):
            print("Melody generation model not found")
            return False

        # Load model and metadata
        self.models['melody_generation'] = keras.models.load_model(model_path)

        with open(metadata_path, 'r') as f:
            self.metadata['melody_generation'] = json.load(f)

        print("✅ Loaded melody generation model")
        return True

    def load_all_models(self):
        """Load all available trained models"""
        print("🔄 Loading BIMMUDA ML models...")

        self.load_chord_progression_model()
        self.load_style_classification_model()
        self.load_melody_generation_model()

        loaded_count = len(self.models)
        print(f"📊 Loaded {loaded_count}/3 models")

        return loaded_count > 0

    def predict_chord_progression(self, chord_sequence, max_predictions=5):
        """Predict next chords in a progression"""
        if 'chord_progression' not in self.models:
            return None

        model = self.models['chord_progression']
        metadata = self.metadata['chord_progression']

        chord_to_idx = {chord: i for i, chord in enumerate(metadata['vocab'])}
        idx_to_chord = {i: chord for chord, i in chord_to_idx.items()}

        # Convert input sequence to indices
        try:
            seq_indices = [chord_to_idx[chord] for chord in chord_sequence]
        except KeyError as e:
            print(f"Unknown chord in sequence: {e}")
            return None

        # Pad sequence
        max_seq_len = metadata['max_seq_len']
        seq_padded = seq_indices + [0] * (max_seq_len - len(seq_indices))
        seq_padded = seq_padded[:max_seq_len]  # Truncate if too long

        # Make predictions
        input_seq = np.array([seq_padded])
        predictions = model.predict(input_seq, verbose=0)[0]

        # Get top predictions
        top_indices = np.argsort(predictions)[-max_predictions:][::-1]
        results = []

        for idx in top_indices:
            chord = idx_to_chord.get(idx, f"chord_{idx}")
            confidence = float(predictions[idx])
            results.append({
                'chord': chord,
                'confidence': confidence
            })

        return results

    def predict_style(self, audio_features):
        """Predict musical style/genre"""
        if 'style_classification' not in self.models:
            return None

        model = self.models['style_classification']
        scaler = self.encoders['style_scaler']
        label_encoder = self.encoders['style_labels']

        # Extract features (simplified version)
        try:
            # Basic feature extraction - in practice, this would use more sophisticated analysis
            feature_vector = [
                audio_features.get('total_tracks', 4),
                audio_features.get('rhythmic_density', 0.5),
                audio_features.get('tempo', 120),
                len(audio_features.get('instrument_counts', {}))
            ]

            # Add instrument counts
            inst_counts = audio_features.get('instrument_counts', {})
            for instrument in ['piano', 'guitar', 'bass', 'drums', 'vocals']:  # Common instruments
                feature_vector.append(inst_counts.get(instrument, 0))

            # Scale features
            feature_vector = np.array([feature_vector])
            feature_scaled = scaler.transform(feature_vector)

            # Predict
            predictions = model.predict(feature_scaled, verbose=0)[0]
            predicted_idx = np.argmax(predictions)
            predicted_style = label_encoder.inverse_transform([predicted_idx])[0]
            confidence = float(predictions[predicted_idx])

            # Get top 3 predictions
            top_indices = np.argsort(predictions)[-3:][::-1]
            top_styles = []

            for idx in top_indices:
                style = label_encoder.inverse_transform([idx])[0]
                conf = float(predictions[idx])
                top_styles.append({'style': style, 'confidence': conf})

            return {
                'predicted_style': predicted_style,
                'confidence': confidence,
                'top_predictions': top_styles
            }

        except Exception as e:
            print(f"Style prediction error: {e}")
            return None

    def generate_melody(self, seed_sequence, length=16):
        """Generate melody continuation"""
        if 'melody_generation' not in self.models:
            return None

        model = self.models['melody_generation']
        metadata = self.metadata['melody_generation']

        pitch_vocab = metadata['pitch_vocab']
        pitch_to_idx = {pitch: i for i, pitch in enumerate(pitch_vocab)}
        idx_to_pitch = {i: pitch for pitch, i in pitch_to_idx.items()}
        seq_length = metadata['seq_length']

        # Convert seed to indices
        try:
            seed_indices = [pitch_to_idx[pitch] for pitch in seed_sequence]
        except KeyError as e:
            print(f"Unknown pitch in seed: {e}")
            return None

        generated = seed_indices.copy()

        # Generate new pitches
        for _ in range(length):
            # Prepare input sequence
            input_seq = generated[-seq_length:]
            if len(input_seq) < seq_length:
                input_seq = [0] * (seq_length - len(input_seq)) + input_seq

            input_seq = np.array([input_seq])

            # Predict next pitch
            predictions = model.predict(input_seq, verbose=0)[0]
            predicted_idx = np.argmax(predictions)

            # Add to generated sequence
            generated.append(predicted_idx)

        # Convert back to pitches
        generated_pitches = [idx_to_pitch.get(idx, 60) for idx in generated]  # Default to middle C

        return {
            'generated_melody': generated_pitches,
            'seed_length': len(seed_sequence),
            'generated_length': length
        }

    def analyze_audio_file(self, audio_path):
        """Complete audio analysis using all available models"""
        if not os.path.exists(audio_path):
            return {"error": "Audio file not found"}

        try:
            # Load audio
            y, sr = librosa.load(audio_path, sr=22050)

            # Basic audio features
            tempo, _ = librosa.beat.tempo(y=y, sr=sr)
            chroma = librosa.feature.chroma_stft(y=y, sr=sr)
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)

            # Simplified analysis results
            analysis = {
                'tempo': float(tempo),
                'duration': float(len(y) / sr),
                'chroma_mean': chroma.mean(axis=1).tolist(),
                'spectral_centroid_mean': float(spectral_centroid.mean())
            }

            # Add ML predictions if models are loaded
            if 'style_classification' in self.models:
                # Mock audio features for style prediction
                mock_features = {
                    'total_tracks': 4,
                    'rhythmic_density': 0.6,
                    'tempo': tempo,
                    'instrument_counts': {'piano': 1, 'guitar': 1, 'bass': 1, 'drums': 1}
                }
                style_result = self.predict_style(mock_features)
                if style_result:
                    analysis['predicted_style'] = style_result

            return analysis

        except Exception as e:
            return {"error": f"Analysis failed: {str(e)}"}


class BIMMUDA_InferenceAPI:
    """API wrapper for Node.js integration"""

    def __init__(self, models_path='library/models'):
        self.loader = BIMMUDA_ModelLoader(models_path)
        self.models_loaded = self.loader.load_all_models()

    def predict_chords(self, chord_sequence, max_predictions=5):
        """API method for chord prediction"""
        if not self.models_loaded:
            return {"error": "Models not loaded"}

        result = self.loader.predict_chord_progression(chord_sequence, max_predictions)
        if result:
            return {"success": True, "predictions": result}
        else:
            return {"error": "Prediction failed"}

    def classify_style(self, features):
        """API method for style classification"""
        if not self.models_loaded:
            return {"error": "Models not loaded"}

        result = self.loader.predict_style(features)
        if result:
            return {"success": True, "classification": result}
        else:
            return {"error": "Classification failed"}

    def generate_melody(self, seed_sequence, length=16):
        """API method for melody generation"""
        if not self.models_loaded:
            return {"error": "Models not loaded"}

        result = self.loader.generate_melody(seed_sequence, length)
        if result:
            return {"success": True, "melody": result}
        else:
            return {"error": "Generation failed"}

    def analyze_audio(self, audio_path):
        """API method for complete audio analysis"""
        if not self.models_loaded:
            return {"error": "Models not loaded"}

        result = self.loader.analyze_audio_file(audio_path)
        return result


def main():
    """Main entry point for command line usage"""
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python bimmuda_inference.py "
                                   "<method> <args_json>"}))
        return

    method = sys.argv[1]
    args_json = sys.argv[2]

    try:
        args = json.loads(args_json)
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON args: {e}"}))
        return

    # Initialize API
    api = BIMMUDA_InferenceAPI()

    if not api.models_loaded:
        print(json.dumps({"error": "Models not loaded"}))
        return

    # Route to appropriate method
    try:
        if method == 'predict_chords':
            result = api.predict_chords(
                args.get('chord_sequence', []),
                args.get('max_predictions', 5)
            )
        elif method == 'classify_style':
            result = api.classify_style(args.get('features', {}))
        elif method == 'generate_melody':
            result = api.generate_melody(
                args.get('seed_sequence', []),
                args.get('length', 16)
            )
        elif method == 'analyze_audio':
            result = api.analyze_audio(args.get('audio_path', ''))
        else:
            result = {"error": f"Unknown method: {method}"}

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"error": f"Method execution failed: {str(e)}"}))


if __name__ == '__main__':
    main()


if __name__ == '__main__':
    main()