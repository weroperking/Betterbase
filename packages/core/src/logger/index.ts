/**
 * Structured Logging Module
 * 
 * Provides application-wide logging with:
 * - Structured JSON logs
 * - Log levels (debug, info, warn, error)
 * - Request ID tracking
 * - Pretty dev mode, JSON production mode
 * - File rotation (production only)
 * 
 * Usage:
 *   import { logger } from './logger';
 *   logger.info({ msg: "User action", userId: "123" });
 */

import pino from 'pino';
import { nanoid } from 'nanoid';
import { setupFileLogging } from './file-transport';

/**
 * Determine environment
 */
const isDev = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDev ? 'debug' : 'info');

// Initialize logger based on environment
let loggerInstance: pino.Logger;

if (isDev) {
  try {
    loggerInstance = pino({
      level: logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      },
    });
  } catch {
    loggerInstance = pino({ level: logLevel });
  }
} else {
  // Production: JSON to console + file
  loggerInstance = pino({
    level: logLevel,
  });
}

/**
 * Main application logger
 * 
 * Development mode:
 * - Uses pino-pretty for colored, readable output
 * - Shows timestamp, level, message
 * - Hides pid and hostname (noise reduction)
 * 
 * Production mode:
 * - Outputs structured JSON
 * - Includes all metadata
 * - Can be parsed by log aggregators (Datadog, CloudWatch, etc.)
 * 
 * @example
 * logger.info("User logged in");
 * logger.info({ userId: "123", action: "login" }, "User logged in");
 * logger.error({ err: error }, "Failed to process payment");
 */
export const logger = loggerInstance;

/**
 * Create a child logger with a unique request ID
 * 
 * Use this for HTTP request handling to track all logs
 * related to a single request
 * 
 * @returns Child logger with reqId field
 * 
 * @example
 * const reqLogger = createRequestLogger();
 * reqLogger.info("Processing request");
 * reqLogger.info("Query executed");
 * // Both logs will have the same reqId
 */
export function createRequestLogger(): pino.Logger {
  const requestId = nanoid(10); // e.g., "a1B2c3D4e5"
  return logger.child({ reqId: requestId });
}

/**
 * Log slow database queries
 * 
 * Automatically warns when a query exceeds threshold
 * 
 * @param query - SQL query (will be truncated to 200 chars)
 * @param duration - Query duration in milliseconds
 * @param threshold - Threshold in ms (default: 100ms)
 * 
 * @example
 * const start = Date.now();
 * await db.execute(query);
 * logSlowQuery(query, Date.now() - start);
 */
export function logSlowQuery(
  query: string, 
  duration: number, 
  threshold = 100
): void {
  if (duration > threshold) {
    logger.warn({
      msg: 'Slow query detected',
      query: query.substring(0, 200), // Truncate long queries
      duration_ms: duration,
      threshold_ms: threshold,
    });
  }
}

/**
 * Log errors with full stack trace
 * 
 * Ensures errors are logged consistently with context
 * 
 * @param error - Error object
 * @param context - Additional context (userId, requestId, etc.)
 * 
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logError(error, { userId: "123", operation: "payment" });
 * }
 */
export function logError(
  error: Error, 
  context?: Record<string, unknown>
): void {
  logger.error({
    msg: error.message,
    stack: error.stack,
    error_name: error.name,
    ...context,
  });
}

/**
 * Log successful operations with timing
 * 
 * @param operation - Operation name
 * @param duration - Duration in ms
 * @param metadata - Additional metadata
 * 
 * @example
 * const start = Date.now();
 * await processData();
 * logSuccess("process_data", Date.now() - start, { records: 100 });
 */
export function logSuccess(
  operation: string,
  duration: number,
  metadata?: Record<string, unknown>
): void {
  logger.info({
    msg: `Operation completed: ${operation}`,
    operation,
    duration_ms: duration,
    ...metadata,
  });
}

/**
 * Setup production file logging (call this in app initialization)
 * 
 * @returns The configured logger with file transport
 */
export async function initProductionLogging(): Promise<pino.Logger> {
  if (isDev) {
    return logger;
  }
  
  const fileStream = await setupFileLogging();
  
  // Multi-stream: both console and file
  const streams = [
    { stream: process.stdout },
    { stream: fileStream },
  ];
  
  return pino(
    { level: logLevel },
    pino.multistream(streams)
  );
}

export type { pino };
