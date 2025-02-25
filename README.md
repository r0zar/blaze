# Blaze: Layer 2 Scaling for Stacks

Blaze is a lightweight SDK for managing off-chain transfers with on-chain settlement for Stacks dapps. It provides a simple interface for fast, secure transfers while maintaining the security guarantees of the Stacks blockchain.

## Features

- ⚡️ **Fast Transfers**: Process transfers off-chain with immediate feedback
- 🔒 **Secure**: All transfers are cryptographically signed and verified
- 🎯 **Simple API**: Easy-to-use SDK for both client and server
- 📊 **Batch Processing**: Efficient on-chain settlement in batches
- 💰 **Cost Effective**: Reduce transaction fees through batching

## Documentation

- [API Reference](#api-reference) - SDK API documentation
- [Examples](#examples) - Code examples and tutorials
- [Technical Architecture](docs/ARCHITECTURE.md) - Detailed technical documentation of the Blaze system
- [Subnet Registry](docs/subnet-registry.md) - Registry of available subnet contracts on Stacks

## Quick Start

### Installation

```bash
pnpm add blaze-sdk
```

### Client Usage

```typescript
import { Blaze } from 'blaze-sdk';

// Initialize the client
const blaze = new Blaze({
    subnet: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0'
});

// Make a transfer
await blaze.transfer({
    to: 'RECIPIENT_ADDRESS',
    amount: 100
});

// Get user balance
const balance = await blaze.getBalance();
console.log('Balance:', balance);

// Refresh balance after on-chain transactions (deposits/withdrawals)
await blaze.refreshBalance();
```

### Server Usage

```typescript
import { Subnet } from 'blaze-sdk';

// Initialize the subnet node
const subnet = new Subnet();
subnet.subnet = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
subnet.signer = 'OPERATOR_ADDRESS';
subnet.privateKey = process.env.PRIVATE_KEY;

// Get user balance
const balance = await subnet.getBalance('USER_ADDRESS');
console.log('User balance:', balance);

// Process a transfer request from a user
const transfer = {
    signer: 'USER_ADDRESS',
    to: 'RECIPIENT_ADDRESS',
    amount: 100,
    nonce: 12345,
    signature: 'signed_message_hex'
};
await subnet.processTxRequest(transfer);

// Mine a block to settle transactions in the mempool
await subnet.mineBlock(200); // Process up to 200 transactions

// Explicitly refresh balances when needed (e.g., after blockchain confirmations)
await subnet.refreshBalances('USER_ADDRESS');
// Or refresh all known balances
await subnet.refreshBalances();
```

## API Reference

### Client SDK

#### `Blaze`

The main client class for interacting with Blaze subnets.

```typescript
class Blaze {
    constructor(options?: { nodeUrl?: string, subnet?: string });
    
    // Wallet management
    async connectWallet(): Promise<string>;
    disconnectWallet(): void;
    isWalletConnected(): boolean;
    getWalletAddress(): string;
    
    // Core operations
    async transfer(options: TransferOptions): Promise<TransactionResult>;
    async deposit(amount: number): Promise<TransactionResult>;
    async withdraw(amount: number): Promise<TransactionResult>;
    
    // Balance management
    async getBalance(): Promise<number>;
    async refreshBalance(): Promise<number>;
}
```

### Server SDK

#### `Subnet`

The main server class for operating a Blaze subnet node.

```typescript
class Subnet {
    subnet: string;
    signer: string;
    privateKey: string | undefined;
    balances: Map<string, number>;
    mempool: Mempool;
    
    // Core operations
    async processTxRequest(txRequest: Transfer): Promise<void>;
    async mineBlock(batchSize?: number): Promise<TransactionResult>;
    
    // Balance management
    async getBalance(user?: string): Promise<number>;
    async getBalances(): Promise<Record<string, number>>;
    async refreshBalances(user?: string): Promise<void>;
    
    // On-chain operations
    async deposit(amount: number): Promise<TransactionResult>;
    async withdraw(amount: number): Promise<TransactionResult>;
}
```

#### `Mempool`

Manages unconfirmed transactions waiting to be mined into blocks.

```typescript
class Mempool {
    // Transaction management
    getQueue(): Transaction[];
    addTransaction(transaction: Transaction): void;
    getBatchToMine(maxBatchSize?: number): Transaction[];
    removeProcessedTransactions(count: number): void;
    
    // Balance calculations
    getPendingBalanceChanges(): Map<string, number>;
    getTotalBalances(): Map<string, number>;
    async getBalance(user: string): Promise<number>;
}
```

## Examples

### Balance Management

```typescript
import { Blaze } from 'blaze-sdk';

async function manageBalances() {
    const blaze = new Blaze({
        subnet: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0'
    });

    // Get user balance
    const balance = await blaze.getBalance();
    console.log('Balance:', balance);
}
```

### Making a Transfer

```typescript
import { Blaze } from 'blaze-sdk';

async function makeTransfer() {
    const blaze = new Blaze({
        subnet: 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0'
    });
    
    // Make the transfer - this will be added to the mempool
    const result = await blaze.transfer({
        to: 'RECIPIENT_ADDRESS',
        amount: 100
    });
    
    console.log('Transfer submitted:', result);
}
```

### Running a Subnet Node

```typescript
import { Subnet } from 'blaze-sdk';

async function runSubnetNode() {
    const subnet = new Subnet();
    subnet.subnet = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0';
    subnet.signer = 'OPERATOR_ADDRESS';
    subnet.privateKey = process.env.PRIVATE_KEY;
    
    // Process transfers every minute
    setInterval(async () => {
        try {
            // Mine a block to process transactions in the mempool
            await subnet.mineBlock(200);
            console.log('Successfully mined a block');
            
            // After some time, refresh balances for all users
            // (blockchain confirmations take ~30 seconds)
            setTimeout(async () => {
                await subnet.refreshBalances();
                console.log('Refreshed on-chain balances for all users');
            }, 35000);
        } catch (error) {
            console.error('Error processing transfers:', error);
        }
    }, 60000);
}
```