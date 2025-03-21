/**
 * Layer 2 Processor
 * Processes intents using an off-chain data service
 */

import {
  AnyIntent,
  IntentProcessor,
  IntentResult,
  ProcessorOptions,
  ReadIntent,
} from './intent-interfaces';

/**
 * Interface for any L2 state service
 * This is what your custom off-chain data service should implement
 */
export interface L2Service {
  /**
   * Query the L2 state service (read operations)
   * @param contract - Contract identifier
   * @param functionName - Function name
   * @param args - Function arguments
   * @returns Promise resolving to the result or undefined if not found
   */
  query(contract: string, functionName: string, args: any[]): Promise<any>;

  /**
   * Submit a transaction to the L2 service (write operations)
   * @param intent - Full write intent with signature
   * @returns Promise resolving to transaction info
   */
  submit?(intent: AnyIntent): Promise<{ txId: string } | undefined>;
}

/**
 * Options for the L2 processor
 */
export interface L2ProcessorOptions extends ProcessorOptions {
  /**
   * Service instance that provides the actual L2 state
   * This is required and must be provided by the user
   */
  service: L2Service;
}

/**
 * Processor that handles intents using an off-chain L2 service
 */
export class L2Processor implements IntentProcessor {
  private options: L2ProcessorOptions;
  private logger: any;
  private service: L2Service;

  /**
   * Create a new L2 processor
   * @param options - Configuration options including the service implementation
   */
  constructor(options: L2ProcessorOptions) {
    if (!options.service) {
      throw new Error('L2Processor requires a service implementation');
    }

    this.options = {
      debug: false,
      logger: console,
      ...options,
    };

    this.logger = this.options.logger;
    this.service = this.options.service;
  }

  /**
   * Process an intent using the L2 service
   */
  async processIntent(intent: AnyIntent): Promise<IntentResult> {
    try {
      if (this.options.debug) {
        this.logger.debug(
          `[L2 ${intent.type.toUpperCase()}] ${intent.contract}.${
            intent.function
          }`
        );
      }

      // Handle based on intent type
      if (intent.type === 'read') {
        return this.processReadIntent(intent as ReadIntent);
      } else if (intent.type === 'write') {
        return this.processWriteIntent(intent);
      }

      // Unknown intent type
      return {
        status: 'error',
        error: {
          message: `Unsupported intent type`,
        },
      };
    } catch (error) {
      if (this.options.debug) {
        this.logger.warn(
          `[L2 ERROR] ${intent.contract}.${intent.function}: ${error.message}`
        );
      }

      // Return error result
      return {
        status: 'error',
        error: {
          message: error.message,
          details: error,
        },
      };
    }
  }

  /**
   * Process a read intent
   */
  private async processReadIntent(intent: ReadIntent): Promise<IntentResult> {
    try {
      const result = await this.service.query(
        intent.contract,
        intent.function,
        intent.args
      );

      if (result !== undefined) {
        if (this.options.debug) {
          this.logger.debug(`[L2 HIT] ${intent.contract}.${intent.function}`);
        }

        return {
          status: 'success',
          data: result,
        };
      }

      if (this.options.debug) {
        this.logger.debug(`[L2 MISS] ${intent.contract}.${intent.function}`);
      }

      return {
        status: 'error',
        error: {
          message: `No data found for ${intent.contract}.${intent.function}`,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          message: error.message,
          details: error,
        },
      };
    }
  }

  /**
   * Process a write intent
   */
  private async processWriteIntent(intent: AnyIntent): Promise<IntentResult> {
    // Check if service supports write operations
    if (!this.service.submit) {
      return {
        status: 'error',
        error: {
          message: 'L2 service does not support write operations',
        },
      };
    }

    try {
      const result = await this.service.submit(intent);

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
      return {
        status: 'error',
        error: {
          message: error.message,
          details: error,
        },
      };
    }
  }
}
