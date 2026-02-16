/**
 * Logging utility that respects environment and production logging needs
 */

type LogLevel = 'log' | 'error' | 'warn' | 'info' | 'debug';

/**
 * Development-only logger - only prints in development environment
 */
export const devLog = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

export const devError = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(...args);
  }
};

export const devWarn = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.warn(...args);
  }
};

export const devInfo = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.info(...args);
  }
};

export const devDebug = (...args: any[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.debug(...args);
  }
};

/**
 * Production-aware logger - can log in production when explicitly enabled
 * Use this for critical logs that might be needed in production debugging
 */
export const prodLog = (forceInProduction: boolean = false, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development' || forceInProduction) {
    console.log(...args);
  }
};

export const prodError = (forceInProduction: boolean = true, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development' || forceInProduction) {
    console.error(...args);
  }
};

export const prodWarn = (forceInProduction: boolean = false, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development' || forceInProduction) {
    console.warn(...args);
  }
};

export const prodInfo = (forceInProduction: boolean = false, ...args: any[]) => {
  if (process.env.NODE_ENV === 'development' || forceInProduction) {
    console.info(...args);
  }
};

/**
 * Smart logger with context and level control
 */
export const smartLog = (level: LogLevel, options: {
  forceInProduction?: boolean;
  context?: string;
}, ...args: any[]) => {
  const { forceInProduction = false, context } = options;

  // Skip if not in development and not forced for production
  if (process.env.NODE_ENV !== 'development' && !forceInProduction) {
    return;
  }

  // Add context prefix if provided
  const logArgs = context ? [`[${context}]`, ...args] : args;

  switch (level) {
    case 'log':
      console.log(...logArgs);
      break;
    case 'error':
      console.error(...logArgs);
      break;
    case 'warn':
      console.warn(...logArgs);
      break;
    case 'info':
      console.info(...logArgs);
      break;
    case 'debug':
      console.debug(...logArgs);
      break;
  }
};

/**
 * Specific logging functions for common use cases
 */

// Error logging - usually should log in production too
export const logError = (context: string, ...args: any[]) => {
  smartLog('error', { forceInProduction: true, context }, ...args);
};

// Important info - might be useful in production when explicitly needed
// Usage: logInfo('context', 'message') or logInfo('context', true, 'message')
export const logInfo = (context: string, ...args: any[]) => {
  const forceInProduction = typeof args[0] === 'boolean' ? args.shift() : false;
  smartLog('info', { forceInProduction, context }, ...args);
};

// Debug/development info - only in development
export const logDebug = (context: string, ...args: any[]) => {
  smartLog('debug', { forceInProduction: false, context }, ...args);
};

// General purpose logging - usually development only
export const logMessage = (context: string, ...args: any[]) => {
  const forceInProduction = typeof args[0] === 'boolean' ? args.shift() : false;
  smartLog('log', { forceInProduction, context }, ...args);
};

// Warning logs
export const logWarning = (context: string, ...args: any[]) => {
  const forceInProduction = typeof args[0] === 'boolean' ? args.shift() : false;
  smartLog('warn', { forceInProduction, context }, ...args);
};
