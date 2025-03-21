# Blaze SDK

A powerful, flexible SDK for seamlessly working with blockchain state through a unified message-centric architecture.

![Version](https://img.shields.io/npm/v/blaze-sdk.svg)
![License](https://img.shields.io/npm/l/blaze-sdk.svg)

## 🚀 Overview

This SDK provides a robust solution for managing blockchain state with an intelligent multi-layer caching system. It's designed around a message-centric architecture that handles both read and write operations through a unified interface, allowing developers to:

- Read state from multiple sources (memory cache, L2, blockchain)
- Execute transactions with cryptographic signatures
- Optimize performance through intelligent caching
- Fall back gracefully when primary data sources are unavailable

## ✨ Key Features

- Unified interface for both reads and writes
- Signature-free reads for better performance
- Intent-based architecture for clean abstractions
- Multi-layer processing with intelligent fallbacks
- Automatic cache invalidation on state changes
- Configurable caching with TTL and capacity controls
- TypeScript-first with full type safety

## 📦 Installation

```bash
npm install blaze-sdk
# or
yarn add blaze-sdk
# or
pnpm add blaze-sdk
```

## 🔍 Basic Usage

### Reading State (No Private Key Required)

```typescript
import { createReadOnlyClient } from 'blaze-sdk';

// Create a client for reading state
const client = createReadOnlyClient();

// Read token balance from any contract
async function getBalance(address) {
  const result = await client.call(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
    'get-balance',
    [address]
  );
  
  return result;
}

// The SDK automatically tries:
// 1. Memory cache (instant)
// 2. L2 service (fast)
// 3. Blockchain (slowest but authoritative)
```

### Writing State (Private Key Required)

```typescript
import { createL2Client } from 'blaze-sdk';

// Initialize a client with L2 and blockchain support
const client = createL2Client({
  signer: {
    getAddress: () => 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE',
    signMessage: async (message) => {
      // Your signing logic here
      return signature;
    }
  }
});

// Send tokens
async function transfer(to, amount) {
  const receipt = await client.execute(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
    'transfer',
    [to, amount],
    { optimistic: true } // Update state immediately for UI
  );
  
  return receipt;
}
```

### Integrating with L2 Services

```typescript
import { createL2Client } from 'blaze-sdk';

// Create a client with L2 service priority
const client = createL2Client({
  l2Service: {
    url: 'https://l2.example.com/api',
    apiKey: 'your-api-key'
  },
  
  // Will fallback to blockchain if L2 is unavailable
  fallback: true
});

// The SDK will automatically try L2 first, then blockchain
const balance = await client.call(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'get-balance',
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
);
```

## 🏗️ Architecture

The SDK is built around a message-centric architecture with these key components:

```
┌─────────┬────────────┬─────────┬────────┐
│ Intents │ Processors │ Sources │ Clients│
└─────────┴────────────┴─────────┴────────┘
```

- **UnifiedClient** - Entry point that creates intents and manages signing
- **ChainedProcessor** - Orchestrates multiple processors in a fallback chain
- **Processors** - Specialized components that process intents from different sources:
  - **MemoryCacheProcessor** - Ultra-fast in-memory cache
  - **L2Processor** - Interfaces with off-chain services
  - **StacksProcessor** - Reads from and writes to the blockchain

## 💡 Advanced Features

### Intelligent Fallback Chain

When reading state, the SDK automatically tries each data source in sequence:

```typescript
// Configure your own processor chain
const client = createClient({
  processors: [
    new MemoryCacheProcessor({ ttl: 60 * 1000 }),  // 1 minute cache
    new L2Processor({ url: 'https://l2.example.com' }), 
    new StacksProcessor({ network: 'mainnet' })
  ]
});

// The client will try each processor in sequence
const balance = await client.call(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'get-balance', 
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
);
```

### Cache Control

Fine-grained control over caching behavior:

```typescript
// Configure cache settings
const client = createClient({
  cache: {
    enabled: true,
    ttl: 30 * 1000,  // 30 seconds default TTL
    maxSize: 100,    // Maximum entries
    invalidation: {
      auto: true,    // Auto-invalidate on state changes
      patterns: [    // Invalidation patterns
        {
          contract: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
          function: 'get-balance',
          paramMatchers: [(params) => params[0] === myAddress]
        }
      ]
    }
  }
});

// Manually invalidate specific entries
client.invalidate(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'get-balance',
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
);
```

### Transaction Building and Signing

Complete control over transaction execution:

```typescript
// Create a write intent
const intent = client.createIntent({
  type: 'write',
  contract: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  function: 'transfer',
  args: [recipient, amount],
  options: {
    fee: 5000,
    nonce: 12,
    anchorMode: 'any'
  }
});

// Sign and submit in one step
const result = await client.processIntent(intent);

// Or get the serialized transaction
const tx = await client.buildTransaction(intent);
```

## 📊 Performance Benefits

The SDK dramatically improves app performance:

- Up to 300x faster for cached reads compared to direct blockchain calls
- 80-95% reduction in blockchain API usage through caching
- Parallel processing of multiple state queries
- Automatic retries with exponential backoff for reliability

## 🧠 Why Message-Centric Architecture?

Traditional blockchain libraries treat reads and writes differently, leading to fragmented codebases. Our message-centric approach:

- **Unifies the interface** - Same pattern for all state operations
- **Simplifies error handling** - Consistent error patterns across all sources
- **Enables composition** - Chain together processors for powerful workflows
- **Optimizes for each operation** - Read intents skip signatures; write intents include them

## 📘 API Reference Highlights

### Core Client Methods

- `call(contract, function, args)` - Read state from any source
- `execute(contract, function, args, options)` - Execute a state change with signature
- `processIntent(intent)` - Process any intent directly
- `invalidate(contract, function, args)` - Invalidate specific cache entries
- `clearCache()` - Clear the entire cache

### Helper Functions

- `createReadOnlyClient(options)` - Create a minimal client for reading only
- `createLocalClient(options)` - Create a client with local caching and blockchain fallback
- `createL2Client(options)` - Create a client with L2 service and blockchain fallback

## 🤝 Contributing

Contributions are welcome! See CONTRIBUTING.md for details.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgements

This SDK is inspired by best practices from both blockchain and traditional distributed systems designs, bringing together principles from:

- Intent-based programming models
- Multi-tier caching architectures
- Message-passing systems
- Event-driven design patterns