# Blaze: Layer 2 Scaling for Stacks

Blaze is a lightweight SDK for managing off-chain transfers with on-chain settlement for Stacks dapps. It provides a simple interface for fast, secure transfers while maintaining the security guarantees of the Stacks blockchain.

## Features

- ⚡️ **Fast Transfers**: Process transfers off-chain with immediate feedback
- 🔒 **Secure**: All transfers are cryptographically signed and verified
- 🔄 **Real-time Updates**: Get instant balance updates and transfer status
- 🎯 **Simple API**: Easy-to-use SDK for both client and server
- 📊 **Batch Processing**: Efficient on-chain settlement in batches
- 💰 **Cost Effective**: Reduce transaction fees through batching

## Documentation

- [Operator Guide](docs/OPERATOR_GUIDE.md) - Complete guide for setting up and running a Blaze subnet node
- [Technical Architecture](docs/ARCHITECTURE.md) - Detailed technical documentation of the Blaze system
- [API Reference](#api-reference) - SDK API documentation
- [Examples](#examples) - Code examples and tutorials

## Quick Start

### Installation

```bash
npm install blaze-sdk
# or
pnpm add blaze-sdk
```

### Client Usage

```typescript
import { Blaze } from 'blaze-sdk/client';

// Initialize the client
const blaze = new Blaze(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
    'SIGNER_ADDRESS'
);

// Subscribe to balance updates
blaze.subscribe('balance', (event) => {
    console.log('New total balance:', event.data.balance.total);
    if (event.data.balance.confirmed) {
        console.log('Confirmed balance:', event.data.balance.confirmed);
    }
    if (event.data.balance.unconfirmed) {
        console.log('Unconfirmed balance:', event.data.balance.unconfirmed);
    }
});

// Make a transfer
await blaze.transfer({
    to: 'RECIPIENT_ADDRESS',
    amount: 100
});

// Get total balance (default)
const balance = await blaze.getBalance();
console.log('Total balance:', balance.total);

// Get detailed balance information
const detailedBalance = await blaze.getBalance({
    includeConfirmed: true,
    includeUnconfirmed: true
});
console.log('Detailed balance:', detailedBalance);
```

### Server Usage

```typescript
import { Subnet } from 'blaze-sdk/server';

// Initialize the subnet node
const subnet = new Subnet(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
    'OPERATOR_ADDRESS'
);

// Get user balance with options
const balance = await subnet.getBalance('USER_ADDRESS', {
    includeConfirmed: true,
    includeUnconfirmed: true
});
console.log('User balance:', balance);

// Process transfers in batches
await subnet.processTransfers();
```

## API Reference

### Client SDK

#### `Blaze`

The main client class for interacting with Blaze subnets.

```typescript
class Blaze {
    constructor(subnet: string, signer: string, nodeUrl?: string);
    
    // Core operations
    async transfer(options: TransferOptions): Promise<TransactionResult>;
    async deposit(amount: number): Promise<FinishedTxData>;
    async withdraw(amount: number): Promise<FinishedTxData>;
    
    // Balance management
    async getBalance(options?: BalanceOptions): Promise<Balance>;
    
    // Real-time updates
    subscribe(type: EventType, handler: (event: BlazeEvent) => void): EventSubscription;
}

// Balance types
interface Balance {
    total: number;           // Total available balance
    confirmed?: number;      // Optional: On-chain confirmed balance
    unconfirmed?: number;    // Optional: Pending unconfirmed balance
}

interface BalanceOptions {
    includeConfirmed?: boolean;    // Include confirmed balance
    includeUnconfirmed?: boolean;  // Include unconfirmed balance
}
```

### Server SDK

#### `Subnet`

The main server class for operating a Blaze subnet node.

```typescript
class Subnet {
    constructor(subnet: string, signer: string, nodeUrl?: string);
    
    // Core operations
    async processTransfers(): Promise<TransactionResult>;
    async addTransferToQueue(transfer: Transfer): Promise<void>;
    
    // Balance management
    async getBalance(user: string, options?: BalanceOptions): Promise<Balance>;
    async processDepositEvent(user: string, amount: number): Promise<void>;
    async processWithdrawEvent(user: string, amount: number): Promise<void>;
    async processTransferEvent(from: string, to: string, amount: number): Promise<void>;
}
```

## Examples

### Balance Management

```typescript
import { Blaze } from 'blaze-sdk/client';

async function manageBalances() {
    const blaze = new Blaze(
        'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
        'SIGNER_ADDRESS'
    );
    
    // Get total balance only (default)
    const balance = await blaze.getBalance();
    console.log('Total balance:', balance.total);
    
    // Get all balance information
    const fullBalance = await blaze.getBalance({
        includeConfirmed: true,
        includeUnconfirmed: true
    });
    console.log('Full balance:', {
        total: fullBalance.total,
        confirmed: fullBalance.confirmed,
        unconfirmed: fullBalance.unconfirmed
    });
    
    // Subscribe to balance updates
    blaze.subscribe('balance', (event) => {
        const { total, confirmed, unconfirmed } = event.data.balance;
        console.log('Balance updated:', {
            total,
            confirmed,
            unconfirmed
        });
    });
}
```

### Making a Transfer

```typescript
import { Blaze } from 'blaze-sdk/client';

async function makeTransfer() {
    const blaze = new Blaze(
        'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
        'SIGNER_ADDRESS'
    );
    
    // Subscribe to transfer status
    blaze.subscribe('transfer', (event) => {
        console.log('Transfer status:', event.data.status);
    });
    
    // Make the transfer
    const result = await blaze.transfer({
        to: 'RECIPIENT_ADDRESS',
        amount: 100
    });
    
    console.log('Transfer submitted:', result);
}
```

### Running a Subnet Node

```typescript
import { Subnet } from 'blaze-sdk/server';

async function runSubnetNode() {
    const subnet = new Subnet(
        'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
        'OPERATOR_ADDRESS'
    );
    
    // Process transfers every minute
    setInterval(async () => {
        try {
            await subnet.processTransfers();
        } catch (error) {
            console.error('Error processing transfers:', error);
        }
    }, 60000);
}
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.