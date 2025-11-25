export interface AudioExtensionOptions {
  filePath?: string | null;
  metadataExtension?: string | null;
  defaultExtension?: string;
}

const DEFAULT_EXTENSION = '.mp3';

function normalizeExtension(ext?: string | null, fallback: string = DEFAULT_EXTENSION): string {
  if (!ext) {
    return fallback;
  }
  const trimmed = ext.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.startsWith('.')) {
    return trimmed.toLowerCase();
  }
  return `.${trimmed.toLowerCase()}`;
}

function extractExtensionFromPath(filePath?: string | null): string | undefined {
  if (!filePath) {
    return undefined;
  }
  const sanitized = filePath.split('?')[0] || '';
  const match = sanitized.match(/\.([a-z0-9]+)$/i);
  if (!match) {
    return undefined;
  }
  return normalizeExtension(match[0]);
}

export function determineAudioExtension(options: AudioExtensionOptions = {}): string {
  const { filePath, metadataExtension, defaultExtension = DEFAULT_EXTENSION } = options;
  const fromPath = extractExtensionFromPath(filePath);
  if (fromPath) {
    return fromPath;
  }
  if (metadataExtension) {
    return normalizeExtension(metadataExtension, defaultExtension);
  }
  return normalizeExtension(defaultExtension, DEFAULT_EXTENSION);
}

export function buildAppProtocolUrl(
  hash?: string,
  options: AudioExtensionOptions = {},
): string | undefined {
  if (!hash) {
    return undefined;
  }
  const extension = determineAudioExtension(options);
  return `app://${hash}${extension}`;
}
