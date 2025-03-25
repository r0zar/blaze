/**
 * Stacks blockchain service implementation
 * Provides direct access to the Stacks blockchain
 */

import { StacksClient } from '../clients/stacks-client';
import {
  MutateIntent,
  MutateResult,
  QueryIntent,
  QueryResult,
} from '../lib/intent';
import { Service, ServiceOptions } from '../lib/service';

/**
 * Options for the Stacks service
 */
export interface StacksServiceOptions extends ServiceOptions {
  /**
   * Optional: Custom Stacks client instance
   * If not provided, will use StacksClient.getInstance()
   */
  client?: typeof StacksClient;

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
   * Maximum number of retry attempts
   */
  maxRetries?: number;

  /**
   * Base delay in milliseconds for retry backoff
   */
  retryDelay?: number;
}

/**
 * Service that interacts directly with the Stacks blockchain
 */
export class StacksService implements Service {
  readonly name = 'stacks';
  private options: StacksServiceOptions;
  private logger: any;
  private client: any;

  /**
   * Create a new Stacks service
   */
  constructor(options: StacksServiceOptions = {}) {
    this.options = {
      debug: false,
      logger: console,
      network: 'mainnet',
      maxRetries: 3,
      retryDelay: 1000,
      ...options,
    };

    this.logger = this.options.logger;

    // Use provided client or get singleton instance
    this.client =
      options.client ||
      StacksClient.getInstance({
        apiKey: options.apiKey,
        apiKeys: options.apiKeys,
        network: options.network,
        maxRetries: options.maxRetries,
        retryDelay: options.retryDelay,
        debug: options.debug,
        logger: options.logger,
      });
  }

  /**
   * Query state from the Stacks blockchain
   */
  async query(intent: QueryIntent): Promise<QueryResult> {
    try {
      if (this.options.debug) {
        this.logger.debug(
          `[STACKS QUERY] ${intent.contract}.${intent.function}`
        );
      }

      const result = await this.client.callReadOnly(
        intent.contract,
        intent.function,
        intent.args,
        this.options.maxRetries
      );

      return {
        status: 'success',
        data: result,
      };
    } catch (error) {
      if (this.options.debug) {
        this.logger.error(
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
  }

  /**
   * Mutate state on the Stacks blockchain
   */
  async mutate(intent: MutateIntent): Promise<MutateResult> {
    try {
      if (this.options.debug) {
        this.logger.debug(
          `[STACKS MUTATE] ${intent.contract}.${intent.function}`
        );
      }

      // Call the contract function
      const txId = await this.client.callContractFunction(
        intent.contract,
        intent.function,
        intent.args,
        intent.options
      );

      return {
        status: 'pending',
        txId,
      };
    } catch (error) {
      if (this.options.debug) {
        this.logger.error(
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
  }
}

/**
 * Create a Stacks blockchain service (helper function)
 */
export function createStacksService(options: StacksServiceOptions): Service {
  return new StacksService(options);
}
