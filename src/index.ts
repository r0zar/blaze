/**
 * Blaze SDK - Message-centric blockchain state management
 * Main exports for the library
 */

import { Blaze } from './lib/blaze';
import { Service } from './lib/service';
import { StacksService } from './services/stacks-service';

// Core interfaces
export {
  QueryIntent,
  MutateIntent,
  QueryResult,
  MutateResult,
} from './lib/intent';

// Service interface
export { Service, ServiceOptions } from './lib/service';

// Cache
export { MemoryCache, CacheOptions } from './lib/memory-cache';

// Processor
export { Processor, ProcessorOptions } from './lib/processor';

// Message signing
export { MessageSigner } from './lib/message-signer';

// Stacks client (used by services)
export { StacksClient } from './clients/stacks-client';

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
export function createL2Client(options: {
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

// Default export for convenience
export default Blaze;
