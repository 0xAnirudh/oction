const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function emit(level, message, fields) {
  if (LEVELS[level] < threshold) return;
  const line = { t: new Date().toISOString(), level, message, ...fields };
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  stream(JSON.stringify(line));
}

export const log = {
  debug: (m, f) => emit('debug', m, f),
  info: (m, f) => emit('info', m, f),
  warn: (m, f) => emit('warn', m, f),
  error: (m, f) => emit('error', m, f),
};
