const MAX_LOGS = 100;
const logs: string[] = [];

function timestamp(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

export function addLog(level: string, ...args: any[]) {
  const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
  logs.push(`[${timestamp()}] ${level}: ${msg}`);
  if (logs.length > MAX_LOGS) logs.shift();
}

export function getLogs(): string[] {
  return [...logs];
}

export function clearLogs() {
  logs.length = 0;
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
