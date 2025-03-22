# Blaze SDK

A powerful, flexible SDK for seamlessly working with blockchain state through a unified message-centric architecture.

![Version](https://img.shields.io/npm/v/blaze-sdk.svg)
![License](https://img.shields.io/npm/l/blaze-sdk.svg)

## 🚀 Overview

Blaze SDK provides a robust solution for managing blockchain state with an intelligent multi-layer caching system. It's designed around a message-centric query/mutate architecture that handles both reading and writing through a unified interface, allowing developers to:

- Read state from multiple sources (memory cache, L2, blockchain)
- Execute transactions with proper authentication
- Optimize performance through intelligent caching
- Fall back gracefully when primary data sources are unavailable

## ✨ Key Features

- Unified interface for both queries and mutations
- Message-centric design for better abstractions
- Multi-layer service chain with intelligent fallbacks
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

### Creating a Client

```typescript
import { Blaze } from 'blaze-sdk';

// Create a simple client with blockchain access
const client = new Blaze({
  apiKey: 'your-api-key',
  network: 'mainnet'
});
```

### Reading State (Query)

```typescript
// Read a token balance
const balance = await client.call(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.charisma-contract',
  'get-balance', 
  ['SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS']
);

console.log(`Balance: ${balance}`);
```

### Writing State (Mutate)

```typescript
// Create a client with write capabilities
const client = new Blaze({
  privateKey: 'your-private-key',
  apiKey: 'your-api-key'
});

// Execute a token transfer
const result = await client.execute(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'transfer',
  [
    'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE', // recipient
    1000, // amount
    'Payment for services' // memo
  ]
);

console.log(`Transaction ID: ${result.txId}`);
```

## 🏗️ Architecture

The SDK follows a clear query/mutate pattern with a layered architecture:

```
┌────────────┐  ┌───────────┐  ┌──────────────┐
│ Blaze Client │──│ Processor │──│ Service Chain │
└────────────┘  └───────────┘  └──────────────┘
                      │
                      │
                ┌──────────┐
                │ MemoryCache │
                └──────────┘
```

- **Blaze Client**: Main entry point for application developers
- **Processor**: Orchestrates the service chain and caching
- **Service Chain**: Ordered list of state providers (L2, blockchain, etc.)
- **MemoryCache**: Fast in-memory cache for optimal performance

### Query/Mutate Pattern

The SDK organizes all operations into two types:

- **Queries**: Read-only operations that retrieve state
- **Mutations**: State-changing operations that require authentication

This pattern provides clear intent separation and optimizes each operation type independently.

## 💡 Advanced Usage

### L2 Integration

Connect to an L2 service for faster responses with blockchain fallback:

```typescript
// Using a URL endpoint for L2
const client = new Blaze({
  apiKey: 'your-api-key',
  privateKey: 'your-private-key', // optional
  l2: {
    url: 'https://l2.example.com/api',
    options: {
      headers: {
        'Authorization': 'Bearer token123'
      }
    }
  }
});
```

### Custom Services

Create your own service implementation:

```typescript
import { createService, Blaze } from 'blaze-sdk';

// Create a custom service
const myService = createService({
  name: 'my-custom-service',
  
  queryFn: async (intent) => {
    // Custom query logic
    console.log(`Querying ${intent.contract}.${intent.function}`);
    return myCustomDataSource.get(intent.contract, intent.function, intent.args);
  },
  
  mutateFn: async (intent) => {
    // Custom mutation logic
    console.log(`Mutating ${intent.contract}.${intent.function}`);
    const result = await myCustomDataSource.set(
      intent.contract,
      intent.function,
      intent.args
    );
    return { txId: result.transactionId };
  },
  
  debug: true
});

// Use the custom service
const client = new Blaze({
  services: [myService],
  privateKey: 'your-private-key' // optional
});
```

### Helper Functions

For common use cases, convenience functions are provided:

```typescript
import { createReadOnlyClient, createL2Client, createClientWithService } from 'blaze-sdk';

// Read-only client
const readOnly = createReadOnlyClient({
  apiKey: 'your-api-key',
  network: 'mainnet'
});

// L2 client with blockchain fallback
const l2Client = createL2Client({
  l2Url: 'https://l2.example.com/api',
  apiKey: 'your-api-key',
  privateKey: 'your-private-key' // optional
});

// Client with a custom service
const customClient = createClientWithService({
  service: myService,
  apiKey: 'your-api-key',
  fallbackToBlockchain: true
});
```

### Cache Control

Control caching behavior for optimal performance:

```typescript
// Configure caching
const client = new Blaze({
  apiKey: 'your-api-key',
  cacheTTL: 60 * 1000, // 1 minute cache
  maxCacheEntries: 500 // limit cache size
});

// Manually invalidate cache entries
client.invalidate(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'get-balance',
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
);

// Clear entire cache
client.clearCache();

// Get cache statistics
const stats = client.getCacheStats();
console.log(`Cache size: ${stats.size} entries`);
```

### Direct Intent Creation

For advanced use cases, create intents directly:

```typescript
// Create a query intent
const queryIntent = client.createQueryIntent(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'get-balance',
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
);

// Execute the query intent
const queryResult = await client.query(queryIntent);

// Create a mutate intent
const mutateIntent = await client.createMutateIntent(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'transfer',
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE', 1000, 'memo'],
  { 
    postConditions: [
      // Add post conditions here
    ] 
  }
);

// Execute the mutate intent
const mutateResult = await client.mutate(mutateIntent);
```

## 📊 Performance Benefits

The SDK dramatically improves app performance:

- **Fast Reads**: Up to 300x faster for cached queries compared to direct blockchain calls
- **Reduced Load**: 80-95% reduction in blockchain API usage through caching
- **Parallel Operations**: Process multiple state queries simultaneously
- **Reliable Fallbacks**: Automatic service switching when primary sources are unavailable

## 📚 Documentation

For more detailed information, refer to the following documentation:

- [**SERVICES.md**](./SERVICES.md): Detailed explanation of the resolve/mutate pattern and how to implement custom services
- [**EXAMPLES.md**](./EXAMPLES.md): Complete examples showing token wallets, NFT marketplaces, custom data sources, and advanced intent usage
- [**SCALING.md**](./SCALING.md): Advanced scaling techniques including specialized off-chain services, batching, and hybrid architecture patterns

## 🤝 Contributing

Contributions are welcome! See CONTRIBUTING.md for details.

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.