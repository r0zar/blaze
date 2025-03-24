/**
 * StacksClient implementation for blockchain interactions
 * Compatible with both Node.js and browser environments (including service workers)
 */
import { Client, createClient } from '@stacks/blockchain-api-client';
import { paths } from '@stacks/blockchain-api-client/lib/generated/schema';
import {
  broadcastTransaction,
  ClarityValue,
  cvToHex,
  cvToValue,
  hexToCV,
  makeContractCall,
  PostConditionMode,
  SignedContractCallOptions,
  SignedMultiSigContractCallOptions,
} from '@stacks/transactions';

import { MutateIntent } from '../lib/intent';

const API_ENDPOINTS = [
  'https://api.hiro.so/',
  'https://api.mainnet.hiro.so/',
  'https://stacks-node-api.mainnet.stacks.co/',
];

/**
 * Options for StacksClient
 */
export interface StacksClientOptions {
  /**
   * Default API key used for authentication with Stacks endpoints
   */
  apiKey?: string;

  /**
   * Array of API keys for rotation
   */
  apiKeys?: string[];

  /**
   * API key rotation strategy
   * - "loop": Cycle through keys sequentially
   * - "random": Select a random key for each request
   */
  apiKeyRotation?: 'loop' | 'random';

  /**
   * Private key for server mode
   */
  privateKey?: string;

  /**
   * Base delay in milliseconds for retry attempts
   * Will be multiplied by attempt number for exponential backoff
   */
  retryDelay?: number;

  /**
   * Environment setting (mainnet or testnet)
   */
  network?: 'mainnet' | 'testnet';

  /**
   * Maximum number of retry attempts for network requests
   */
  maxRetries?: number;

  /**
   * Enable verbose logging
   */
  debug?: boolean;

  /**
   * Custom logger (defaults to console)
   */
  logger?: any;
}

/**
 * Default options for StacksClient
 */
const DEFAULT_OPTIONS: StacksClientOptions = {
  apiKey: '',
  apiKeys: [],
  apiKeyRotation: 'loop',
  privateKey: '',
  network: 'mainnet',
  retryDelay: 1000,
  maxRetries: 3,
  debug: false,
  logger: console,
};

/**
 * Singleton client for Stacks blockchain interactions with built-in redundancy
 */
export class StacksClient {
  protected static instance: StacksClient;
  protected static currentKeyIndex = 0;
  protected static currentClientIndex = 0;
  protected static options: StacksClientOptions;
  protected clients: Client<paths, `${string}/${string}`>[];
  protected logger: any;

  /**
   * Private constructor - use getInstance() instead
   */
  private constructor(options: StacksClientOptions = {}) {
    // Initialize options
    StacksClient.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = StacksClient.options.logger || console;

    // If we have a single apiKey but no apiKeys array, create one
    if (StacksClient.options.apiKey && !StacksClient.options.apiKeys?.length) {
      StacksClient.options.apiKeys = [StacksClient.options.apiKey];
    }

    // Create a client for each endpoint
    this.clients = API_ENDPOINTS.map((endpoint) =>
      createClient({ baseUrl: endpoint })
    );

    // Add API key handling middleware to each client
    this.clients.forEach((client) => {
      client.use({
        onRequest({ request }) {
          const apiKeys = StacksClient.options.apiKeys || [];
          if (!apiKeys.length) return;
          const key = StacksClient.getNextApiKey(
            apiKeys,
            StacksClient.options.apiKeyRotation
          );
          request.headers.set('x-api-key', key);
        },
      });
    });
  }

  /**
   * Get the next client in rotation for redundancy
   */
  private getCurrentClient(): Client<paths, `${string}/${string}`> {
    const client = this.clients[StacksClient.currentClientIndex];
    StacksClient.currentClientIndex =
      (StacksClient.currentClientIndex + 1) % this.clients.length;
    return client;
  }

  /**
   * Rotate through API keys based on configured strategy
   */
  private static getNextApiKey(
    apiKeys: string[],
    rotationStrategy = 'loop'
  ): string {
    if (!apiKeys.length) return '';

    if (rotationStrategy === 'random') {
      const randomIndex = Math.floor(Math.random() * apiKeys.length);
      return apiKeys[randomIndex];
    } else {
      // Default loop strategy
      const key = apiKeys[StacksClient.currentKeyIndex];
      StacksClient.currentKeyIndex =
        (StacksClient.currentKeyIndex + 1) % apiKeys.length;
      return key;
    }
  }

  /**
   * Manually set the current API key index
   */
  static setKeyIndex(index = 0): void {
    StacksClient.currentKeyIndex = index;
  }

  /**
   * Get the singleton instance of StacksClient
   */
  static getInstance(options: StacksClientOptions = {}): StacksClient {
    if (!StacksClient.instance) {
      StacksClient.instance = new StacksClient(options);
    } else if (Object.keys(options).length > 0) {
      // Update options if provided
      StacksClient.instance.updateOptions(options);
    }
    return StacksClient.instance;
  }

  /**
   * Update client options
   */
  updateOptions(options: StacksClientOptions): void {
    StacksClient.options = { ...StacksClient.options, ...options };
    this.logger = StacksClient.options.logger || console;
  }

  /**
   * Get current options
   */
  getOptions(): StacksClientOptions {
    return { ...StacksClient.options };
  }

  /**
   * Call a read-only function on a Stacks contract
   *
   * @param contractId - Contract identifier in format "address.contract-name"
   * @param method - Function name to call
   * @param args - Arguments to pass to the function
   * @param retries - Number of retry attempts (default: from options)
   * @returns Promise resolving to the function result
   */
  async callReadOnly(
    contractId: string,
    method: string,
    args: ClarityValue[] = [],
    retries?: number
  ): Promise<any> {
    const maxRetries = retries || StacksClient.options.maxRetries || 3;
    const [address, name] = contractId.split('.');
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await this.getCurrentClient().POST(
          `/v2/contracts/call-read/${address}/${name}/${method}` as any,
          {
            body: {
              sender: address,
              arguments: args.map((arg) => cvToHex(arg)),
            },
          }
        );

        if (!response?.data?.result) {
          throw new Error(`\nNo result from contract call ${method}`);
        }

        return cvToValue(hexToCV(response.data.result)).value;
      } catch (error) {
        attempt++;

        if (attempt >= maxRetries) {
          if (StacksClient.options.debug) {
            this.logger.error(error);
          }
          throw new Error(
            `\nFailed to call ${contractId} read-only method ${method} after ${maxRetries} attempts: ${error}`
          );
        }

        // Exponential backoff
        const retryDelay = StacksClient.options.retryDelay || 1000;
        await new Promise((resolve) =>
          setTimeout(resolve, attempt * retryDelay)
        );
      }
    }
  }

  /**
   * Call a public function (state-changing) on a smart contract
   *
   * @param contractId - Fully qualified contract identifier (address.contract-name)
   * @param functionName - Name of the function to call
   * @param args - Array of Clarity values to pass to the function
   * @param senderAddress - Address of the sender
   * @param postConditions - Optional post conditions
   * @param options - Additional options (fee, nonce, etc.)
   * @returns Transaction ID if successful
   */
  async callContractFunction(
    contractId: string,
    functionName: string,
    args: ClarityValue[] = [],
    options: MutateIntent['options'] = {}
  ): Promise<string> {
    try {
      if (StacksClient.options.debug) {
        this.logger.debug(`[STACKS CALL] ${contractId}.${functionName}`);
      }

      // Parse contract ID
      const [contractAddress, contractName] = contractId.split('.');

      // Check if we're in server mode with a private key
      if (!StacksClient.options.privateKey) {
        throw new Error(
          'Private key is required for contract function calls in server mode'
        );
      }

      const transactionOptions:
        | SignedContractCallOptions
        | SignedMultiSigContractCallOptions = {
        contractAddress,
        contractName,
        functionName,
        functionArgs: args,
        senderKey: options.privateKey || StacksClient.options.privateKey,
        validateWithAbi: true,
        network: options.network || StacksClient.options.network,
        postConditions: options.postConditions,
        postConditionMode: options.postConditionMode || PostConditionMode.Deny,
        sponsored: options.sponsored,
      };

      if (options.nonce) {
        transactionOptions.nonce = options.nonce;
      }

      if (options.fee) {
        transactionOptions.fee = options.fee;
      }

      // Create the transaction
      const transaction = await makeContractCall(transactionOptions);

      // Broadcast the transaction
      const broadcastResponse = await broadcastTransaction({ transaction });

      // Check for errors
      if ('error' in broadcastResponse) {
        throw new Error(
          `Failed to broadcast transaction: ${broadcastResponse.error} - ${broadcastResponse.reason}`
        );
      }

      // Return transaction ID
      return broadcastResponse.txid;
    } catch (error) {
      if (StacksClient.options.debug) {
        this.logger.error(
          `[STACKS ERROR] ${contractId}.${functionName}: ${error.message}`
        );
      }
      throw error;
    }
  }
}

export default StacksClient;
