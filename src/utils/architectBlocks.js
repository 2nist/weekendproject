const SECTION_COLORS = {
  intro: '#3b82f6',
  verse: '#10b981',
  chorus: '#f59e0b',
  bridge: '#ef4444',
  outro: '#8b5cf6',
  default: '#6b7280',
};

export function getSectionColor(label = '') {
  return SECTION_COLORS[label.toLowerCase()] || SECTION_COLORS.default;
}

export function sectionsToBlocks(sections = []) {
  return sections.map((section, index) => {
    const duration = section?.time_range
      ? (section.time_range.end_time || 0) - (section.time_range.start_time || 0)
      : 4;
    const bars = Math.max(1, Math.round(duration / 2) || 1);

    return {
      id: section.section_id || `section-${index}`,
      name: section.section_label || 'Section',
      label: section.section_label || 'Section',
      length: bars,
      bars,
      color: getSectionColor(section.section_label || ''),
      section_label: section.section_label,
      section_variant: section.section_variant,
      harmonic_dna: section.harmonic_dna || {},
      rhythmic_dna: section.rhythmic_dna || {},
      time_range: section.time_range,
      probability_score: section.probability_score || 0.5,
      semantic_signature: section.semantic_signature || {},
    };
  });
}

