/**
 * Chained Processor
 * Orchestrates multiple intent processors in a fallback chain
 */

import {
  AnyIntent,
  CacheProcessor,
  IntentProcessor,
  IntentResult,
  ProcessorOptions,
  ReadIntent,
} from './intent-interfaces';

/**
 * Options for the chained processor
 */
export interface ChainedProcessorOptions extends ProcessorOptions {
  /**
   * Array of processors to use, in order of preference
   * The processor will try each one in sequence until one returns a result
   */
  processors: IntentProcessor[];

  /**
   * Optional dedicated cache processor
   * If provided, this will be used to cache results
   */
  cache?: CacheProcessor;
}

/**
 * A processor that chains multiple intent processors together
 * Attempts to process intents from each processor in sequence
 * Updates cache when data is found
 */
export class ChainedProcessor implements IntentProcessor {
  private options: ChainedProcessorOptions;
  private logger: any;
  private processors: IntentProcessor[];
  private cache?: CacheProcessor;

  /**
   * Create a new chained processor
   * @param options - Configuration options
   */
  constructor(options: ChainedProcessorOptions) {
    if (!options.processors || options.processors.length === 0) {
      throw new Error('ChainedProcessor requires at least one processor');
    }

    this.options = {
      debug: false,
      logger: console,
      ...options,
    };

    this.logger = this.options.logger;
    this.processors = options.processors;
    this.cache = options.cache;
  }

  /**
   * Process an intent by trying each processor in sequence
   */
  async processIntent(intent: AnyIntent): Promise<IntentResult> {
    // For read operations, try cache first if available
    if (intent.type === 'read' && this.cache) {
      try {
        const cachedResult = await this.cache.processIntent(intent);
        if (
          cachedResult.status === 'success' &&
          cachedResult.data !== undefined
        ) {
          if (this.options.debug) {
            this.logger.debug(
              `[CACHE HIT] ${intent.contract}.${intent.function}`
            );
          }
          return cachedResult;
        }
      } catch (error) {
        // Cache miss or error, continue to processors
        if (this.options.debug) {
          this.logger.debug(
            `[CACHE MISS] ${intent.contract}.${intent.function}`
          );
        }
      }
    }

    // For write operations or cache misses, go through the processor chain
    let lastResult: IntentResult | null = null;
    let lastError: Error | null = null;

    for (let i = 0; i < this.processors.length; i++) {
      try {
        const processor = this.processors[i];
        const result = await processor.processIntent(intent);

        // Update last result
        lastResult = result;

        if (this.options.debug) {
          this.logger.debug(
            `[PROCESSED] ${intent.contract}.${intent.function} by processor ${
              i + 1
            } with status ${result.status}`
          );
        }

        // For read operations with successful result, update cache
        if (
          intent.type === 'read' &&
          this.cache &&
          result.status === 'success' &&
          result.data !== undefined
        ) {
          this.cache.updateCache(
            intent.contract,
            intent.function,
            intent.args,
            result.data
          );

          if (this.options.debug) {
            this.logger.debug(
              `[CACHE UPDATE] ${intent.contract}.${intent.function}`
            );
          }
        }

        // For successful write operations, invalidate relevant cache entries
        if (
          intent.type === 'write' &&
          this.cache &&
          (result.status === 'success' || result.status === 'pending')
        ) {
          this.cache.invalidateCache(intent.contract, intent.function);

          if (this.options.debug) {
            this.logger.debug(
              `[CACHE INVALIDATE] ${intent.contract}.${intent.function}`
            );
          }
        }

        // If we got a valid result, return it and stop processing
        if (
          result.status !== 'error' &&
          (result.status === 'pending' ||
            result.data !== undefined ||
            result.txId)
        ) {
          return result;
        }
      } catch (error) {
        lastError = error;

        // Continue to next processor
        if (this.options.debug) {
          this.logger.warn(
            `Processor ${i + 1} failed, trying next: ${error.message}`
          );
        }
      }
    }

    // If we reached this point, no processor succeeded
    if (lastResult) {
      return lastResult; // Return the last result even if it was an error
    }

    // If we have no result but have an error, throw it
    if (lastError) {
      throw lastError;
    }

    // Default error if somehow we get here without a result or error
    return {
      status: 'error',
      error: {
        message: `Could not process intent ${intent.contract}.${intent.function} with any processor`,
      },
    };
  }

  /**
   * Clear all cacheable processors
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clearCache();

      if (this.options.debug) {
        this.logger.debug(`[CLEARED] Cache`);
      }
    }
  }

  /**
   * Invalidate a specific entry in cache
   */
  invalidate(contract: string, functionName: string, args: any[]): boolean {
    if (this.cache) {
      const invalidated = this.cache.invalidateCache(
        contract,
        functionName,
        args
      );

      if (invalidated && this.options.debug) {
        this.logger.debug(
          `[INVALIDATED] Cache for ${contract}.${functionName}`
        );
      }

      return invalidated;
    }

    return false;
  }

  /**
   * Helper method to create a read intent
   */
  createReadIntent(
    contract: string,
    function_: string,
    args: any[]
  ): ReadIntent {
    return {
      type: 'read',
      contract,
      function: function_,
      args,
    };
  }

  /**
   * Resolve state by creating and processing a read intent
   * (Compatibility method for existing StateProvider interface)
   */
  async resolveState(
    contract: string,
    functionName: string,
    args: any[]
  ): Promise<any> {
    const intent = this.createReadIntent(contract, functionName, args);
    const result = await this.processIntent(intent);

    if (result.status === 'error') {
      throw new Error(
        result.error?.message ||
          `Could not resolve ${contract}.${functionName} from any processor`
      );
    }

    return result.data;
  }
}
