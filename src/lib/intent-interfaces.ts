/**
 * Core interfaces for message-centric state operations
 */

/**
 * Base interface for all intents
 */
export interface Intent {
  type: 'read' | 'write';
  contract: string;
  function: string;
  args: any[];
}

/**
 * Simple read intent - no signature needed
 */
export interface ReadIntent extends Intent {
  type: 'read';
}

/**
 * Write intent requires signature and sender info
 */
export interface WriteIntent extends Intent {
  type: 'write';
  sender: string;
  signature: string;
  nonce: number;
  timestamp: number;
  postConditions?: any[];
}

/**
 * Union type for convenience
 */
export type AnyIntent = ReadIntent | WriteIntent;

/**
 * Result of processing an intent
 */
export interface IntentResult {
  /**
   * Status of the operation
   */
  status: 'success' | 'error' | 'pending';

  /**
   * Data returned by the operation (for read operations)
   */
  data?: any;

  /**
   * Transaction ID (for write operations)
   */
  txId?: string;

  /**
   * Error information if the operation failed
   */
  error?: {
    message: string;
    code?: number;
    details?: any;
  };
}

/**
 * Options for intent processors
 */
export interface ProcessorOptions {
  /**
   * Enable debug mode for additional logging
   */
  debug?: boolean;

  /**
   * Custom logger to use (defaults to console)
   */
  logger?: any;

  /**
   * Additional processor-specific options
   */
  [key: string]: any;
}

/**
 * Basic interface for any component that can process intents
 */
export interface IntentProcessor {
  /**
   * Process an intent and return a result
   */
  processIntent(intent: AnyIntent): Promise<IntentResult>;
}

/**
 * Extended processor with caching capabilities
 */
export interface CacheProcessor extends IntentProcessor {
  /**
   * Update the cache with a known value
   */
  updateCache(contract: string, fn: string, args: any[], value: any): void;

  /**
   * Invalidate cache entries matching the criteria
   */
  invalidateCache(contract?: string, fn?: string, args?: any[]): boolean;

  /**
   * Clear the entire cache
   */
  clearCache(): void;
}
