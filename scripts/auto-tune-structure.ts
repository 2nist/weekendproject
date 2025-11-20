import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.resolve(ROOT, 'electron', 'analysis', 'audioAnalyzerConfig.json');

interface TuningRule {
  condition: (metrics: any) => boolean;
  action: (config: any) => void;
  description: string;
}

const tuningRules: TuningRule[] = [
  {
    condition: (m) => m.fragmentationIndex > 1.5,
    action: (config) => {
      // Over-segmentation: increase thresholds
      config.novelty_threshold = Math.min((config.novelty_threshold || 0.2) * 1.2, 0.5);
      console.log(`  → Increased novelty_threshold to ${config.novelty_threshold.toFixed(3)}`);
    },
    description: 'Over-segmentation detected',
  },
  {
    condition: (m) => m.fragmentationIndex < 0.5 && m.detectedCount < 3,
    action: (config) => {
      // Under-segmentation: decrease threshold
      config.novelty_threshold = Math.max((config.novelty_threshold || 0.2) * 0.8, 0.05);
      console.log(`  → Decreased novelty_threshold to ${config.novelty_threshold.toFixed(3)}`);
    },
    description: 'Under-segmentation detected',
  },
  {
    condition: (m) => m.ghosts > m.hits * 1.5,
    action: (config) => {
      // Too many false positives: increase threshold
      config.novelty_threshold = Math.min((config.novelty_threshold || 0.2) * 1.15, 0.5);
      console.log(`  → Increased novelty_threshold to ${config.novelty_threshold.toFixed(3)} (reduce false positives)`);
    },
    description: 'High false positive rate',
  },
  {
    condition: (m) => m.misses > m.hits * 2,
    action: (config) => {
      // Too many misses: decrease threshold
      config.novelty_threshold = Math.max((config.novelty_threshold || 0.2) * 0.85, 0.05);
      console.log(`  → Decreased novelty_threshold to ${config.novelty_threshold.toFixed(3)} (improve recall)`);
    },
    description: 'High miss rate',
  },
];

function loadConfig(): any {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load config:', error);
    return {
      novelty_threshold: 0.2,
      chroma_smoothing_window: 2,
      bass_weight: 2.3,
    };
  }
}

function saveConfig(config: any): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    console.log(`✓ Config saved to ${CONFIG_PATH}`);
  } catch (error) {
    console.error('Failed to save config:', error);
    throw error;
  }
}

function parseStructureTestOutput(output: string): any[] {
  const results: any[] = [];
  const lines = output.split('\n');
  
  let inTable = false;
  for (const line of lines) {
    if (line.includes('SONG') && line.includes('F-SCORE')) {
      inTable = true;
      continue;
    }
    if (line.includes('---')) {
      if (inTable) continue;
      else break;
    }
    if (inTable && line.includes('|')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 4) {
        const title = parts[0];
        const fScore = parseFloat(parts[1]);
        const fragIndex = parseFloat(parts[2]);
        const status = parts[3];
        
        if (!isNaN(fScore) && !isNaN(fragIndex)) {
          // Extract detailed metrics from breakdown section
          const titleLower = title.toLowerCase();
          let hits = 0, misses = 0, ghosts = 0, detectedCount = 0, groundTruthCount = 0;
          
          // Try to find detailed breakdown
          const breakdownStart = output.indexOf('DETAILED BREAKDOWN');
          if (breakdownStart > 0) {
            const breakdownSection = output.substring(breakdownStart);
            const titleMatch = breakdownSection.match(new RegExp(`${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'i'));
            if (titleMatch) {
              const section = breakdownSection.substring(titleMatch.index || 0);
              const hitsMatch = section.match(/(\d+)\s+hits/);
              const missesMatch = section.match(/(\d+)\s+misses/);
              const ghostsMatch = section.match(/(\d+)\s+ghosts/);
              const fragMatch = section.match(/(\d+)\s+detected\s+\/\s+(\d+)\s+expected/);
              
              if (hitsMatch) hits = parseInt(hitsMatch[1]);
              if (missesMatch) misses = parseInt(missesMatch[1]);
              if (ghostsMatch) ghosts = parseInt(ghostsMatch[1]);
              if (fragMatch) {
                detectedCount = parseInt(fragMatch[1]);
                groundTruthCount = parseInt(fragMatch[2]);
              }
            }
          }
          
          results.push({
            title,
            fScore,
            fragmentationIndex: fragIndex,
            status,
            hits,
            misses,
            ghosts,
            detectedCount,
            groundTruthCount,
          });
        }
      }
    }
  }
  
  return results;
}

async function autoTune(): Promise<void> {
  console.log('Auto-Tuning Structure Detection Parameters');
  console.log('='.repeat(80));
  console.log('');

  // Load current config
  const config = loadConfig();
  console.log('Current configuration:');
  console.log(`  novelty_threshold: ${config.novelty_threshold || 0.2}`);
  console.log('');

  // Run structure test
  console.log('Running structure test...');
  let testOutput = '';
  try {
    testOutput = execSync('npm run test:structure', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    }).toString();
    console.log('✓ Structure test completed');
  } catch (error: any) {
    testOutput = error.stdout?.toString() || '';
    if (!testOutput) {
      console.error('Failed to run structure test:', error.message);
      return;
    }
  }

  // Parse results
  const results = parseStructureTestOutput(testOutput);
  if (results.length === 0) {
    console.log('No results found in test output. Trying to read from report file...');
    const reportPath = path.resolve(ROOT, 'benchmarks', 'results', 'structure-test-report.txt');
    if (fs.existsSync(reportPath)) {
      const reportContent = fs.readFileSync(reportPath, 'utf8');
      const reportResults = parseStructureTestOutput(reportContent);
      results.push(...reportResults);
    }
  }

  if (results.length === 0) {
    console.error('Could not parse test results. Please run test:structure manually first.');
    return;
  }

  console.log(`\nAnalyzing ${results.length} test results...`);
  console.log('');

  // Calculate aggregate metrics
  const avgFragIndex = results.reduce((sum, r) => sum + r.fragmentationIndex, 0) / results.length;
  const avgFScore = results.reduce((sum, r) => sum + r.fScore, 0) / results.length;
  const totalHits = results.reduce((sum, r) => sum + r.hits, 0);
  const totalMisses = results.reduce((sum, r) => sum + r.misses, 0);
  const totalGhosts = results.reduce((sum, r) => sum + r.ghosts, 0);

  console.log('Aggregate Metrics:');
  console.log(`  Average F-Score: ${avgFScore.toFixed(3)}`);
  console.log(`  Average Fragmentation Index: ${avgFragIndex.toFixed(2)}`);
  console.log(`  Total: ${totalHits} hits, ${totalMisses} misses, ${totalGhosts} ghosts`);
  console.log('');

  // Apply tuning rules
  let configChanged = false;
  const appliedRules: string[] = [];

  for (const rule of tuningRules) {
    // Check if rule applies to any result
    const applicableResults = results.filter(rule.condition);
    if (applicableResults.length > 0) {
      console.log(`Applying rule: ${rule.description} (${applicableResults.length} songs affected)`);
      rule.action(config);
      configChanged = true;
      appliedRules.push(rule.description);
    }
  }

  if (!configChanged) {
    console.log('No tuning rules applied. Current configuration appears optimal.');
    return;
  }

  console.log('');
  console.log('Applied tuning rules:');
  appliedRules.forEach(rule => console.log(`  - ${rule}`));
  console.log('');

  // Save updated config
  saveConfig(config);

  console.log('');
  console.log('Next steps:');
  console.log('  1. Run "npm run test:structure" again to verify improvements');
  console.log('  2. If results improved, commit the new configuration');
  console.log('  3. If results worsened, revert: git checkout electron/analysis/audioAnalyzerConfig.json');
}

if (require.main === module) {
  autoTune().catch((error) => {
    console.error('Auto-tuning failed:', error);
    process.exit(1);
  });
}

export { autoTune };

