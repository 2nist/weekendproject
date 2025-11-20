const SECTION_PRIORITY = [
  'intro',
  'verse',
  'pre-chorus',
  'chorus',
  'bridge',
  'middle8',
  'solo',
  'instrumental',
  'breakdown',
  'outro',
];

const MIN_CHORUS_SECONDS = 12;

function labelSectionsWithSemantics(sections = [], metadata = {}) {
  if (!Array.isArray(sections) || sections.length === 0) {
    return sections;
  }

  const clones = sections.map((section) => ({
    ...section,
    semantic_signature: {
      ...(section.semantic_signature || {}),
      architect_label: section.semantic_signature?.architect_label || section.section_label,
    },
  }));

  const totalDuration =
    metadata.duration_seconds ||
    clones.reduce((max, section) => Math.max(max, section.time_range?.end_time || 0), 0);

  const labelCounts = new Map();
  const chorusCandidates = findChorusCandidates(clones);
  chorusCandidates.forEach((section) =>
    applySemanticLabel(section, 'chorus', 0.92, 'High repetition and energy anchor', labelCounts),
  );

  labelIntro(clones, totalDuration, labelCounts);
  labelOutro(clones, labelCounts);
  labelVerses(clones, chorusCandidates, labelCounts);
  labelPreChorus(clones, labelCounts);
  labelBridgeAndMiddleEight(clones, labelCounts);
  labelInstrumentalMoments(clones, labelCounts);
  labelBreakdowns(clones, labelCounts);

  normalizeVariants(clones);
  return clones;
}

function findChorusCandidates(sections) {
  const candidates = sections.filter(
    (section) =>
      section.semantic_signature?.has_vocals &&
      section.semantic_signature?.repetition_score !== undefined &&
      (section.semantic_signature?.duration_seconds || 0) >= MIN_CHORUS_SECONDS,
  );

  if (!candidates.length) {
    return [];
  }

  const sorted = [...candidates].sort((a, b) => {
    const repDiff =
      (b.semantic_signature.repetition_score || 0) -
      (a.semantic_signature.repetition_score || 0);
    if (repDiff !== 0) return repDiff;
    return (b.semantic_signature.avg_rms || 0) - (a.semantic_signature.avg_rms || 0);
  });

  const topRepetition = sorted[0].semantic_signature.repetition_score || 0;
  const topEnergy = sorted[0].semantic_signature.avg_rms || 0;
  const thresholdRep = topRepetition * 0.75;
  const thresholdEnergy = topEnergy * 0.7;

  return sorted.filter(
    (section) =>
      (section.semantic_signature.repetition_score || 0) >= thresholdRep &&
      (section.semantic_signature.avg_rms || 0) >= thresholdEnergy,
  );
}

function labelIntro(sections, totalDuration, labelCounts) {
  const first = sections[0];
  if (!first) return;
  const positionRatio = first.semantic_signature?.position_ratio ?? 0;
  const repeats = first.semantic_signature?.repetition_count || 1;

  if (positionRatio < 0.15 && repeats <= 2) {
    applySemanticLabel(first, 'intro', 0.75, 'Opening block with low repetition', labelCounts);
  }
}

function labelVerses(sections, chorusCandidates, labelCounts) {
  const chorusEnergy = Math.max(
    ...chorusCandidates.map((section) => section.semantic_signature?.avg_rms || 0),
    0.0001,
  );

  sections.forEach((section) => {
    if (section.section_label) return;
    const sig = section.semantic_signature || {};
    const energy = sig.avg_rms || 0;
    const repetitionScore = sig.repetition_score || 0;

    if (
      sig.has_vocals &&
      energy < chorusEnergy &&
      repetitionScore >= 0.2 &&
      sig.position_ratio < 0.65
    ) {
      applySemanticLabel(section, 'verse', 0.8, 'Medium energy repeating vocal block', labelCounts);
    }
  });
}

function labelPreChorus(sections, labelCounts) {
  sections.forEach((section, idx) => {
    if (section.section_label) return;

    const next = sections[idx + 1];
    if (!next || next.section_label !== 'chorus') return;

    const sig = section.semantic_signature || {};
    const duration = sig.duration_seconds || section.time_range?.duration_bars || 0;
    const risingEnergy = (sig.spectral_flux_trend || 0) > 0;

    if (duration > 0 && duration <= 20 && risingEnergy) {
      applySemanticLabel(
        section,
        'pre-chorus',
        0.78,
        'Short riser directly before chorus',
        labelCounts,
      );
    }
  });
}

function labelBridgeAndMiddleEight(sections, labelCounts) {
  const choruses = sections.filter((section) => section.section_label === 'chorus');
  if (choruses.length < 2) return;

  const secondChorusIndex = sections.indexOf(choruses[1]);
  if (secondChorusIndex < 0) return;

  const candidates = sections.slice(secondChorusIndex + 1);
  candidates.forEach((section) => {
    if (section.section_label) return;
    const sig = section.semantic_signature || {};
    if (sig.is_unique) {
      const durationBars = sig.duration_bars || 0;
      if (Math.abs(durationBars - 8) <= 1 && !sig.has_vocals) {
        applySemanticLabel(
          section,
          'middle8',
          0.82,
          'Unique 8-bar instrumental section',
          labelCounts,
        );
      } else {
        applySemanticLabel(section, 'bridge', 0.8, 'Unique post-chorus contrast', labelCounts);
      }
    }
  });
}

function labelInstrumentalMoments(sections, labelCounts) {
  sections.forEach((section) => {
    if (section.section_label) return;
    const sig = section.semantic_signature || {};

    if (!sig.has_vocals && (sig.avg_rms || 0) > 0.02) {
      if ((sig.avg_rms || 0) > 0.05) {
        applySemanticLabel(section, 'solo', 0.72, 'High energy without vocals', labelCounts);
      } else {
        applySemanticLabel(section, 'instrumental', 0.68, 'Instrumental texture block', labelCounts);
      }
    }
  });
}

function labelBreakdowns(sections, labelCounts) {
  sections.forEach((section, idx) => {
    if (section.section_label) return;
    const previous = sections[idx - 1];
    if (!previous) return;

    const currentEnergy = section.semantic_signature?.avg_rms || 0;
    const previousEnergy = previous.semantic_signature?.avg_rms || 0;
    if (currentEnergy < previousEnergy * 0.5 && !section.semantic_signature?.has_vocals) {
      applySemanticLabel(section, 'breakdown', 0.7, 'Energy drop creating breakdown', labelCounts);
    }
  });
}

function labelOutro(sections, labelCounts) {
  const last = sections[sections.length - 1];
  if (!last) return;
  if (!last.section_label) {
    applySemanticLabel(last, 'outro', 0.74, 'Final block / fade out', labelCounts);
  }
}

function applySemanticLabel(section, label, confidence, reason, labelCounts) {
  if (!section || section.section_label === label) return;

  const nextVariant = (labelCounts.get(label) || 0) + 1;
  labelCounts.set(label, nextVariant);
  section.section_label = label;
  section.section_variant = nextVariant;
  section.semantic_signature = section.semantic_signature || {};
  section.semantic_signature.semantic_label = {
    label,
    confidence,
    reason,
  };
}

function normalizeVariants(sections) {
  const counters = new Map();
  sections.forEach((section) => {
    const label = section.section_label || 'section';
    const count = (counters.get(label) || 0) + 1;
    counters.set(label, count);
    section.section_variant = count;
  });
}

module.exports = {
  labelSectionsWithSemantics,
};

