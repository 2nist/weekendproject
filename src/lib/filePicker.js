// Portable showOpenDialog helper
// Uses Electron's `window.electronAPI.showOpenDialog` when available,
// otherwise falls back to a browser file input picker for development in a browser.
async function showOpenDialog(options = {}) {
  try {
    if (
      typeof window !== 'undefined' &&
      window.electronAPI &&
      typeof window.electronAPI.showOpenDialog === 'function'
    ) {
      const res = await window.electronAPI.showOpenDialog(options);
      // If the Electron handler returned a usable result, return it.
      if (res && (res.canceled !== undefined || (res.filePaths && res.filePaths.length >= 0))) {
        return res;
      }
      // Otherwise fall through to the browser fallback
    }
  } catch (e) {
    // fallthrough to browser fallback
  }

  // Browser fallback: create a hidden input element to prompt file selection.
  return await new Promise((resolve) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';

      // Map properties (best-effort)
      if (options.properties && Array.isArray(options.properties)) {
        if (options.properties.includes('openDirectory')) {
          input.webkitdirectory = true;
          input.directory = true;
        }
        if (options.properties.includes('multiSelections')) {
          input.multiple = true;
        }
      }

      // Note: browser cannot apply platform-level filters in a reliable cross-browser way.
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);
        // Provide both file list and file names as a minimal compatibility layer
        const filePaths = files.map((f) => f.name);
        resolve({ canceled: files.length === 0, filePaths, files });
        setTimeout(() => {
          try {
            document.body.removeChild(input);
          } catch (e) {}
        }, 50);
      });

      // Trigger the file picker
      input.click();
    } catch (err) {
      resolve({ canceled: true, filePaths: [] });
    }
  });
}

export default showOpenDialog;
