const fs = require('fs');
const path = require('path');
const listener = require('../electron/analysis/listener');
const architect = require('../electron/analysis/architect_clean');

const TEST_DIR = path.resolve(__dirname, '../electron/analysis/test');
const REPORT_PATH = path.resolve(
  __dirname,
  '../benchmarks/results/debug_report.html',
);

async function run() {
  const songName = process.argv[2] || '13 A Day In The Life';
  console.log(`Debugging: ${songName}...`);

  const files = fs.readdirSync(TEST_DIR);
  const audioFile = files.find(
    (f) => f.includes(songName) && f.endsWith('.mp3'),
  );
  const labelFile = files.find(
    (f) => f.includes(songName) && (f.endsWith('.lab') || f.endsWith('.txt')),
  );

  if (!audioFile) {
    console.error('Audio file not found!');
    return;
  }

  console.log('   Running Python DSP...');
  const analysisWrap = await listener.analyzeAudio(
    path.join(TEST_DIR, audioFile),
  );
  if (!analysisWrap || !analysisWrap.linear_analysis) {
    console.error('Analysis failed');
    return;
  }
  const linear = analysisWrap.linear_analysis;

  console.log('   Running Architect...');
  const structure = await architect.analyzeStructure(linear);

  let truthSecs = [];
  if (labelFile) {
    const content = fs.readFileSync(path.join(TEST_DIR, labelFile), 'utf8');
    truthSecs = content
      .split('\n')
      .map((l) => parseFloat(l.split(/\s+/)[0]))
      .filter((n) => !isNaN(n));
  }

  const html = generateHTML(
    songName,
    structure.debug || {},
    structure.sections || [],
    truthSecs,
  );
  fs.writeFileSync(REPORT_PATH, html);
  console.log(`\nReport generated: ${REPORT_PATH}`);
}

function generateHTML(title, debug, sections, truth) {
  const curve = debug.noveltyCurve || [];
  const hop = debug.frame_hop || 0.1;
  const labels = curve.map((_, i) => (i * hop).toFixed(1));
  const threshLine = new Array(curve.length).fill(debug.threshold || 0);

  const peaksIdx = debug.peaks || [];
  const peaks = curve.map((v, i) => (peaksIdx.includes(i) ? v : null));

  const sectionLines = sections.map((s) => s.time_range.start_time);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Structure Debug: ${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>body{font-family:sans-serif;padding:20px;background:#f0f0f0} .panel{background:#fff;padding:20px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}</style>
</head>
<body>
  <h2>Structure Analysis: ${title}</h2>
  <div class="panel">
    <canvas id="chart" height="120"></canvas>
  </div>
  <div style="margin-top:12px; font-size: small; color: #333">Blue: novelty curve • Red: threshold • Green: detected peaks • Colored bins: sections</div>
  <script>
    const ctx = document.getElementById('chart').getContext('2d');
    const data = {
      labels: ${JSON.stringify(labels)},
      datasets: [
        { label: 'Novelty Curve', data: ${JSON.stringify(curve)}, borderColor: 'rgba(54,162,235,1)', borderWidth: 1, pointRadius: 0, fill: false },
        { label: 'Threshold', data: ${JSON.stringify(threshLine)}, borderColor: 'rgba(255,99,132,1)', borderWidth: 1, pointRadius: 0, borderDash: [6,6], fill: false },
        { label: 'Peaks', data: ${JSON.stringify(peaks)}, borderColor: 'rgba(75,192,192,1)', pointRadius: 3, showLine: false }
      ]
    };

    const chart = new Chart(ctx, {
      type: 'line',
      data: data,
      options: { elements: { point: { radius: 0 } }, responsive: true, maintainAspectRatio: false }
    });

    // Add vertical lines for ground truth and detected sections
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.height = '50px';
    container.style.background = '#eee';
    container.style.marginTop = '12px';

    const curveLen = ${curve.length};
    const totalSec = (curveLen * ${hop});

    function addLine(atSec, color, top) {
      const div = document.createElement('div');
      const left = Math.min(100, Math.max(0, (atSec / totalSec) * 100));
      div.style.position = 'absolute';
      div.style.left = left + '%';
      div.style.top = top + '%';
      div.style.width = '2px';
      div.style.height = '50%';
      div.style.background = color;
      container.appendChild(div);
    }

    // Detected section starts (blue)
    ${JSON.stringify(sections)}.forEach(s => addLine(s.time_range.start_time, 'blue', 0));
    // Ground truth (green)
    ${JSON.stringify(truth)}.forEach(t => addLine(t, 'green', 50));

    document.body.appendChild(container);
  </script>
</body>
</html>`;
}

run().catch((err) => console.error('Error:', err));
