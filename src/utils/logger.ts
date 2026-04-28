import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();
const LOG_KEY = 'app_logs';
const MAX_LOGS = 200;
const MAX_MSG_LEN = 500;

function timestamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

export function addLog(level: string, ...args: any[]) {
  const msg = args.map(a => {
    if (typeof a === 'object') {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(' ').slice(0, MAX_MSG_LEN);

  const logs = getLogs();
  logs.push(`[${timestamp()}] ${level}: ${msg}`);
  if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
  storage.set(LOG_KEY, JSON.stringify(logs));
}

export function getLogs(): string[] {
  try {
    const data = storage.getString(LOG_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
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
console.error = (...args: any[]) => { addLog('ERROR', ...args); origError(...args); };
console.warn = (...args: any[]) => { addLog('WARN', ...args); origWarn(...args); };
