/**
 * Logger - Conditional logging utility
 *
 * Debug logs are only shown when:
 * - Running on localhost
 * - Or when ?debug=true is in the URL
 *
 * Usage:
 *   import { log } from '../shared/logger.js';
 *   log.debug('Debug info:', data);  // Only shown in dev
 *   log.info('Info message');        // Always shown
 *   log.warn('Warning');             // Always shown
 *   log.error('Error:', err);        // Always shown
 */

const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const hasDebugParam = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('debug') === 'true';

const DEBUG_ENABLED = isLocalhost || hasDebugParam;

export const log = {
  /**
   * Debug level - only shown in development
   */
  debug: (...args) => {
    if (DEBUG_ENABLED) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info level - always shown
   */
  info: (...args) => {
    console.log('[INFO]', ...args);
  },

  /**
   * Warning level - always shown
   */
  warn: (...args) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Error level - always shown
   */
  error: (...args) => {
    console.error('[ERROR]', ...args);
  },

  /**
   * Check if debug logging is enabled
   */
  isDebugEnabled: () => DEBUG_ENABLED,
};

export default log;
