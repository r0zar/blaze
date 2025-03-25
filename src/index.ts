/**
 * Blaze SDK - Message-centric blockchain state management
 * Main exports for the library
 */

// Core interfaces
export { QueryIntent, MutateIntent, QueryResult, MutateResult, } from './lib/intent';

// Service interface
export { Service, ServiceOptions, createService, createL2ServiceFromUrl } from './lib/service';

// Cache
export { MemoryCache, CacheOptions } from './lib/memory-cache';

// Processor
export { Processor, ProcessorOptions } from './lib/processor';

// Message signing
export { MessageSigner } from './lib/message-signer';

// Stacks service / client
export { StacksService, createStacksService } from './services/stacks-service'
export { StacksClient } from './clients/stacks-client';

// Main client exports
export { Blaze, createClientWithService, createL2ClientFromUrl, createReadOnlyClient } from './lib/blaze';
