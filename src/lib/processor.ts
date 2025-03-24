/**
 * Unified State Processor
 * Processes state operations through a chain of services
 */

import { MutateIntent, MutateResult, QueryIntent, QueryResult } from './intent';
import { MemoryCache } from './memory-cache';
import { Service, ServiceOptions } from './service';

/**
 * Options for the state processor
 */
export interface ProcessorOptions extends ServiceOptions {
  /**
   * Array of services to use in order of preference
   * The processor will try each service in sequence until one returns a result
   */
  services: Service[];

  /**
   * Optional cache service for optimizing query performance
   */
  cache?: MemoryCache;
}

/**
 * Unified processor that handles state operations
 * through a chain of services with caching
 */
export class Processor {
  options: ProcessorOptions;
  services: Service[];
  cache?: MemoryCache;
  logger: any;

  /**
   * Create a new state processor
   */
  constructor(options: ProcessorOptions) {
    if (!options.services || options.services.length === 0) {
      throw new Error('Processor requires at least one service');
    }

    this.options = {
      debug: false,
      logger: console,
      ...options,
    };

    this.logger = this.options.logger;
    this.services = options.services;
    this.cache = options.cache;
  }

  /**
   * Process a query intent (read-only operation)
   */
  async query(intent: QueryIntent): Promise<QueryResult> {
    // First check cache if available
    if (this.cache) {
      const cachedResult = this.cache.get(intent);
      if (cachedResult) {
        return cachedResult;
      }
    }

    // Process through service chain
    let lastResult: QueryResult | null = null;
    let lastError: Error | null = null;

    for (let i = 0; i < this.services.length; i++) {
      try {
        const service = this.services[i];

        if (this.options.debug) {
          this.logger.debug(
            `[TRYING SERVICE] ${service.name} for ${intent.contract}.${intent.function}`
          );
        }

        const result = await service.query(intent);
        lastResult = result;

        if (this.options.debug) {
          this.logger.debug(
            `[SERVICE RESULT] ${service.name} for ${intent.contract}.${intent.function}: ${result.status}`
          );
        }

        // If successful, cache the result and return it
        if (result.status === 'success' && result.data !== undefined) {
          if (this.cache) {
            this.cache.set(intent, result.data);
          }
          return result;
        }
      } catch (error) {
        lastError = error;

        if (this.options.debug) {
          this.logger.warn(
            `[SERVICE ERROR] Service ${i + 1} failed for ${intent.contract}.${
              intent.function
            }: ${error.message}`
          );
        }
      }
    }

    // If we get here, no service succeeded
    if (lastResult) {
      return lastResult;
    }

    // If no result but we have an error, format it
    if (lastError) {
      return {
        status: 'error',
        error: {
          message: lastError.message,
          details: lastError,
        },
      };
    }

    // Default error if we somehow got here
    return {
      status: 'error',
      error: {
        message: `No service could process query ${intent.contract}.${intent.function}`,
      },
    };
  }

  /**
   * Process a mutate intent (state-changing operation)
   */
  async mutate(intent: MutateIntent): Promise<MutateResult> {
    let lastResult: MutateResult | null = null;
    let lastError: Error | null = null;

    for (let i = 0; i < this.services.length; i++) {
      const service = this.services[i];

      // Skip services that don't support mutations
      if (!service.mutate) {
        if (this.options.debug) {
          this.logger.debug(
            `[SKIP SERVICE] ${service.name} doesn't support mutations`
          );
        }
        continue;
      }

      try {
        if (this.options.debug) {
          this.logger.debug(
            `[TRYING SERVICE] ${service.name} for ${intent.contract}.${intent.function}`
          );
        }

        const result = await service.mutate(intent);
        lastResult = result;

        if (this.options.debug) {
          this.logger.debug(
            `[SERVICE RESULT] ${service.name} for ${intent.contract}.${intent.function}: ${result.status}`
          );
        }

        // For successful mutations, invalidate relevant cache entries
        if (
          this.cache &&
          (result.status === 'success' || result.status === 'pending')
        ) {
          this.cache.invalidate(intent.contract, intent.function);

          if (this.options.debug) {
            this.logger.debug(
              `[CACHE INVALIDATE] ${intent.contract}.${intent.function}`
            );
          }
        }

        // If successful, return the result
        if (result.status !== 'error') {
          return result;
        }
      } catch (error) {
        lastError = error;

        if (this.options.debug) {
          this.logger.warn(
            `[SERVICE ERROR] Service ${i + 1} failed for ${intent.contract}.${
              intent.function
            }: ${error.message}`
          );
        }
      }
    }

    // If we get here, no service succeeded
    if (lastResult) {
      return lastResult;
    }

    // If no result but we have an error, format it
    if (lastError) {
      return {
        status: 'error',
        error: {
          message: lastError.message,
          details: lastError,
        },
      };
    }

    // Default error if we somehow got here
    return {
      status: 'error',
      error: {
        message: `No service could process mutation ${intent.contract}.${intent.function}`,
      },
    };
  }

  /**
   * Helper to create a query intent
   */
  createQueryIntent(
    contract: string,
    functionName: string,
    args: any[]
  ): QueryIntent {
    return {
      contract,
      function: functionName,
      args,
    };
  }

  /**
   * Invalidate a specific entry in cache
   */
  invalidate(contract: string, functionName: string, args: any[]): boolean {
    if (this.cache) {
      return this.cache.invalidate(contract, functionName, args);
    }
    return false;
  }

  /**
   * Clear the entire cache
   */
  clearCache(): void {
    if (this.cache) {
      this.cache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    if (this.cache) {
      return this.cache.getStats();
    }
    return { size: 0, entries: [] };
  }
}
