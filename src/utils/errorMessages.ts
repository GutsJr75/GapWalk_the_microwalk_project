/**
 * Converts technical error messages into human-readable text
 * so users can understand what went wrong without technical knowledge.
 */
export function toUserFriendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  // Database / storage errors
  if (lower.includes('sqlite3_open') || lower.includes('cannot create file') || lower.includes('getdirectory')) {
    return 'The app could not access local storage. On web, try a different browser (Firefox or Safari) or use the app on your phone.';
  }
  if (lower.includes("reading 'decode'") || lower.includes('undefined') && lower.includes('decode')) {
    return 'A storage compatibility issue occurred. Try refreshing the page or use the app on your phone.';
  }
  if (lower.includes('sqlite') || lower.includes('database') || lower.includes('disk') || lower.includes('quota')) {
    return 'Storage is full or the app data could not be saved. Try freeing up space on your device and try again.';
  }
  if (lower.includes('locked') || lower.includes('busy')) {
    return 'The app is busy saving data. Please wait a moment and try again.';
  }
  if (lower.includes('constraint') || lower.includes('unique') || lower.includes('primary key')) {
    return 'This item already exists. Please refresh and try again.';
  }
  if (lower.includes('no such table') || lower.includes('table') && lower.includes('not found')) {
    return 'App data may be corrupted. Try closing and reopening the app, or reinstalling if the problem continues.';
  }

  // Network errors
  if (lower.includes('network') || lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('fetch')) {
    return 'Unable to connect. Check your internet connection and try again.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'The request took too long. Check your connection and try again.';
  }
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('session expired')) {
    return 'Your session has expired. Please sign in again.';
  }
  if (lower.includes('403') || lower.includes('forbidden')) {
    return 'You don\'t have permission to do this. Please sign in with the correct account.';
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return 'The requested item was not found. It may have been removed.';
  }
  if (lower.includes('500') || lower.includes('server error')) {
    return 'Something went wrong on our end. Please try again in a few minutes.';
  }

  // File / import errors
  if (lower.includes('could not read') || lower.includes('file') && lower.includes('empty')) {
    return 'The file could not be read or is empty. Choose a different file.';
  }
  if (lower.includes('ics') || lower.includes('calendar') && (lower.includes('parse') || lower.includes('invalid'))) {
    return 'The calendar file format is invalid. Make sure you selected a valid .ics file.';
  }
  if (lower.includes('failed to parse') || lower.includes('parse error')) {
    return 'The file could not be read correctly. Some events may have been skipped. Try a different calendar file.';
  }
  if (lower.includes('permission') || lower.includes('denied') || lower.includes('access')) {
    return 'Permission was denied. Please allow access when prompted.';
  }

  // Generic fallbacks for common patterns
  if (lower.includes('undefined') || lower.includes('null') || lower.includes('cannot read')) {
    return 'Something went wrong. Please try again.';
  }
  if (raw.length > 80 || /^[A-Z_]+$/.test(raw) || raw.includes('Error:')) {
    return 'Something went wrong. Please try again. If the problem continues, try restarting the app.';
  }

  // If the message is already short and readable, use it (but sanitize)
  if (raw.length <= 60 && !raw.includes('Error') && !raw.includes('Exception')) {
    return raw;
  }

  return 'Something went wrong. Please try again.';
}
