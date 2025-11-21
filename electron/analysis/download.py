#!/usr/bin/env python
import sys
import os
import json
import re
import argparse
from pathlib import Path

def sanitize_filename(name: str) -> str:
    name = name.strip()
    name = re.sub(r"[^a-zA-Z0-9-_\. ]+", "", name)
    name = name.replace(' ', '_')
    return name


def main():
    parser = argparse.ArgumentParser(
        description='Download audio from YouTube and convert to MP3'
    )
    parser.add_argument('url', help='YouTube URL to download')
    parser.add_argument('--outdir', help='Output directory', default=None)
    args = parser.parse_args()
    url = args.url
    outdir = args.outdir

    # Determine an output folder
    if outdir:
        output_dir = Path(outdir)
    else:
        # Use the USER_DATA env variable if provided,
        # otherwise use APPDATA (Windows) or HOME
        user_data = (
            os.environ.get('USER_DATA')
            or os.environ.get('APPDATA')
            or os.path.expanduser('~')
        )
        output_dir = Path(user_data) / 'downloads'
    if not output_dir.exists():
        output_dir.mkdir(parents=True, exist_ok=True)

    # Lazy import yt_dlp to provide helpful error message
    try:
        import yt_dlp
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "error": "yt_dlp_missing",
            "message": str(e),
        }))
        sys.exit(1)

    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': str(output_dir / '%(title)s.%(ext)s'),
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'postprocessor_args': ['-ar', '44100'],
        'prefer_ffmpeg': True,
        # Impersonate Android client (helps bypass YouTube anti-bot checks)
        'extractor_args': {'youtube': {'player_client': ['android']}},
    }

    try:
        # Check ffmpeg available
        import shutil
        if not shutil.which('ffmpeg'):
            print(json.dumps({
                "status": "error",
                "error": "ffmpeg_missing",
                "message": "FFmpeg not found in PATH. Please install FFmpeg."
            }))
            sys.exit(4)

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'download')
            sanitized = sanitize_filename(title)
            # Use a custom template to enforce sanitized filename
            ydl_opts['outtmpl'] = str(output_dir / (sanitized + '.%(ext)s'))
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "error": "url_extract_failed",
            "message": str(e),
        }))
        sys.exit(2)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.extract_info(url, download=True)
            # Find the mp3 file in output directory
            # yt-dlp will write to 'sanitized.mp3'
            file_path = str(output_dir / (sanitized + '.mp3'))
            out = {"status": "success", "path": file_path, "title": title}
            print(json.dumps(out))
            sys.stdout.flush()
            return 0
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "error": "download_failed",
            "message": str(e),
        }))
        sys.exit(3)


if __name__ == '__main__':
    sys.exit(main())
