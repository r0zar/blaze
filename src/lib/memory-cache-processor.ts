/**
 * In-memory cache processor implementation
 * The fastest layer in our caching system
 */

import {
  AnyIntent,
  CacheProcessor,
  IntentResult,
  ProcessorOptions,
  ReadIntent,
} from './intent-interfaces';

/**
 * Options specific to the memory cache processor
 */
export interface MemoryCacheOptions extends ProcessorOptions {
  /**
   * Time-to-live in milliseconds for cache entries
   * After this time, entries will be considered expired
   * Default: 5 minutes
   */
  cacheTTL?: number;

  /**
   * Maximum number of entries to store in the cache
   * If specified, the cache will evict the least recently used entries
   * when this limit is reached
   */
  maxEntries?: number;
}

/**
 * Internal structure for cache entries
 */
interface CacheEntry {
  value: any;
  expiresAt: number;
  lastAccessed: number;
}

/**
 * In-memory cache processor
 * Implements the CacheProcessor interface
 */
export class MemoryCacheProcessor implements CacheProcessor {
  private cache: Map<string, CacheEntry>;
  private options: MemoryCacheOptions;
  private logger: any;

  /**
   * Create a new memory cache processor
   * @param options - Configuration options
   */
  constructor(options: MemoryCacheOptions = {}) {
    this.options = {
      cacheTTL: 5 * 60 * 1000, // 5 minutes default
      debug: false,
      logger: console,
      ...options,
    };

    this.logger = this.options.logger;
    this.cache = new Map<string, CacheEntry>();
  }

  /**
   * Generate a cache key from contract, function name and arguments
   */
  private generateKey(
    contract: string,
    functionName: string,
    args: any[]
  ): string {
    try {
      return `${contract}:${functionName}(${JSON.stringify(args)})`;
    } catch (e) {
      // Fallback for arguments that can't be stringified
      return `${contract}:${functionName}(...)`;
    }
  }

  /**
   * Update the cache with a known value
   */
  updateCache(
    contract: string,
    functionName: string,
    args: any[],
    value: any
  ): void {
    const key = this.generateKey(contract, functionName, args);

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.options.cacheTTL!,
      lastAccessed: Date.now(),
    });

    // Enforce maxEntries limit if specified
    if (this.options.maxEntries && this.cache.size > this.options.maxEntries) {
      this.evictLeastRecentlyUsed();
    }

    if (this.options.debug) {
      this.logger.debug(`[CACHE UPDATE] ${key}`);
    }
  }

  /**
   * Process an intent - only handles read intents
   */
  async processIntent(intent: AnyIntent): Promise<IntentResult> {
    // Only process read intents
    if (intent.type !== 'read') {
      return {
        status: 'error',
        error: {
          message: 'Cache processor only supports read intents',
        },
      };
    }

    const readIntent = intent as ReadIntent;
    const key = this.generateKey(
      readIntent.contract,
      readIntent.function,
      readIntent.args
    );

    if (this.cache.has(key)) {
      const entry = this.cache.get(key)!;

      // Check if the entry is still valid
      if (Date.now() < entry.expiresAt) {
        // Update last accessed time for LRU
        entry.lastAccessed = Date.now();

        if (this.options.debug) {
          this.logger.debug(`[CACHE HIT] ${key}`);
        }

        return {
          status: 'success',
          data: entry.value,
        };
      } else {
        // Remove expired entry
        this.cache.delete(key);

        if (this.options.debug) {
          this.logger.debug(`[CACHE EXPIRED] ${key}`);
        }
      }
    }

    // Cache miss or expired
    if (this.options.debug) {
      this.logger.debug(`[CACHE MISS] ${key}`);
    }

    return {
      status: 'error',
      error: {
        message: 'Cache miss',
      },
    };
  }

  /**
   * Invalidate cache entries matching the criteria
   */
  invalidateCache(
    contract?: string,
    functionName?: string,
    args?: any[]
  ): boolean {
    // If no criteria specified, clear entire cache
    if (!contract) {
      this.clearCache();
      return true;
    }

    let anyInvalidated = false;

    // Iterate all entries and check for matches
    for (const [key, _] of this.cache.entries()) {
      const keyParts = key.split(':');
      const contractPart = keyParts[0];

      // Check if key matches the criteria
      if (contractPart === contract) {
        if (!functionName || key.includes(`${functionName}(`)) {
          // If args are provided, check for exact match
          if (args) {
            const argsString = JSON.stringify(args);
            if (key.includes(argsString)) {
              this.cache.delete(key);
              anyInvalidated = true;

              if (this.options.debug) {
                this.logger.debug(`[CACHE INVALIDATED] ${key}`);
              }
            }
          } else {
            // No args provided, delete all matching contract+function
            this.cache.delete(key);
            anyInvalidated = true;

            if (this.options.debug) {
              this.logger.debug(`[CACHE INVALIDATED] ${key}`);
            }
          }
        }
      }
    }

    return anyInvalidated;
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    const size = this.cache.size;
    this.cache.clear();

    if (this.options.debug) {
      this.logger.debug(`[CACHE CLEARED] ${size} entries removed`);
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: { key: string; expiresIn: number }[];
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      expiresIn: Math.max(0, Math.floor((entry.expiresAt - now) / 1000)), // seconds remaining
    }));

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Evict the least recently used entries when cache is full
   */
  private evictLeastRecentlyUsed(): void {
    if (this.cache.size <= 0) return;

    // Find the least recently accessed entry
    let oldest: { key: string; lastAccessed: number } | null = null;

    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.lastAccessed < oldest.lastAccessed) {
        oldest = { key, lastAccessed: entry.lastAccessed };
      }
    }

    if (oldest) {
      this.cache.delete(oldest.key);

      if (this.options.debug) {
        this.logger.debug(`[CACHE EVICTION] LRU entry removed: ${oldest.key}`);
      }
    }
  }
}
