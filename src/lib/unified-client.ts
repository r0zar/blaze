/**
 * Unified Client
 * Client SDK for interacting with all layers of the system
 */

import { ChainedProcessor } from './chained-processor';
import {
  AnyIntent,
  IntentResult,
  ReadIntent,
  WriteIntent,
} from './intent-interfaces';
import { L2Processor, L2Service } from './l2-processor';
import { MemoryCacheProcessor } from './memory-cache-processor';
import { MessageSigner } from './message-signer';
import { StacksProcessor } from './stacks-processor';

/**
 * Options for the unified client
 */
export interface UnifiedClientOptions {
  /**
   * Private key for signing write operations
   * Optional - can still perform read operations without it
   */
  privateKey?: string;

  /**
   * L2 service implementation for off-chain operations
   */
  l2Service?: L2Service;

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
}

/**
 * Unified client for interacting with all layers of the system
 */
export class UnifiedClient {
  private processor: ChainedProcessor;
  private signer?: MessageSigner;
  private nonceCounter = 0;
  /**
   * Create a new unified client
   */
  constructor(options: UnifiedClientOptions = {}) {
    // Set up the signer if private key is provided
    this.signer = options.privateKey
      ? new MessageSigner(options.privateKey)
      : undefined;

    // Create the cache processor
    const cache = new MemoryCacheProcessor({
      cacheTTL: options.cacheTTL || 5 * 60 * 1000,
      maxEntries: options.maxCacheEntries || 1000,
      debug: options.debug,
      logger: options.logger,
    });

    // Set up the processors array
    const processors = [];

    // Add L2 processor if service is provided
    if (options.l2Service) {
      processors.push(
        new L2Processor({
          service: options.l2Service,
          debug: options.debug,
          logger: options.logger,
        })
      );
    }

    // Always add Stacks processor as final layer
    processors.push(
      new StacksProcessor({
        apiKey: options.apiKey,
        apiKeys: options.apiKeys,
        network: options.network || 'mainnet',
        debug: options.debug,
        logger: options.logger,
      })
    );

    // Create the chained processor
    this.processor = new ChainedProcessor({
      processors,
      cache,
      debug: options.debug,
      logger: options.logger,
    });
  }

  /**
   * Create a read intent
   */
  createReadIntent(contract: string, fn: string, args: any[]): ReadIntent {
    return {
      type: 'read',
      contract,
      function: fn,
      args,
    };
  }

  /**
   * Create a write intent with signature
   */
  async createWriteIntent(
    contract: string,
    fn: string,
    args: any[],
    options?: { postConditions?: any[] }
  ): Promise<WriteIntent> {
    if (!this.signer) {
      throw new Error('Private key is required for write operations');
    }

    const writeIntent: Omit<WriteIntent, 'signature'> = {
      type: 'write',
      contract,
      function: fn,
      args,
      sender: this.signer.getAddress(),
      timestamp: Date.now(),
      nonce: await this.getNonce(),
      postConditions: options?.postConditions || [],
    };

    // Sign the intent
    const signature = await this.signer.signMessage(writeIntent);

    return { ...writeIntent, signature };
  }

  /**
   * Process any intent through the processing chain
   */
  async processIntent(intent: AnyIntent): Promise<IntentResult> {
    return this.processor.processIntent(intent);
  }

  /**
   * Call a read-only function (wrapper for better usability)
   */
  async call(contract: string, fn: string, args: any[] = []): Promise<any> {
    const intent = this.createReadIntent(contract, fn, args);
    const result = await this.processIntent(intent);

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
  ): Promise<IntentResult> {
    if (!this.signer) {
      throw new Error('Private key is required for write operations');
    }

    const intent = await this.createWriteIntent(contract, fn, args, options);
    return this.processIntent(intent);
  }

  /**
   * Get nonce for transaction
   */
  private async getNonce(): Promise<number> {
    // Simple nonce implementation - in production you'd want to get this from an API
    // to prevent nonce collisions across multiple instances of the client
    return Date.now() * 1000 + this.nonceCounter++;
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
   * Legacy method for backward compatibility
   */
  async resolveState(contract: string, fn: string, args: any[]): Promise<any> {
    return this.call(contract, fn, args);
  }
}
