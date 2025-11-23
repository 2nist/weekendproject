#!/usr/bin/env python3
"""
BIMMUDA Dataset Training Script
Trains machine learning models on the processed BIMMUDA dataset for various music analysis tasks.
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import classification_report, accuracy_score
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers
import matplotlib.pyplot as plt
import seaborn as sns
import argparse

class BIMMUDA_Trainer:
    def __init__(self, library_path):
        self.library_path = library_path
        self.data_manager = None
        self.models = {}
        self.encoders = {}

    def load_bimmuda_data(self):
        """Load processed BIMMUDA training data"""
        bimmuda_path = os.path.join(self.library_path, 'processed_bimmuda_training_data.json')

        if not os.path.exists(bimmuda_path):
            raise FileNotFoundError(f"BIMMUDA data not found at {bimmuda_path}")

        with open(bimmuda_path, 'r', encoding='utf-8') as f:
            self.bimmuda_data = json.load(f)

        print(f"Loaded BIMMUDA data: {self.bimmuda_data['metadata']['total_songs']} songs")
        return self.bimmuda_data

    def load_training_datasets(self):
        """Load specialized training datasets"""
        self.training_datasets = {}

        dataset_names = [
            'chord_progression_prediction',
            'melody_generation',
            'style_classification',
            'lyric_alignment'
        ]

        for name in dataset_names:
            dataset_path = os.path.join(self.library_path, f'{name}_dataset.json')
            if os.path.exists(dataset_path):
                with open(dataset_path, 'r', encoding='utf-8') as f:
                    self.training_datasets[name] = json.load(f)
                print(f"Loaded {name} dataset: {self.training_datasets[name]['total_samples']} samples")
            else:
                print(f"Warning: {name} dataset not found")

        return self.training_datasets

    def train_chord_progression_model(self, epochs=50, batch_size=32):
        """Train chord progression prediction model"""
        if 'chord_progression_prediction' not in self.training_datasets:
            print("Chord progression dataset not available")
            return None

        dataset = self.training_datasets['chord_progression_prediction']
        data = dataset['data']

        # Prepare sequences
        max_seq_len = max(len(sample['input']) for sample in data)
        all_chords = set()
        for sample in data:
            all_chords.update(sample['input'] + [sample['target']])

        # Create chord vocabulary
        chord_vocab = sorted(list(all_chords))
        chord_to_idx = {chord: i for i, chord in enumerate(chord_vocab)}

        # Prepare training data
        X = []
        y = []

        for sample in data:
            # Pad sequences to max length
            seq = [chord_to_idx[chord] for chord in sample['input']]
            seq_padded = seq + [0] * (max_seq_len - len(seq))  # Pad with 0
            X.append(seq_padded)
            y.append(chord_to_idx[sample['target']])

        X = np.array(X)
        y = np.array(y)

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Build model
        vocab_size = len(chord_vocab)
        embedding_dim = 32

        model = keras.Sequential([
            layers.Embedding(vocab_size + 1, embedding_dim, input_length=max_seq_len),
            layers.LSTM(64, return_sequences=True),
            layers.LSTM(32),
            layers.Dense(64, activation='relu'),
            layers.Dropout(0.2),
            layers.Dense(vocab_size, activation='softmax')
        ])

        model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )

        # Train model
        history = model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.2,
            verbose=1
        )

        # Evaluate
        test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
        print(".2f")

        # Save model
        model_path = os.path.join(self.library_path, 'models', 'chord_progression_model.h5')
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        model.save(model_path)

        # Save metadata
        metadata = {
            'vocab': chord_vocab,
            'max_seq_len': max_seq_len,
            'model_path': model_path
        }
        with open(os.path.join(self.library_path, 'models', 'chord_progression_metadata.json'), 'w') as f:
            json.dump(metadata, f)

        self.models['chord_progression'] = model
        return model, history

    def train_style_classification_model(self, epochs=30, batch_size=16):
        """Train style/genre classification model"""
        if 'style_classification' not in self.training_datasets:
            print("Style classification dataset not available")
            return None

        dataset = self.training_datasets['style_classification']
        data = dataset['data']

        # Extract features and labels
        features = []
        labels = []

        for sample in data:
            # Flatten instrumentation features
            inst_features = []
            for instrument, count in sample['features']['instrumentation']['instrument_counts'].items():
                inst_features.append(count)

            # Combine all features
            feature_vector = [
                sample['features']['instrumentation']['total_tracks'],
                sample['features']['rhythmic_density'],
                sample['features']['tempo'],
                len(inst_features)  # Number of unique instruments
            ] + inst_features

            features.append(feature_vector)
            labels.append(sample['label'])

        X = np.array(features)
        y = np.array(labels)

        # Encode labels
        label_encoder = LabelEncoder()
        y_encoded = label_encoder.fit_transform(y)

        # Normalize features
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X_scaled, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )

        # Build model
        input_dim = X.shape[1]
        num_classes = len(label_encoder.classes_)

        model = keras.Sequential([
            layers.Dense(64, activation='relu', input_shape=(input_dim,)),
            layers.Dropout(0.3),
            layers.Dense(32, activation='relu'),
            layers.Dropout(0.2),
            layers.Dense(num_classes, activation='softmax')
        ])

        model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )

        # Train model
        history = model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.2,
            verbose=1
        )

        # Evaluate
        test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
        print(".2f")

        # Predictions for detailed report
        y_pred = model.predict(X_test)
        y_pred_classes = np.argmax(y_pred, axis=1)

        print("\nClassification Report:")
        print(classification_report(y_test, y_pred_classes,
                                  target_names=label_encoder.classes_))

        # Save model
        model_path = os.path.join(self.library_path, 'models', 'style_classification_model.h5')
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        model.save(model_path)

        # Save metadata
        metadata = {
            'label_encoder_classes': label_encoder.classes_.tolist(),
            'scaler_mean': scaler.mean_.tolist(),
            'scaler_scale': scaler.scale_.tolist(),
            'model_path': model_path
        }
        with open(os.path.join(self.library_path, 'models', 'style_classification_metadata.json'), 'w') as f:
            json.dump(metadata, f)

        self.models['style_classification'] = model
        self.encoders['style_labels'] = label_encoder
        return model, history

    def train_melody_generation_model(self, epochs=100, batch_size=64):
        """Train melody generation model using sequence prediction"""
        if 'melody_generation' not in self.training_datasets:
            print("Melody generation dataset not available")
            return None

        dataset = self.training_datasets['melody_generation']
        data = dataset['data']

        # Prepare melody sequences
        sequences = []
        for sample in data:
            if len(sample['input_sequence']) > 0:
                sequences.append(sample['input_sequence'] + [sample['target_pitch']])

        if len(sequences) == 0:
            print("No valid melody sequences found")
            return None

        # Create vocabulary of MIDI pitches
        all_pitches = set()
        for seq in sequences:
            all_pitches.update(seq)

        pitch_vocab = sorted(list(all_pitches))
        pitch_to_idx = {pitch: i for i, pitch in enumerate(pitch_vocab)}

        # Prepare training data
        seq_length = 8  # Use 8 notes to predict the next
        X = []
        y = []

        for seq in sequences:
            if len(seq) > seq_length:
                for i in range(len(seq) - seq_length):
                    X.append([pitch_to_idx[pitch] for pitch in seq[i:i+seq_length]])
                    y.append(pitch_to_idx[seq[i+seq_length]])

        if len(X) == 0:
            print("Not enough sequence data for training")
            return None

        X = np.array(X)
        y = np.array(y)

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Build model
        vocab_size = len(pitch_vocab)

        model = keras.Sequential([
            layers.Embedding(vocab_size, 64, input_length=seq_length),
            layers.LSTM(128, return_sequences=True),
            layers.LSTM(64),
            layers.Dense(64, activation='relu'),
            layers.Dropout(0.2),
            layers.Dense(vocab_size, activation='softmax')
        ])

        model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )

        # Train model
        history = model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_split=0.2,
            verbose=1
        )

        # Evaluate
        test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
        print(".2f")

        # Save model
        model_path = os.path.join(self.library_path, 'models', 'melody_generation_model.h5')
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        model.save(model_path)

        # Save metadata
        metadata = {
            'pitch_vocab': pitch_vocab,
            'seq_length': seq_length,
            'model_path': model_path
        }
        with open(os.path.join(self.library_path, 'models', 'melody_generation_metadata.json'), 'w') as f:
            json.dump(metadata, f)

        self.models['melody_generation'] = model
        return model, history

    def plot_training_history(self, history, model_name):
        """Plot training history"""
        plt.figure(figsize=(12, 4))

        # Accuracy
        plt.subplot(1, 2, 1)
        plt.plot(history.history['accuracy'], label='Training Accuracy')
        plt.plot(history.history['val_accuracy'], label='Validation Accuracy')
        plt.title(f'{model_name} - Accuracy')
        plt.xlabel('Epoch')
        plt.ylabel('Accuracy')
        plt.legend()

        # Loss
        plt.subplot(1, 2, 2)
        plt.plot(history.history['loss'], label='Training Loss')
        plt.plot(history.history['val_loss'], label='Validation Loss')
        plt.title(f'{model_name} - Loss')
        plt.xlabel('Epoch')
        plt.ylabel('Loss')
        plt.legend()

        plt.tight_layout()
        plt.savefig(os.path.join(self.library_path, 'models', f'{model_name}_training_history.png'))
        plt.show()

    def run_training_pipeline(self, tasks=None):
        """Run complete training pipeline"""
        if tasks is None:
            tasks = ['chord_progression', 'style_classification', 'melody_generation']

        print("🎵 Starting BIMMUDA Training Pipeline")
        print("=" * 50)

        # Load data
        print("\n📊 Loading BIMMUDA data...")
        self.load_bimmuda_data()
        self.load_training_datasets()

        # Train models
        results = {}

        if 'chord_progression' in tasks:
            print("\n🎼 Training Chord Progression Model...")
            try:
                model, history = self.train_chord_progression_model()
                if model:
                    results['chord_progression'] = {'model': model, 'history': history}
                    self.plot_training_history(history, 'chord_progression')
            except Exception as e:
                print(f"Failed to train chord progression model: {e}")

        if 'style_classification' in tasks:
            print("\n🎨 Training Style Classification Model...")
            try:
                model, history = self.train_style_classification_model()
                if model:
                    results['style_classification'] = {'model': model, 'history': history}
                    self.plot_training_history(history, 'style_classification')
            except Exception as e:
                print(f"Failed to train style classification model: {e}")

        if 'melody_generation' in tasks:
            print("\n🎹 Training Melody Generation Model...")
            try:
                model, history = self.train_melody_generation_model()
                if model:
                    results['melody_generation'] = {'model': model, 'history': history}
                    self.plot_training_history(history, 'melody_generation')
            except Exception as e:
                print(f"Failed to train melody generation model: {e}")

        print("\n✅ Training pipeline complete!")
        print(f"📁 Models saved to: {os.path.join(self.library_path, 'models')}")

        return results


def main():
    parser = argparse.ArgumentParser(description='Train ML models on BIMMUDA dataset')
    parser.add_argument('--library-path', default='library',
                       help='Path to the library directory')
    parser.add_argument('--tasks', nargs='+',
                       choices=['chord_progression', 'style_classification', 'melody_generation'],
                       default=['chord_progression', 'style_classification', 'melody_generation'],
                       help='Training tasks to run')

    args = parser.parse_args()

    # Initialize trainer
    trainer = BIMMUDA_Trainer(args.library_path)

    # Run training pipeline
    results = trainer.run_training_pipeline(args.tasks)

    print("\n🎉 All training tasks completed!")
    print(f"Models available: {list(results.keys())}")


if __name__ == '__main__':
    main()