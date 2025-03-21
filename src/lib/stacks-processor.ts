/**
 * Stacks Blockchain Processor
 * Processes intents directly on the Stacks blockchain
 */

import { StacksClient } from '../processors/stacks-client';

import {
    AnyIntent,
    IntentProcessor,
    IntentResult,
    ProcessorOptions,
    ReadIntent,
    WriteIntent,
} from './intent-interfaces';

/**
 * Options for the Stacks blockchain processor
 */
export interface StacksProcessorOptions extends ProcessorOptions {
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
 * Processor that handles intents directly on the Stacks blockchain
 */
export class StacksProcessor implements IntentProcessor {
    private options: StacksProcessorOptions;
    private logger: any;
    private client: any;

    /**
     * Create a new Stacks blockchain processor
     * @param options - Configuration options
     */
    constructor(options: StacksProcessorOptions = {}) {
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
     * Process an intent using the Stacks blockchain
     */
    async processIntent(intent: AnyIntent): Promise<IntentResult> {
        try {
            if (this.options.debug) {
                this.logger.debug(
                    `[BLOCKCHAIN ${intent.type.toUpperCase()}] ${intent.contract}.${intent.function
                    }`
                );
            }

            if (intent.type === 'read') {
                return this.processReadIntent(intent);
            } else if (intent.type === 'write') {
                return this.processWriteIntent(intent);
            }

            return {
                status: 'error',
                error: {
                    message: `Unsupported intent type: ${intent}`,
                },
            };
        } catch (error) {
            if (this.options.debug) {
                this.logger.error(
                    `[BLOCKCHAIN ERROR] ${intent.contract}.${intent.function}: ${error.message}`
                );
            }

            return {
                status: 'error',
                error: {
                    message: `Failed to process ${intent.contract}.${intent.function} on blockchain: ${error.message}`,
                    details: error,
                },
            };
        }
    }

    /**
     * Process a read intent on the blockchain
     */
    private async processReadIntent(intent: ReadIntent): Promise<IntentResult> {
        try {
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
     * Process a write intent on the blockchain
     */
    private async processWriteIntent(intent: WriteIntent): Promise<IntentResult> {
        try {
            // Verify this is a properly signed write intent
            if (!intent.sender || !intent.signature) {
                throw new Error('Write intents must include sender and signature');
            }

            // Call the contract function
            const txId = await this.client.callContractFunction(
                intent.contract,
                intent.function,
                intent.args,
                intent.sender,
                intent.postConditions || []
            );

            return {
                status: 'pending',
                txId,
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

export { StacksClient };
