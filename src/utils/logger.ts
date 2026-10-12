import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();
const LOG_KEY = 'app_logs';
const MAX_LOGS = 1000;
const MAX_MSG_LEN = 2000;

function timestamp(): string {
  return new Date().toISOString();
}

function formatLogArgument(value: unknown): string {
  if (value instanceof Error) {
    const errorWithCause = value as Error & { cause?: unknown };
    const cause =
      errorWithCause.cause == null ? '' : ` cause=${formatLogArgument(errorWithCause.cause)}`;
    return `${value.name}: ${value.message}${cause}${value.stack ? `\n${value.stack}` : ''}`;
  }
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function addLog(level: string, ...args: unknown[]) {
  const msg = args.map(formatLogArgument).join(' ').slice(0, MAX_MSG_LEN);

  const logs = getLogs();
  logs.push(`[${timestamp()}] ${level}: ${msg}`);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  storage.set(LOG_KEY, JSON.stringify(logs));
}

export function getLogs(): string[] {
  try {
    const data = storage.getString(LOG_KEY);
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function clearLogs() {
  storage.delete(LOG_KEY);
}

// 拦截全局错误
const origHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  addLog(isFatal ? 'FATAL' : 'ERROR', error?.message || error);
  origHandler?.(error, isFatal);
});

// 拦截 console.error / console.warn
const origError = console.error;
const origWarn = console.warn;
console.error = (...args: unknown[]) => {
  addLog('ERROR', ...args);
  origError(...args);
};
console.warn = (...args: unknown[]) => {
  addLog('WARN', ...args);
  origWarn(...args);
};
