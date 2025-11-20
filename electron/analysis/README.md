# Downloader Requirements

This folder contains Python scripts used by the app to process audio.

Requirements for the YouTube downloader feature:

- Python 3.8+ with `yt-dlp` installed:
  - pip install yt-dlp
- FFmpeg installed and available in PATH:
  - Windows: https://ffmpeg.org/download.html
  - macOS: brew install ffmpeg
  - Linux: apt install ffmpeg

The downloader script is `download.py` and expects a single CLI argument (the YouTube URL).
It will write an MP3 file (192kbps) to the user data downloads directory and print a JSON object to stdout describing status.

The Electron bridge `electron/bridges/downloader.js` will spawn this script and return a structured result to the renderer.

If you run into errors, ensure `python -c "import yt_dlp"` succeeds and `ffmpeg -version` prints a version.
