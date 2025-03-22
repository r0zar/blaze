/**
 * Client for interacting with Stacks blockchain state using a unified interface
 */

import { ClarityValue } from '@stacks/transactions';

import { StacksClient } from '../clients/stacks-client';

import { MutateIntent, MutateResult, QueryIntent, QueryResult } from './intent';
import { MemoryCache } from './memory-cache';
import { MessageSigner } from './message-signer';
import { Processor } from './processor';
import { Service } from './service';
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
  private processor: Processor;
  private signer?: MessageSigner;

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
        createStacksService({
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
    args: any[],
    options?: { postConditions?: any[] }
  ): Promise<MutateIntent> {
    if (!this.signer) {
      throw new Error('Private key is required for mutation operations');
    }

    return {
      contract,
      function: fn,
      args,
      sender: this.signer.getAddress(),
      timestamp: Date.now(),
      nonce: await this.getNonce(),
      postConditions: options?.postConditions || [],
    };
  }

  /**
   * Call a read-only function (wrapper for better usability)
   */
  async call(contract: string, fn: string, args: any[] = []): Promise<any> {
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
    args: any[] = [],
    options?: { postConditions?: any[] }
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
   * Get nonce for transaction
   */
  private async getNonce(): Promise<number> {
    // Simple nonce implementation - in production you'd want to get this from an API
    // to prevent nonce collisions across multiple instances of the client
    return Date.now();
  }

  /**
   * Invalidate cache entry
   */
  invalidate(contract: string, fn: string, args: any[]): boolean {
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
  async resolveState(contract: string, fn: string, args: any[]): Promise<any> {
    return this.call(contract, fn, args);
  }
}

/**
 * Create a Stacks blockchain service
 */
function createStacksService(options: {
  apiKey?: string;
  apiKeys?: string[];
  network?: 'mainnet' | 'testnet';
  debug?: boolean;
  logger?: any;
}): Service {
  const logger = options.logger || console;
  const debug = options.debug || false;

  // Get the Stacks client
  const client = StacksClient.getInstance({
    apiKey: options.apiKey,
    apiKeys: options.apiKeys,
    network: options.network || 'mainnet',
    debug: options.debug,
    logger: options.logger,
  });

  return {
    name: 'stacks',

    async query(intent: QueryIntent): Promise<QueryResult> {
      try {
        if (debug) {
          logger.debug(`[STACKS QUERY] ${intent.contract}.${intent.function}`);
        }

        const result = await client.callReadOnly(
          intent.contract,
          intent.function,
          intent.args
        );

        return {
          status: 'success',
          data: result,
        };
      } catch (error) {
        if (debug) {
          logger.error(
            `[STACKS ERROR] ${intent.contract}.${intent.function}: ${error.message}`
          );
        }

        return {
          status: 'error',
          error: {
            message: `Failed to query ${intent.contract}.${intent.function} on Stacks: ${error.message}`,
            details: error,
          },
        };
      }
    },

    async mutate(intent: MutateIntent): Promise<MutateResult> {
      try {
        if (debug) {
          logger.debug(`[STACKS MUTATE] ${intent.contract}.${intent.function}`);
        }

        if (!intent.sender) {
          throw new Error('Mutation intents must include sender');
        }

        // TODO: Implement this
        // const txId = await client.callContractFunction(
        //   intent.contract,
        //   intent.function,
        //   intent.args,
        //   intent.sender,
        //   intent.postConditions || []
        // );
        const txId = 'TODO';

        return {
          status: 'pending',
          txId,
        };
      } catch (error) {
        if (debug) {
          logger.error(
            `[STACKS ERROR] ${intent.contract}.${intent.function}: ${error.message}`
          );
        }

        return {
          status: 'error',
          error: {
            message: `Failed to mutate ${intent.contract}.${intent.function} on Stacks: ${error.message}`,
            details: error,
          },
        };
      }
    },
  };
}

/**
 * Create an L2 service from a URL endpoint
 */
function createL2ServiceFromUrl(
  url: string,
  options: {
    debug?: boolean;
    logger?: any;
    headers?: Record<string, string>;
  }
): Service {
  const logger = options.logger || console;
  const debug = options.debug || false;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  return {
    name: 'l2',

    async query(intent: QueryIntent): Promise<QueryResult> {
      try {
        if (debug) {
          logger.debug(`[L2 QUERY] ${intent.contract}.${intent.function}`);
        }

        const response = await fetch(`${url}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contract: intent.contract,
            function: intent.function,
            args: intent.args,
          }),
        });

        if (!response.ok) {
          throw new Error(`L2 service error: ${response.status}`);
        }

        const result = await response.json();

        return {
          status: 'success',
          data: result,
        };
      } catch (error) {
        if (debug) {
          logger.warn(
            `[L2 ERROR] ${intent.contract}.${intent.function}: ${error.message}`
          );
        }

        return {
          status: 'error',
          error: {
            message: error.message,
            details: error,
          },
        };
      }
    },

    async mutate(intent: MutateIntent): Promise<MutateResult> {
      try {
        if (debug) {
          logger.debug(`[L2 MUTATE] ${intent.contract}.${intent.function}`);
        }

        const response = await fetch(`${url}/mutate`, {
          method: 'POST',
          headers,
          body: JSON.stringify(intent),
        });

        if (!response.ok) {
          throw new Error(`L2 submission error: ${response.status}`);
        }

        const result = await response.json();

        if (result && result.txId) {
          return {
            status: 'pending',
            txId: result.txId,
          };
        }

        return {
          status: 'error',
          error: {
            message: 'L2 service did not return a transaction ID',
          },
        };
      } catch (error) {
        if (debug) {
          logger.warn(
            `[L2 ERROR] ${intent.contract}.${intent.function}: ${error.message}`
          );
        }

        return {
          status: 'error',
          error: {
            message: error.message,
            details: error,
          },
        };
      }
    },
  };
}
