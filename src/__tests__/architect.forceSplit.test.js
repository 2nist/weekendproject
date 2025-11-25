import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';

// Import DB module and handler module
const db = require('../../electron/db');
const { forceSplitHandler } = require('../../electron/handlers/architect');

describe('ARCHITECT:FORCE_SPLIT handler', () => {
  beforeEach(async () => {
    // Init DB in tmp dir
    const userDataDir = path.join(os.tmpdir(), `prog-test-db-${Date.now()}`);
    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
    // lightweight init
    await db.init({ getPath: () => userDataDir });
  });

  it('splits a section by frame and persists to DB', async () => {
    const file_hash = `test-hash-${Date.now()}`;
    const analysisData = {
      file_path: '/tmp/fake.wav',
      file_hash,
      metadata: { frame_hop_seconds: 0.1 },
      linear_analysis: { metadata: { frame_hop_seconds: 0.1 }, events: [] },
      structural_map: {
        sections: [
          {
            section_id: 's1',
            section_label: 'All',
            time_range: { start_time: 0, end_time: 10 },
            harmonic_dna: {},
          },
        ],
      },
      arrangement_flow: {},
      harmonic_context: {},
      polyrhythmic_layers: [],
    };

    const analysisId = db.saveAnalysis(analysisData);
    expect(analysisId).toBeTruthy();

    // Use frame = 50 (frameHop=0.1 => 5s) to split in the middle
    const res = await forceSplitHandler({ frame: 50, fileHash: file_hash });
    expect(res.success).toBeTruthy();
    expect(res.blocks).toBeTruthy();
    expect(res.blocks.length).toBe(2);

    const updated = db.getAnalysis(file_hash);
    expect(updated.structural_map.sections.length).toBe(2);
    const left = updated.structural_map.sections[0];
    const right = updated.structural_map.sections[1];
    expect(left.time_range.end_time).toBeCloseTo(5, 3);
    expect(right.time_range.start_time).toBeCloseTo(5, 3);
  });
});
