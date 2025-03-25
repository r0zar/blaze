/**
 * Client for interacting with Stacks blockchain state using a unified interface
 */

import { ClarityValue } from '@stacks/transactions';

import { StacksService } from '../services/stacks-service';

import { MutateIntent, MutateResult, QueryIntent, QueryResult } from './intent';
import { MemoryCache } from './memory-cache';
import { MessageSigner } from './message-signer';
import { Processor } from './processor';
import { createL2ServiceFromUrl, Service } from './service';
/**
 * Options for the unified client
 */
export interface BlazeOptions {
  /**
   * Private key for signing write operations
   * Optional - can still perform read operations without it
   */
  privateKey?: string;

  /**
   * L2 service configuration
   * Either provide a fully configured service or a URL endpoint
   */
  l2?: {
    /**
     * L2 service endpoint URL
     */
    url?: string;

    /**
     * Custom L2 service implementation (alternative to URL)
     */
    service?: Service;

    /**
     * Additional options for the L2 service
     */
    options?: any;
  };

  /**
   * API key for Stacks endpoints
   */
  apiKey?: string;

  /**
   * Array of API keys for Stacks endpoints
   */
  apiKeys?: string[];

  /**
   * Network to use (mainnet or testnet)
   */
  network?: 'mainnet' | 'testnet';

  /**
   * Time-to-live for cache entries in milliseconds
   */
  cacheTTL?: number;

  /**
   * Maximum number of entries in the cache
   */
  maxCacheEntries?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Custom logger implementation
   */
  logger?: any;

  /**
   * Custom services to use instead of the default ones
   * If provided, overrides the default service configuration
   */
  services?: Service[];

  /**
   * Disable caching
   */
  disableCache?: boolean;
}

/**
 * Unified client for interacting with blockchain state
 */
export class Blaze {
  processor: Processor;
  signer?: MessageSigner;

  /**
   * Create a new unified client
   */
  constructor(options: BlazeOptions = {}) {
    // Set up the signer if private key is provided
    this.signer = options.privateKey
      ? new MessageSigner(options.privateKey)
      : undefined;

    // Create memory cache unless disabled
    const cache = options.disableCache
      ? undefined
      : new MemoryCache({
        ttl: options.cacheTTL || 5 * 60 * 1000,
        maxEntries: options.maxCacheEntries || 1000,
        debug: options.debug,
        logger: options.logger,
      });

    // Set up services array
    const services: Service[] = options.services || [];

    // If no custom services provided, set up default services
    if (!options.services) {
      // Add L2 service if configured
      if (options.l2) {
        // Use provided service or create one from URL
        if (options.l2.service) {
          services.push(options.l2.service);
        } else if (options.l2.url) {
          // Create a service from the L2 URL
          services.push(
            createL2ServiceFromUrl(options.l2.url, {
              debug: options.debug,
              logger: options.logger,
              ...options.l2.options,
            })
          );
        }
      }

      // Always add Stacks service as final layer
      services.push(
        new StacksService({
          apiKey: options.apiKey,
          apiKeys: options.apiKeys,
          network: options.network || 'mainnet',
          debug: options.debug,
          logger: options.logger,
        })
      );
    }

    // Create the processor with services and cache
    this.processor = new Processor({
      services,
      cache,
      debug: options.debug,
      logger: options.logger,
    });
  }

  /**
   * Create a query intent (read-only operation)
   */
  createQueryIntent(
    contract: string,
    fn: string,
    args: ClarityValue[]
  ): QueryIntent {
    return {
      contract,
      function: fn,
      args,
    };
  }

  /**
   * Create a mutate intent (state-changing operation)
   */
  async createMutateIntent(
    contract: string,
    fn: string,
    args: ClarityValue[],
    options?: MutateIntent['options']
  ): Promise<MutateIntent> {
    if (!this.signer) {
      throw new Error('Private key is required for mutation operations');
    }

    return {
      contract,
      function: fn,
      args,
      options,
    };
  }

  /**
   * Call a read-only function (wrapper for better usability)
   */
  async call(
    contract: string,
    fn: string,
    args: ClarityValue[] = []
  ): Promise<any> {
    const intent = this.createQueryIntent(contract, fn, args);
    const result = await this.processor.query(intent);

    if (result.status === 'error') {
      throw new Error(result.error?.message || 'Unknown error');
    }

    return result.data;
  }

  /**
   * Execute a state-changing function (wrapper for better usability)
   */
  async execute(
    contract: string,
    fn: string,
    args: ClarityValue[] = [],
    options?: MutateIntent['options']
  ): Promise<MutateResult> {
    if (!this.signer) {
      throw new Error('Private key is required for mutation operations');
    }

    const intent = await this.createMutateIntent(contract, fn, args, options);
    return this.processor.mutate(intent);
  }

  /**
   * Execute a query directly
   */
  async query(intent: QueryIntent): Promise<QueryResult> {
    return this.processor.query(intent);
  }

  /**
   * Execute a mutation directly
   */
  async mutate(intent: MutateIntent): Promise<MutateResult> {
    return this.processor.mutate(intent);
  }

  /**
   * Invalidate cache entry
   */
  invalidate(contract: string, fn: string, args: ClarityValue[]): boolean {
    return this.processor.invalidate(contract, fn, args);
  }

  /**
   * Clear entire cache
   */
  clearCache(): void {
    this.processor.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): any {
    return this.processor.getCacheStats();
  }

  /**
   * Legacy method for backward compatibility
   */
  async resolveState(
    contract: string,
    fn: string,
    args: ClarityValue[]
  ): Promise<any> {
    return this.call(contract, fn, args);
  }
}

/**
 * Create a read-only client
 * No private key required, uses only on-chain data
 */
export function createReadOnlyClient(options: {
  apiKey?: string;
  network?: 'mainnet' | 'testnet';
  debug?: boolean;
}) {
  return new Blaze({
    apiKey: options.apiKey,
    network: options.network || 'mainnet',
    debug: options.debug || false,
    cacheTTL: 60000, // 1 minute cache
  });
}

/**
 * Create an L2 client with fallback to on-chain
 */
export function createL2ClientFromUrl(options: {
  privateKey?: string;
  l2Url: string;
  l2Options?: any;
  apiKey?: string;
  network?: 'mainnet' | 'testnet';
  cacheTTL?: number;
  debug?: boolean;
}) {
  return new Blaze({
    privateKey: options.privateKey,
    l2: {
      url: options.l2Url,
      options: options.l2Options,
    },
    apiKey: options.apiKey,
    network: options.network || 'mainnet',
    cacheTTL: options.cacheTTL || 300000, // 5 minutes
    debug: options.debug || false,
  });
}

/**
 * Create a client with a custom service
 */
export function createClientWithService(options: {
  privateKey?: string;
  service: Service;
  apiKey?: string;
  fallbackToBlockchain?: boolean;
  network?: 'mainnet' | 'testnet';
  cacheTTL?: number;
  debug?: boolean;
}) {
  // Set up the services array
  const services: Service[] = [options.service];

  // Add blockchain fallback if requested
  if (options.fallbackToBlockchain !== false) {
    services.push(
      new StacksService({
        apiKey: options.apiKey,
        network: options.network || 'mainnet',
        debug: options.debug,
      })
    );
  }

  return new Blaze({
    privateKey: options.privateKey,
    services,
    cacheTTL: options.cacheTTL,
    debug: options.debug,
  });
}
