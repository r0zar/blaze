/**
 * Standalone cache implementation for state operations
 * Used by the processor chain but not as a processor itself
 */

import { QueryIntent, QueryResult } from './intent';
import { ServiceOptions } from './service';

/**
 * Options for the memory cache
 */
export interface CacheOptions extends ServiceOptions {
  /**
   * Time-to-live in milliseconds for cache entries
   * Default: 5 minutes
   */
  ttl?: number;

  /**
   * Maximum number of entries to store in the cache
   * If reached, LRU entries will be evicted
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
 * Memory cache for state operations
 * Not a service itself, but used by the processor for caching
 */
export class MemoryCache {
  protected cache: Map<string, CacheEntry>;
  protected options: CacheOptions;
  protected logger: any;

  /**
   * Create a new cache
   */
  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: 5 * 60 * 1000, // 5 minutes default
      maxEntries: 1000,
      debug: false,
      logger: console,
      ...options,
    };

    this.logger = this.options.logger;
    this.cache = new Map<string, CacheEntry>();
  }

  /**
   * Generate a cache key from a query intent
   */
  private generateKey(intent: QueryIntent): string {
    try {
      return `${intent.contract}:${intent.function}(${JSON.stringify(
        intent.args
      )})`;
    } catch (e) {
      // Fallback for arguments that can't be stringified
      return `${intent.contract}:${intent.function}(...)`;
    }
  }

  /**
   * Generate a cache key from individual components
   */
  private generateKeyFromParts(
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
   * Get a value from the cache
   * @returns The cached value or undefined if not found or expired
   */
  get(intent: QueryIntent): QueryResult | undefined {
    const key = this.generateKey(intent);

    if (this.cache.has(key)) {
      const entry = this.cache.get(key);

      // Check if entry is still valid
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

    if (this.options.debug) {
      this.logger.debug(`[CACHE MISS] ${key}`);
    }

    return undefined;
  }

  /**
   * Store a value in the cache
   */
  set(intent: QueryIntent, value: any): void {
    const key = this.generateKey(intent);

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.options.ttl,
      lastAccessed: Date.now(),
    });

    // Check if we need to evict old entries
    if (this.options.maxEntries && this.cache.size > this.options.maxEntries) {
      this.evictLeastRecentlyUsed();
    }

    if (this.options.debug) {
      this.logger.debug(`[CACHE SET] ${key}`);
    }
  }

  /**
   * Invalidate cache entries matching criteria
   */
  invalidate(contract?: string, functionName?: string, args?: any[]): boolean {
    // If no criteria, clear entire cache
    if (!contract) {
      this.clear();
      return true;
    }

    let anyInvalidated = false;
    let exactKey: string | undefined;

    // If we have all parts, we can generate an exact key
    if (contract && functionName && args) {
      exactKey = this.generateKeyFromParts(contract, functionName, args);
    }

    // Iterate all entries and check for matches
    for (const [key, _] of this.cache.entries()) {
      // If we have an exact key, check for exact match
      if (exactKey && key === exactKey) {
        this.cache.delete(key);
        anyInvalidated = true;

        if (this.options.debug) {
          this.logger.debug(`[CACHE INVALIDATED] ${key}`);
        }
        continue;
      }

      // Otherwise pattern match
      const keyParts = key.split(':');
      const contractPart = keyParts[0];

      // Check if the contract matches
      if (contractPart === contract) {
        // If function name provided, check function match
        if (!functionName || key.includes(`${functionName}(`)) {
          this.cache.delete(key);
          anyInvalidated = true;

          if (this.options.debug) {
            this.logger.debug(`[CACHE INVALIDATED] ${key}`);
          }
        }
      }
    }

    return anyInvalidated;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();

    if (this.options.debug) {
      this.logger.debug(`[CACHE CLEARED] ${size} entries removed`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
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
