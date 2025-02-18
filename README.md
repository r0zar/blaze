# Blaze SDK

A lightweight SDK for managing off-chain transfers with on-chain settlement for Stacks dapps. Enables batching multiple transfers into single transactions for improved efficiency and UX.

## Installation

```bash
npm install blaze-sdk
```

## Overview

The Blaze SDK consists of two main parts:
1. **Server SDK**: For managing transfer queues and processing batches
2. **Client SDK**: For signing transfers and managing token amounts

## Server SDK

### Configuration

The server requires a private key to be set as an environment variable for submitting transactions:

```bash
export PRIVATE_KEY=your_private_key_here
```

### Core Concepts

- **Tokens**: Register token contracts you want to manage transfers for
- **Transfers**: Off-chain signed transfers that can be batched together
- **Batching**: Combine up to 200 transfers into a single transaction
- **Balance Tracking**: Track both confirmed (on-chain) and unconfirmed (pending) balances

### Basic Usage

```typescript
import { registerToken, addTransferToQueue, processTransfers } from 'blaze-sdk';

// Register a token contract
registerToken('SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.blaze-token');

// Queue a transfer for later processing
await addTransferToQueue('SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.blaze-token', {
    to: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',
    amount: 1000000, // amount in microtokens
    nonce: 1,
    signature: '0x...'
});

// Process queued transfers when ready
await processTransfers('SP2PABAF9FTAJYNFZH93XENAJ8FVY99RRM50D2JG9.blaze-token');
```

### Server API Reference

#### Token Management

```typescript
registerToken(tokenContract: string): void
```
Register a token contract to manage transfers for.

```typescript
deregisterToken(token: string): void
```
Remove a token contract and clear its state.

```typescript
getRegisteredTokens(): string[]
```
Get list of registered token contracts.

#### Balance Management

```typescript
getBalance(contract: string, user: string): Promise<Balance>
```
Get a user's balance including both confirmed (on-chain) and unconfirmed (pending) amounts.

#### Transfer Management

```typescript
addTransferToQueue(token: string, transfer: Transfer): Promise<void>
```
Queue a signed transfer for later processing.

```typescript
processTransfers(token: string): Promise<void>
```
Process all queued transfers for a token into a single transaction.

```typescript
processAllTokens(): Promise<void>
```
Process queued transfers for all registered tokens.

#### Status

```typescript
getStatus(): Status
```
Get current status including:
- Processing state
- Registered tokens
- Queue sizes
- Last processed block

## Client SDK

### Basic Usage

```typescript
import { signTransfer } from 'blaze-sdk/client';

// Request user to sign a transfer
const signatureData = await signTransfer({
    from: userAddress,
    to: recipientAddress,
    amount: 100 // in microtokens
});

// Send to your backend
await fetch('/api/transfer', {
    method: 'POST',
    body: JSON.stringify({
        to: recipientAddress,
        amount: amount,
        signature: signatureData.signature
    })
});
```

### Client API Reference

```typescript
signTransfer(options: SignTransferOptions): Promise<SignTransferResult>
```
Request user to sign a transfer using their Stacks wallet. Handles conversion to microtokens automatically.

## Types

### Server Types

```typescript
interface Transfer {
    to: string;        // Recipient address
    amount: number;    // Amount in microtokens
    nonce: number;     // Transaction nonce
    signature: string; // Signed transfer data
}

interface Balance {
    confirmed: number;   // On-chain balance in microtokens
    unconfirmed: number; // Pending balance changes in microtokens
}

interface Status {
    isProcessing: boolean;
    registeredTokens: string[];
    queueSizes: { [token: string]: number };
    lastProcessedBlock?: number;
}
```

### Client Types

```typescript
interface SignTransferOptions {
    signer: string;
    to: string;
    amount?: number;
    nonce?: number;
}

interface SignTransferResult {
    signature: string;
    publicKey: string;
}
```

## Best Practices

1. Always verify transfer signatures before queueing
2. Monitor transfer status
3. Handle errors appropriately in your application
4. Keep private key secure
5. Register tokens before attempting to process transfers
6. Choose appropriate times to process transfers (e.g., when queue reaches certain size)

## Limitations

- Maximum 200 transfers per batch
- Mainnet only
- In-memory state (clears on restart)
- Single instance state tracking