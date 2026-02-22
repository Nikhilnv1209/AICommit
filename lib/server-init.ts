import { indexingManager } from './indexing-manager';
import { logInfo, logError } from './logger';

/**
 * Server startup initialization
 * Called when the Next.js server starts
 */
export async function initServer(): Promise<void> {
  logInfo('ServerInit', 'Initializing server...');
  
  try {
    // Resume any interrupted indexing jobs
    await indexingManager.resumeInterruptedIndexing();
    logInfo('ServerInit', 'Server initialization complete');
  } catch (error) {
    logError('ServerInit', 'Error during server initialization:', error);
  }
}

/**
 * Server shutdown cleanup
 * Called when the Next.js server is shutting down
 */
export async function shutdownServer(): Promise<void> {
  logInfo('ServerShutdown', 'Shutting down server...');
  
  try {
    await indexingManager.shutdown();
    logInfo('ServerShutdown', 'Server shutdown complete');
  } catch (error) {
    logError('ServerShutdown', 'Error during server shutdown:', error);
  }
}