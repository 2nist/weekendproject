const isDev =
  typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production';

export function debug(...args: any[]) {
  if (isDev) console.debug('[DEBUG]', ...args);
}

export function info(...args: any[]) {
  console.info('[INFO]', ...args);
}

export function warn(...args: any[]) {
  console.warn('[WARN]', ...args);
}

export function error(...args: any[]) {
  console.error('[ERROR]', ...args);
}

export default { debug, info, warn, error };
