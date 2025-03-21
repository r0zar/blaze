/**
 * L2 State Provider Library
 * Main exports for the library
 */

import { L2Service } from './lib/l2-processor';
import { UnifiedClientOptions } from './lib/unified-client';
import { UnifiedClient } from './lib/unified-client';

// Core interfaces
export {
    Intent,
    ReadIntent,
    WriteIntent,
    AnyIntent,
    IntentResult,
    IntentProcessor,
    CacheProcessor,
    ProcessorOptions,
} from './lib/intent-interfaces';

// Processors
export { ChainedProcessor } from './lib/chained-processor';
export { MemoryCacheProcessor } from './lib/memory-cache-processor';
export { L2Processor, L2Service } from './lib/l2-processor';
export { StacksProcessor } from './lib/stacks-processor';

// Client
export { UnifiedClient, UnifiedClientOptions } from './lib/unified-client';

// Utils
export { MessageSigner } from './lib/message-signer';

/**
 * Create a unified client with default configuration
 * Helper function for easier initialization
 */
export function createClient(options: UnifiedClientOptions) {
    return new UnifiedClient(options);
}

/**
 * Create a minimal read-only client
 * No private key required, uses only on-chain data
 */
export function createReadOnlyClient(options: {
    apiKey?: string;
    network?: 'mainnet' | 'testnet';
    debug?: boolean;
}) {
    return new UnifiedClient({
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
    l2Service: L2Service;
    apiKey?: string;
    network?: 'mainnet' | 'testnet';
    cacheTTL?: number;
    debug?: boolean;
}) {
    return new UnifiedClient({
        privateKey: options.privateKey,
        l2Service: options.l2Service,
        apiKey: options.apiKey,
        network: options.network || 'mainnet',
        cacheTTL: options.cacheTTL || 300000, // 5 minutes
        debug: options.debug || false,
    });
}
