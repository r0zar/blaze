# Blaze SDK

A lightweight SDK for managing off-chain transfers with on-chain settlement for Stacks dapps. Enables batching multiple transfers into single transactions for improved efficiency and UX.

## Installation

```bash
npm install blaze-sdk
```

## Overview

The Blaze SDK provides a comprehensive solution for managing token transfers on Stacks subnets, combining off-chain efficiency with on-chain security. It handles:

- Off-chain transfer signing and validation
- On-chain deposit and withdrawal operations
- Real-time balance tracking with caching
- Batched transfer processing for improved efficiency
- Automatic environment detection (browser/server)
- Structured data signing for secure transfers

## Guides

- [Game Developer's Guide](docs/game-developers-guide.md) - Comprehensive guide for building games and NFT projects with Blaze SDK
- [Subnet Registry](docs/subnet-registry.md) - List of active subnets and supported tokens

## Architecture

The SDK is organized into several core modules:

- **Blaze Client**: Main interface for developers (`client.ts`)
- **Subnet Management**: Handles transfer queuing and batch processing (`subnet.ts`)
- **Balance Tracking**: Manages cached and on-chain balances (`balance.ts`)
- **Transaction Handling**: Builds and executes transactions (`transactions.ts`, `subnet-transactions.ts`)
- **Signature Management**: Handles structured data signing (`structured-data.ts`)

## Usage

### Client-Side Usage

```typescript
import { Blaze } from 'blaze-sdk';

// Initialize with Welsh Token subnet (first supported token)
const blaze = new Blaze(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
    'SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88'  // Your Stacks address
);

// Check balance (includes both confirmed and unconfirmed)
const balance = await blaze.getBalance();
console.log('Balance:', balance);

// Make a transfer (automatically uses @stacks/connect in browser)
await blaze.transfer({
    to: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS',  // Recipient address
    amount: 1000000 // amount in microtokens (1 WELSH)
});

// Deposit tokens to subnet
await blaze.deposit(1000000);  // 1 WELSH

// Withdraw tokens from subnet
await blaze.withdraw(1000000);  // 1 WELSH
```

### Server-Side Usage

For server-side operations, set your private key as an environment variable:

```bash
export PRIVATE_KEY=your_private_key_here
```

Then use the same API as client-side, but in a Node.js environment:

```typescript
import { Blaze } from 'blaze-sdk';

// Initialize with Welsh Token subnet for server operations
const blaze = new Blaze(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
    'SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88'  // Your server's Stacks address
);
// The SDK will automatically detect server environment and use the private key
```

## API Reference

### `Blaze` Class

#### Constructor
```typescript
new Blaze(subnet: string, signer: string)
```
- `subnet`: The contract address of the subnet
- `signer`: The Stacks address of the signer

#### Methods

##### `getBalance()`
Returns the current balance for the signer in the subnet, including both confirmed (on-chain) and unconfirmed (pending) amounts.

Returns: `Promise<Balance>`
```typescript
interface Balance {
    confirmed: number;   // On-chain balance in microtokens
    unconfirmed: number; // Pending balance changes in microtokens
}
```

##### `transfer(options: TransferOptions)`
Initiates an off-chain transfer within the subnet. The transfer is signed and queued for batch processing.

Parameters:
```typescript
interface TransferOptions {
    to: string;    // Recipient address
    amount: number; // Amount in microtokens
}
```

##### `deposit(amount: number)`
Deposits tokens from the main chain to the subnet. This is an on-chain operation.

Parameters:
- `amount`: Amount in microtokens to deposit

##### `withdraw(amount: number)`
Withdraws tokens from the subnet to the main chain. This is an on-chain operation.

Parameters:
- `amount`: Amount in microtokens to withdraw

## Technical Details

### Transfer Workflow

1. **Initiation**: User initiates transfer through Blaze client
2. **Signing**: 
   - Browser: Uses @stacks/connect for user signature
   - Server: Uses private key from environment
3. **Queue Processing**: Transfers are queued for batch processing
4. **Batch Settlement**: Multiple transfers are combined into single on-chain transaction
5. **Balance Updates**: Both cached and on-chain balances are updated

### Transaction Types

1. **Single Transfers**: 
   - Direct on-chain transactions
   - Used for deposits and withdrawals
2. **Batch Transfers**: 
   - Combines multiple transfers
   - More gas efficient
   - Handles up to 200 transfers per batch

### Balance Management

- Uses Vercel KV for balance caching
- Tracks both confirmed and unconfirmed balances
- Processes chainhook events for balance updates
- Automatic synchronization with on-chain state

### Environment Detection

The SDK automatically detects the runtime environment:
- **Browser**: 
  - Uses @stacks/connect for user interactions
  - Handles wallet connections
  - Manages signature requests
- **Server**: 
  - Uses private key for signing
  - Automated transaction execution
  - No user interaction required

### Network Configuration

Currently supports:
- Network: Stacks Mainnet
- Default fee: 1800 microstacks
- Batch size: Up to 200 transfers

## Dependencies

Core dependencies:
- @stacks/connect: ^7.0.2 (wallet integration)
- @stacks/network: ^7.0.2 (network operations)
- @stacks/transactions: ^7.0.2 (transaction building)
- @vercel/kv: ^3.0.0 (balance caching)
- axios: ^1.7.9 (API communication)

## Best Practices

1. Always check balances before transfers
2. Handle transaction errors appropriately
3. Keep private keys secure in server environments
4. Use appropriate error handling for user interactions
5. Monitor transaction status after broadcast
6. Implement proper nonce management
7. Consider batch size for optimal gas efficiency

## Limitations

- Mainnet only (no testnet support currently)
- Single subnet per instance
- Requires environment-specific setup (browser vs server)
- Transaction fees are fixed at 1800 microstacks
- Maximum 200 transfers per batch
- Requires Vercel KV for balance caching

## License

MIT