# Query/Mutate Pattern

## Understanding the Pattern

The Query/Mutate pattern is a simple but powerful approach for interacting with state in distributed systems like blockchains. It separates all operations into two categories:

- **Queries**: Read-only operations that don't change state
- **Mutations**: Operations that change state and require authentication

This separation provides several benefits:

1. **Clear Intent** - Operations clearly signal their purpose
2. **Optimized Processing** - Each type can be optimized differently
3. **Simplified Authentication** - Only mutations need signatures

## Implementation in Blaze SDK

In the Blaze SDK, this pattern is implemented with two core interfaces:

### QueryIntent

```typescript
export interface QueryIntent {
  contract: string;
  function: string;
  args: any[];
}
```

QueryIntents are simple and lightweight - they only contain the information needed to identify which state to read.

### MutateIntent

```typescript
export interface MutateIntent extends QueryIntent {
  sender: string;
  nonce: number;
  timestamp: number;
  postConditions?: any[];
}
```

MutateIntents extend QueryIntents with additional fields needed for authentication and proper transaction handling.

## Using the Pattern

### Queries (Read Operations)

The simplest way to query state is using the `call` method:

```typescript
const balance = await client.call(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'get-balance', 
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
);
```

For advanced usage, you can create and process query intents directly:

```typescript
// Create a query intent
const intent = client.createQueryIntent(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'get-balance',
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE']
);

// Process the query intent
const result = await client.query(intent);
if (result.status === 'success') {
  console.log(`Balance: ${result.data}`);
} else {
  console.error(`Error: ${result.error?.message}`);
}
```

### Mutations (Write Operations)

For state changes, use the `execute` method:

```typescript
const result = await client.execute(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'transfer',
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE', 1000, 'memo']
);
```

For advanced usage, create and process mutate intents directly:

```typescript
// Create a mutate intent
const intent = await client.createMutateIntent(
  'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.token-contract',
  'transfer',
  ['SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE', 1000, 'memo']
);

// Process the mutate intent
const result = await client.mutate(intent);
if (result.status === 'pending') {
  console.log(`Transaction submitted: ${result.txId}`);
} else {
  console.error(`Error: ${result.error?.message}`);
}
```

## Benefits of the Pattern

### For Queries (Read Operations)

- **Caching**: Results can be cached for improved performance
- **Parallel Processing**: Multiple queries can run simultaneously
- **No Authentication**: Queries don't require signatures

### For Mutations (Write Operations)

- **Clear Authentication**: Required fields for signing are explicit
- **Transaction Handling**: Proper nonce and timestamp management
- **Cache Invalidation**: Mutations automatically invalidate related cache entries

## Service Implementation

When creating custom services, the query/mutate pattern makes the implementation clear:

```typescript
const myService = createService({
  name: 'my-service',
  
  // Handle read operations
  queryFn: async (intent) => {
    // Process query intent
    return data; // Return the requested state
  },
  
  // Handle write operations (optional)
  mutateFn: async (intent) => {
    // Process mutate intent
    return { txId: 'transaction-id' }; // Return transaction info
  }
});
```

This separation makes your code more maintainable and easier to understand.