/**
 * Structured logging module for the workout planner application
 *
 * Levels: debug, info, warn, error
 * Format: [TIMESTAMP] [LEVEL] [CONTEXT] message
 */

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',

  // Level colors
  debug: '\x1b[36m',   // cyan
  info: '\x1b[32m',    // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red

  // Context colors
  http: '\x1b[35m',    // magenta
  session: '\x1b[34m', // blue
  set: '\x1b[36m',     // cyan
  db: '\x1b[33m',      // yellow
  claude: '\x1b[95m',  // bright magenta
  validation: '\x1b[94m', // bright blue
  progression: '\x1b[92m', // bright green
};

// Log level priority
const levels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get log level from environment, default to 'info'
const currentLevel = levels[process.env.LOG_LEVEL?.toLowerCase()] ?? levels.info;

/**
 * Format timestamp for log output
 */
function timestamp() {
  const now = new Date();
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Format data for log output (truncates long data)
 */
function formatData(data, maxLength = 200) {
  if (data === undefined) return '';

  let str;
  if (data instanceof Error) {
    str = data.stack || data.message;
  } else if (typeof data === 'object') {
    try {
      str = JSON.stringify(data);
    } catch {
      str = String(data);
    }
  } else {
    str = String(data);
  }

  if (str.length > maxLength) {
    return str.slice(0, maxLength) + '...';
  }
  return str;
}

/**
 * Core logging function
 */
function log(level, context, message, data) {
  if (levels[level] < currentLevel) return;

  const levelColor = colors[level] || colors.reset;
  const contextColor = colors[context.toLowerCase()] || colors.dim;

  const parts = [
    `${colors.dim}[${timestamp()}]${colors.reset}`,
    `${levelColor}[${level.toUpperCase()}]${colors.reset}`,
    `${contextColor}[${context.toUpperCase()}]${colors.reset}`,
    message,
  ];

  if (data !== undefined) {
    parts.push(colors.dim + formatData(data) + colors.reset);
  }

  const logFn = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.log);
  logFn(parts.join(' '));
}

/**
 * Logger interface
 */
const logger = {
  debug: (context, message, data) => log('debug', context, message, data),
  info: (context, message, data) => log('info', context, message, data),
  warn: (context, message, data) => log('warn', context, message, data),
  error: (context, message, data) => log('error', context, message, data),

  /**
   * HTTP request logging helper
   */
  request: (req, res, duration) => {
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : (status >= 400 ? 'warn' : 'info');
    const method = req.method;
    const path = req.originalUrl || req.url;
    const durationStr = duration ? ` (${duration}ms)` : '';

    log(level, 'HTTP', `${method} ${path} → ${status}${durationStr}`);
  },

  /**
   * Database operation logging helper
   */
  db: (operation, table, data) => {
    log('debug', 'DB', `${operation} ${table}`, data);
  },

  /**
   * Session lifecycle logging
   */
  session: {
    start: (sessionId, week, day) => {
      log('info', 'SESSION', `Started session #${sessionId} (W${week}D${day})`);
    },
    finish: (sessionId, duration) => {
      const durationStr = duration ? ` (duration: ${duration})` : '';
      log('info', 'SESSION', `Finished session #${sessionId}${durationStr}`);
    },
    active: (sessionId, week, day) => {
      log('debug', 'SESSION', `Active session #${sessionId} (W${week}D${day})`);
    },
    notFound: (sessionId) => {
      log('warn', 'SESSION', `Session #${sessionId} not found`);
    },
  },

  /**
   * Set logging helper
   */
  set: (exerciseName, weight, reps, rpe) => {
    const rpeStr = rpe ? ` @ RPE ${rpe}` : '';
    log('info', 'SET', `${exerciseName}: ${weight}kg x ${reps}${rpeStr}`);
  },

  /**
   * Claude API logging
   */
  claude: {
    calling: (purpose, data) => {
      log('info', 'CLAUDE', `Calling API for ${purpose}...`, data);
    },
    response: (duration, tokens) => {
      const tokensStr = tokens ? `, ${tokens} tokens` : '';
      log('info', 'CLAUDE', `Response received (${duration}s${tokensStr})`);
    },
    error: (error, context) => {
      log('error', 'CLAUDE', `API error: ${error.message}`, context);
    },
    parsing: (success, detail) => {
      if (success) {
        log('debug', 'CLAUDE', 'JSON parsed successfully', detail);
      } else {
        log('warn', 'CLAUDE', 'JSON parsing failed', detail);
      }
    },
  },

  /**
   * Validation logging
   */
  validation: {
    approved: (exercise, setType, weight) => {
      log('info', 'VALIDATION', `${exercise} ${setType}: ${weight}kg (approved)`);
    },
    corrected: (exercise, setType, original, corrected, reason) => {
      log('warn', 'VALIDATION', `${exercise} ${setType}: ${original}kg → ${corrected}kg (${reason})`);
    },
    skipped: (exercise, reason) => {
      log('debug', 'VALIDATION', `${exercise}: skipped (${reason})`);
    },
  },

  /**
   * Progression logging
   */
  progression: {
    saved: (exercise, week, day, weights) => {
      const weightStr = Object.entries(weights)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `${k}=${v}kg`)
        .join(' ');
      log('info', 'PROGRESSION', `Saved: ${exercise} W${week}D${day} ${weightStr}`);
    },
    notFound: (exercise) => {
      log('warn', 'PROGRESSION', `Exercise not found: ${exercise}`);
    },
    noData: (exercise, week, day) => {
      log('debug', 'PROGRESSION', `No valid weights for ${exercise} W${week}D${day}`);
    },
  },
};

export default logger;
