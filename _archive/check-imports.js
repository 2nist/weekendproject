const fs = require('fs');
const path = require('path');

function ensureExported(filePath, exportsToCheck = []) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const compact = content.replace(/\s+/g, ' ');
    for (const e of exportsToCheck) {
      if (e.type === 'default') {
        if (
          !/export\s+default\s+/.test(content) &&
          !compact.includes('export default ')
        ) {
          console.error(`Missing default export in ${filePath}`);
          return false;
        }
      }
      if (e.type === 'named') {
        const regex = new RegExp(`export\\s+\\{\\s*${e.name}\\s*\\}`);
        if (
          !regex.test(content) &&
          !compact.includes(`export { ${e.name} }`) &&
          !compact.includes(`export{${e.name}}`) &&
          !new RegExp(`export\\s+const\\s+${e.name}`).test(content) &&
          !new RegExp(`export\\s+function\\s+${e.name}`).test(content) &&
          !new RegExp(`const\\s+${e.name}\\s*=\\s`).test(content)
        ) {
          console.error(`Missing named export '${e.name}' in ${filePath}`);
          return false;
        }
      }
    }
    return true;
  } catch (err) {
    console.error('Error reading', filePath, err.message);
    return false;
  }
}

function run() {
  const repoRoot = path.resolve(__dirname, '..');
  const uiButton = path.join(repoRoot, 'src', 'components', 'ui', 'button.jsx');

  let ok = ensureExported(uiButton, [
    { type: 'default' },
    { type: 'named', name: 'Button' },
  ]);

  if (!ok) {
    console.error(
      'UI import checks failed. Please ensure `button.jsx` exports both `default` and `Button`.',
    );
    process.exit(1);
  }

  console.log('UI import checks: OK');
}

run();
