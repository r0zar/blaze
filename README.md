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

## 🚦 Getting Started

### Creating Your First Client

First, import the necessary components and create a client using the core `UnifiedClient` class or the helper function:

```typescript
// Using the UnifiedClient class directly
import { UnifiedClient } from 'blaze-sdk';

const client = new UnifiedClient({
  apiKey: 'your-api-key', 
  network: 'mainnet'
});

// Or using a helper function
import { createClient } from 'blaze-sdk';

const client = createClient({
  apiKey: 'your-api-key', 
  network: 'mainnet'
});
```

### Reading Blockchain State

The SDK provides a unified interface for reading state from any source (cache, L2, or blockchain):

```typescript
// Read a token balance
const balance = await client.call(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'get-balance', 
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
);

console.log(`Balance: ${balance}`);
```

### Writing to the Blockchain

To perform write operations, include your private key when creating the client:

```typescript
import { UnifiedClient } from 'blaze-sdk';

// Client with write capabilities
const client = new UnifiedClient({
  privateKey: 'your-private-key',
  apiKey: 'your-api-key',
  network: 'mainnet'
});

// Transfer tokens
const result = await client.execute(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'transfer',
  [
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS', // sender
    'ST3KCNDSWZSFZCC6BE4VA9AXWXC9KEB16FBTRK36T', // recipient
    1000, // amount
    'Payment for services' // memo
  ]
);

console.log(`Transaction ID: ${result.txId}`);
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

## 🧩 Example Applications

The SDK includes example implementations that demonstrate how to build different types of applications. These examples are not part of the core SDK but show how you can create your own application-specific classes using the SDK.

### DeFi Wallet Example

The SDK includes a `DeFiWallet` implementation in the examples directory that shows how to build a wallet with token management capabilities:

```typescript
// This example shows how you could build your own DeFi wallet class
// using the core Blaze SDK components
import { createClient, createL2Client, L2Service } from 'blaze-sdk';

// Create your own L2 service implementation
class MyL2Service implements L2Service {
  // Implement the L2Service interface methods...
}

// Create a DeFi wallet class
class MyDeFiWallet {
  private client;
  
  constructor(options) {
    // Use the SDK to create a client with L2 capabilities
    this.client = createL2Client({
      privateKey: options.privateKey,
      l2Service: new MyL2Service(options.l2Endpoint),
      apiKey: options.apiKey
    });
  }
  
  async getBalance(tokenContract) {
    // Use the client to call blockchain functions
    return this.client.call(tokenContract, 'get-balance', [this.client.getAddress()]);
  }
  
  async transfer(tokenContract, recipient, amount, memo) {
    // Execute a blockchain transaction
    return this.client.execute(tokenContract, 'transfer', [recipient, amount, memo]);
  }
}

// Usage
const wallet = new MyDeFiWallet({
  privateKey: 'your-private-key',
  l2Endpoint: 'https://l2.example.com/api',
  apiKey: 'your-api-key'
});
```

For a complete implementation, see the [DeFi Wallet Example](./examples/defi-wallet.ts).

### NFT Marketplace Example

The SDK includes an example NFT marketplace implementation that shows how to create, list, and buy NFTs:

```typescript
// Core SDK components you'll use to build an NFT marketplace
import { createClient, UnifiedClient } from 'blaze-sdk';

// Create your own marketplace using the UnifiedClient
class MyNFTMarketplace {
  private client: UnifiedClient;
  private marketplaceContract: string;
  
  constructor(options) {
    // Create a client using the SDK
    this.client = createClient({
      privateKey: options.privateKey,
      apiKey: options.apiKey
    });
    
    this.marketplaceContract = options.marketplaceContract;
  }
  
  // Implement marketplace functions using the client
  async getActiveListings(limit = 20) {
    return this.client.call(
      this.marketplaceContract,
      'get-active-listings',
      [limit]
    );
  }
  
  async createListing(nftContract, tokenId, price, expirationDays) {
    // Execute the marketplace function
    return this.client.execute(
      this.marketplaceContract, 
      'create-listing',
      [nftContract, tokenId, price, expirationDays]
    );
  }
}
```

For a complete implementation, see the [NFT Marketplace Example](./examples/nft-marketplace.ts).

### Social Media Example

The SDK includes an example social media application that shows how to create profiles, posts, and interactions:

```typescript
// Core SDK components for building a social media application
import { createClient } from 'blaze-sdk';

// Create your own social media application class
class MySocialApp {
  private client;
  private socialContract = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.social';
  
  constructor(options) {
    // Use the SDK to create a client
    this.client = createClient({
      privateKey: options.privateKey,
      apiKey: options.apiKey
    });
  }
  
  // Use the client to implement social features
  async getProfile(username) {
    return this.client.call(this.socialContract, 'get-profile', [username]);
  }
  
  async createPost(content) {
    return this.client.execute(this.socialContract, 'create-post', [content]);
  }
}
```

For a complete implementation, see the [Social Media Example](./examples/social-media.ts).

## 💡 Advanced Features

### Intelligent Fallback Chain

When reading state, the SDK automatically tries each data source in sequence:

```typescript
// Configure your own processor chain
const client = createClient({
  processors: [
    new MemoryCacheProcessor({ ttl: 60 * 1000 }),  // 1 minute cache
    new L2Processor({ url: 'https://l2.example.com' }), 
    new StacksProcessor({ apiKey: 'your-api-key', network: 'mainnet' })
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
  args: [sender, recipient, amount],
  options: {
    fee: 5000,
    nonce: 12,
    anchorMode: 'any'
  }
});

// Sign and submit in one step
const result = await client.processIntent(intent);
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

new CustomL2Service('https://l2.example.com'),
  apiKey: 'your-api-key'
});
```

### Core Client Methods

- `call(contract, function, args)` - Read state from any source
- `execute(contract, function, args, options)` - Execute a state change with signature
- `processIntent(intent)` - Process any intent directly
- `invalidate(contract, function, args)` - Invalidate specific cache entries
- `clearCache()` - Clear the entire cache

For more detailed API documentation, see the [TypeScript interfaces](./src/interfaces) and [example applications](./examples).

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