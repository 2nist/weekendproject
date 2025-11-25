const db = require('../db');
const logger = require('../analysis/logger');

// Note: This handler is designed to be testable in isolation. It takes an object
// { frame, fileHash } and performs the split, updating the DB and broadcasting
// UI updates through main.js's mechanisms (the main process will handle the
// `mainWindow` broadcast if present).
async function forceSplitHandler({ frame, fileHash } = {}) {
  try {
    if (typeof frame !== 'number' || frame < 0) {
      return { success: false, error: 'Invalid frame index' };
    }

    let analysis = null;
    if (fileHash) analysis = db.getAnalysis(fileHash);
    else analysis = db.getMostRecentAnalysis();
    if (!analysis || !analysis.structural_map || !Array.isArray(analysis.structural_map.sections))
      return { success: false, error: 'No valid analysis found to split' };

    // Determine frameHop (seconds per frame) from analysis metadata
    let frameHop = 0.1;
    try {
      const laMeta = analysis.linear_analysis?.metadata || {};
      if (laMeta.frame_hop_seconds) frameHop = Number(laMeta.frame_hop_seconds);
      else if (laMeta.hop_length && laMeta.sample_rate)
        frameHop = laMeta.hop_length / laMeta.sample_rate;
    } catch (_) {}

    const splitTime = Number(frame) * Number(frameHop);

    // Find section index to split
    const sections = analysis.structural_map.sections;
    const secIndex = sections.findIndex(
      (s) =>
        s.time_range && s.time_range.start_time <= splitTime && s.time_range.end_time > splitTime,
    );
    if (secIndex < 0) {
      return { success: false, error: 'No section contains the requested split time' };
    }
    const target = sections[secIndex];
    const start = target.time_range?.start_time ?? 0;
    const end = target.time_range?.end_time ?? start;
    // Prevent splitting exactly on boundaries
    const EPS = 1e-6;
    if (Math.abs(splitTime - start) < EPS || Math.abs(splitTime - end) < EPS) {
      return {
        success: false,
        error: 'Split point is on section boundary; choose a different frame',
      };
    }

    // Create two new sections by cloning and adjusting time_ranges
    const left = JSON.parse(JSON.stringify(target));
    const right = JSON.parse(JSON.stringify(target));
    const timestamp = Date.now();
    left.section_id = `${target.section_id || 'section'}-a-${timestamp}`;
    right.section_id = `${target.section_id || 'section'}-b-${timestamp}`;
    left.section_label = `${target.section_label || target.label || 'Section'} (A)`;
    right.section_label = `${target.section_label || target.label || 'Section'} (B)`;
    left.time_range = { ...(left.time_range || {}), end_time: splitTime };
    right.time_range = { ...(right.time_range || {}), start_time: splitTime };

    // Replace section in structural map
    const newSections = sections.slice();
    newSections.splice(secIndex, 1, left, right);
    analysis.structural_map.sections = newSections;

    // Commit update to DB
    const updateSuccess = db.updateAnalysisById(analysis.id, analysis);
    if (!updateSuccess) {
      logger.error('[architect] forceSplit: Failed to update analysis in DB for id', analysis.id);
      return { success: false, error: 'Failed to persist split to DB' };
    }

    // Clear any preview cache for this analysis
    try {
      const main = require('../main');
      if (main && main.previewAnalysisCache) {
        main.previewAnalysisCache.delete(fileHash);
      }
    } catch (e) {
      // ignore if preview cache not accessible
    }

    // Rebuild block view used by Architect (same logic as ANALYSIS:LOAD_TO_ARCHITECT)
    const blocks = (analysis.structural_map.sections || []).map((section, index) => {
      const duration = section.time_range
        ? section.time_range.end_time - section.time_range.start_time
        : 4; // Default 4 bars
      const bars = Math.max(1, Math.round(duration / 2));

      return {
        id: section.section_id || `section-${index}`,
        name: section.section_label || 'Section',
        label: section.section_label || 'Section',
        length: bars,
        bars: bars,
        section_label: section.section_label,
        section_variant: section.section_variant,
        harmonic_dna: section.harmonic_dna || {},
        rhythmic_dna: section.rhythmic_dna || {},
        time_range: section.time_range,
        probability_score: section.probability_score || 0.5,
        semantic_signature: section.semantic_signature || {},
      };
    });

    // Broadcast updated blocks if main process is present
    try {
      const main = require('../main');
      if (main && main.currentBlocks && main.mainWindow && !main.mainWindow.isDestroyed()) {
        main.currentBlocks = blocks.map(main.ensureBlockData);
        main.mainWindow.webContents.send('UI:BLOCKS_UPDATE', main.currentBlocks);
      }
    } catch (e) {
      // ignore broadcast failures in test context
    }

    logger.info('[architect] forceSplit committed for analysis id', analysis.id);
    return { success: true, insertedFrame: frame, fileHash, blocks };
  } catch (error) {
    logger.error('[architect] forceSplit handler error:', error?.message || error);
    return { success: false, error: error?.message || String(error) };
  }
}

module.exports = { forceSplitHandler };
