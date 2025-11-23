import React from 'react';

export default function ProbabilityDashboard({ analysis }) {
  if (!analysis) {
    return null;
  }

  const harmonicContext = analysis.harmonic_context || {};
  const globalKey = harmonicContext.global_key || {};
  const altKey =
    harmonicContext.alt_keys?.[0]?.key ||
    harmonicContext.global_key?.secondary ||
    'Unknown';
  const altConfidence =
    harmonicContext.alt_keys?.[0]?.confidence ||
    harmonicContext.global_key?.secondary_confidence ||
    0.2;

  const keyConfidence = clamp(globalKey.confidence ?? 0.5);
  const stabilityScore = computeStabilityScore(harmonicContext);
  const sections = analysis.structural_map?.sections || [];
  const signals = computeSignals(sections);

  return (
    <div
      style={{
        padding: '16px',
        backgroundColor: '#0f172a',
        color: 'white',
        width: '320px',
        borderLeft: '1px solid #1e293b',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '16px' }}>
        Engine Confidence
      </h3>

      <section style={{ marginBottom: '24px' }}>
        <label style={labelStyle}>Detected Key</label>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '2rem', fontFamily: 'var(--font-mono)', color: '#34d399' }}>
            {globalKey.primary_key || 'Unknown'}
          </span>
          <span style={{ fontSize: '0.9rem' }}>{Math.round(keyConfidence * 100)}%</span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
          Alt: {altKey} ({Math.round(clamp(altConfidence) * 100)}%)
        </div>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <label style={labelStyle}>Harmonic Stability</label>
        <div style={barBackgroundStyle}>
          <div
            style={{
              ...barFillStyle,
              width: `${Math.round(stabilityScore * 100)}%`,
            }}
          />
        </div>
        <p style={{ fontSize: '0.75rem', marginTop: '6px', color: '#94a3b8' }}>
          {stabilityScore > 0.8 ? 'Strictly Diatonic' : 'Complex / Chromatic'}
        </p>
      </section>

      <section>
        <label style={labelStyle}>Structure Logic</label>
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '12px' }}>
          <SignalRow label="Repetition" value={signals.repetition} />
          <SignalRow label="Energy Contrast" value={signals.energyContrast} />
          <SignalRow label="Segment Duration" value={signals.duration} />
        </ul>
      </section>
    </div>
  );
}

function SignalRow({ label, value }) {
  const colorMap = {
    strong: '#34d399',
    medium: '#fbbf24',
    weak: '#f87171',
  };
  const textMap = {
    strong: 'Strong',
    medium: 'Medium',
    weak: 'Weak',
  };

  return (
    <li
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.9rem',
        marginBottom: '8px',
      }}
    >
      <span>{label}</span>
      <span style={{ color: colorMap[value] || '#cbd5f5' }}>
        {textMap[value] || 'Unknown'}
      </span>
    </li>
  );
}

function computeSignals(sections = []) {
  if (!sections.length) {
    return { repetition: 'weak', energyContrast: 'weak', duration: 'weak' };
  }

  const repetitionStrong = sections.some(
    (section) => (section.semantic_signature?.repetition_score || 0) > 0.6,
  );

  const energyValues = sections
    .map((section) => section.semantic_signature?.avg_rms || 0)
    .sort((a, b) => b - a);
  const energyContrast =
    energyValues.length >= 2 ? energyValues[0] - energyValues[Math.floor(energyValues.length / 2)] : 0;

  const durationAvg =
    sections.reduce(
      (sum, section) => sum + (section.semantic_signature?.duration_seconds || 0),
      0,
    ) / sections.length;

  return {
    repetition: repetitionStrong ? 'strong' : 'weak',
    energyContrast: energyContrast > 0.08 ? 'medium' : 'weak',
    duration: durationAvg >= 10 ? 'strong' : durationAvg >= 6 ? 'medium' : 'weak',
  };
}

function computeStabilityScore(harmonicContext) {
  const functionalSummary = harmonicContext.functional_summary || {};
  const chromaticDensity = functionalSummary.chromatic_density ?? 0.3;
  return clamp(1 - chromaticDensity);
}

const labelStyle = {
  fontSize: '0.7rem',
  textTransform: 'uppercase',
  color: '#94a3b8',
  letterSpacing: '0.08em',
};

const barBackgroundStyle = {
  width: '100%',
  height: '8px',
  backgroundColor: '#1e293b',
  borderRadius: '4px',
  marginTop: '8px',
  overflow: 'hidden',
};

const barFillStyle = {
  height: '100%',
  backgroundColor: '#3b82f6',
  transition: 'width 0.4s ease',
};

function clamp(value) {
  return Math.min(1, Math.max(0, value ?? 0));
}

