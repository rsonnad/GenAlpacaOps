/**
 * Date Utilities - Shared date formatting functions
 *
 * Usage:
 *   import { formatDate, formatDateTime, formatRelative } from '../shared/date-utils.js';
 */

/**
 * Format date as "Mon D" or "Mon D, YYYY" (e.g., "Jan 15" or "Jan 15, 2024")
 * @param {Date|string|null} date - Date to format
 * @param {boolean} includeYear - Include year in output
 * @returns {string|null} Formatted date or null
 */
export function formatDate(date, includeYear = false) {
  if (!date) return null;

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;

  const options = includeYear
    ? { month: 'short', day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric' };

  return d.toLocaleDateString('en-US', options);
}

/**
 * Format date with time (e.g., "Jan 15, 2024, 2:30 PM")
 * @param {Date|string|null} date - Date to format
 * @returns {string|null} Formatted date and time or null
 */
export function formatDateTime(date) {
  if (!date) return null;

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;

  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format date as full date (e.g., "January 15, 2024")
 * @param {Date|string|null} date - Date to format
 * @returns {string|null} Formatted date or null
 */
export function formatDateLong(date) {
  if (!date) return null;

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;

  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format relative time (e.g., "2 days ago", "in 3 hours")
 * @param {Date|string|null} date - Date to compare
 * @returns {string|null} Relative time string or null
 */
export function formatRelative(date) {
  if (!date) return null;

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;

  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / (1000 * 60));
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(diffMins) < 60) {
    if (diffMins === 0) return 'just now';
    if (diffMins > 0) return `in ${diffMins}m`;
    return `${Math.abs(diffMins)}m ago`;
  }

  if (Math.abs(diffHours) < 24) {
    if (diffHours > 0) return `in ${diffHours}h`;
    return `${Math.abs(diffHours)}h ago`;
  }

  if (Math.abs(diffDays) < 30) {
    if (diffDays > 0) return `in ${diffDays}d`;
    return `${Math.abs(diffDays)}d ago`;
  }

  // Fall back to formatted date
  return formatDate(d, true);
}

/**
 * Get today's date at midnight
 * @returns {Date} Today at 00:00:00
 */
export function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Check if a date is in the past
 * @param {Date|string|null} date - Date to check
 * @returns {boolean} True if date is before today
 */
export function isPast(date) {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  return d < getToday();
}

/**
 * Check if a date is in the future
 * @param {Date|string|null} date - Date to check
 * @returns {boolean} True if date is after today
 */
export function isFuture(date) {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  return d > getToday();
}

/**
 * Check if a date is today
 * @param {Date|string|null} date - Date to check
 * @returns {boolean} True if date is today
 */
export function isToday(date) {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  const today = getToday();
  return d.toDateString() === today.toDateString();
}

/**
 * Add days to a date
 * @param {Date|string} date - Starting date
 * @param {number} days - Number of days to add (can be negative)
 * @returns {Date} New date
 */
export function addDays(date, days) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export default {
  formatDate,
  formatDateTime,
  formatDateLong,
  formatRelative,
  getToday,
  isPast,
  isFuture,
  isToday,
  addDays,
};
