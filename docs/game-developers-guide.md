# Game Developer's Guide - Blaze SDK

This guide will help you integrate Blaze SDK into your game or NFT project, providing efficient token and asset management with minimal blockchain interaction.

## Table of Contents

- [Overview](#overview)
- [Getting Started](#getting-started)
- [Common Gaming Use Cases](#common-gaming-use-cases)
- [NFT Minting Guide](#nft-minting-guide)
- [Game Architecture Patterns](#game-architecture-patterns)
- [Performance Optimization](#performance-optimization)
- [Best Practices](#best-practices)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)

## Overview

Blaze SDK is particularly useful for games and NFT projects because it:

- Reduces gas costs through batching
- Provides instant feedback while maintaining blockchain security
- Handles complex blockchain interactions transparently
- Manages asset transfers efficiently
- Provides real-time balance updates

## Getting Started

### Installation

```bash
npm install blaze-sdk
# or
yarn add blaze-sdk
# or
pnpm add blaze-sdk
```

### Basic Setup

```typescript
import { Blaze } from 'blaze-sdk';

// Initialize Blaze with the Welsh Token subnet
const gameBlaze = new Blaze(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',  // Welsh Token subnet
    'SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88'  // Your game's Stacks address
);
```

## Common Gaming Use Cases

### 1. In-Game Currency Management

```typescript
class GameCurrencyManager {
    private blaze: Blaze;
    
    constructor(playerAddress: string) {
        this.blaze = new Blaze(
            'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
            playerAddress
        );
    }

    async getPlayerBalance(): Promise<number> {
        const balance = await this.blaze.getBalance();
        return balance.confirmed + balance.unconfirmed;
    }

    async purchaseItem(itemCost: number, toAddress: string) {
        try {
            await this.blaze.transfer({
                to: toAddress,
                amount: itemCost
            });
            return true;
        } catch (error) {
            console.error('Purchase failed:', error);
            return false;
        }
    }
}

// Usage
const currencyManager = new GameCurrencyManager('SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88');
const balance = await currencyManager.getPlayerBalance();
console.log('Player balance:', balance / 1000000, 'WELSH');  // Convert from microtokens
```

### 2. Player Rewards System

```typescript
class RewardSystem {
    private blaze: Blaze;
    private rewardPool: string;

    constructor(playerAddress: string) {
        this.blaze = new Blaze(
            'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
            playerAddress
        );
        this.rewardPool = 'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS';  // Welsh Token reward pool
    }

    async distributeReward(amount: number) {
        try {
            await this.blaze.transfer({
                to: this.rewardPool,
                amount: amount * 1000000  // Convert WELSH to microtokens
            });
            return true;
        } catch (error) {
            console.error('Reward distribution failed:', error);
            return false;
        }
    }
}

// Usage
const rewards = new RewardSystem('SP2MR4YP9C7P93EJZC4W1JT8HKAX8Q4HR9Q6X3S88');
await rewards.distributeReward(5);  // Distribute 5 WELSH
```

## NFT Minting Guide

### 1. Basic NFT Minting

```typescript
class NFTMinter {
    private blaze: Blaze;
    
    constructor(subnet: string, minterAddress: string) {
        this.blaze = new Blaze(subnet, minterAddress);
    }

    async mintNFT(recipient: string, metadata: any) {
        // First, ensure minting fee is paid
        await this.blaze.transfer({
            to: recipient,
            amount: MINT_FEE
        });

        // Then trigger the actual mint (implementation depends on your NFT contract)
        // This is a placeholder for your actual minting logic
        return { success: true, tokenId: 'new-token-id' };
    }
}
```

### 2. Batch Minting for Collections

```typescript
class BatchNFTMinter {
    private blaze: Blaze;
    
    constructor(subnet: string, minterAddress: string) {
        this.blaze = new Blaze(subnet, minterAddress);
    }

    async batchMint(recipients: string[], metadata: any[]) {
        // Blaze SDK will automatically batch these transfers
        const transfers = recipients.map((recipient, index) => 
            this.blaze.transfer({
                to: recipient,
                amount: MINT_FEE
            })
        );
        
        await Promise.all(transfers);
        // Implement your batch minting logic here
    }
}
```

## Game Architecture Patterns

### 1. Event-Driven Architecture

```typescript
class GameEventManager {
    private blaze: Blaze;
    private eventHandlers: Map<string, Function>;

    constructor(subnet: string, playerAddress: string) {
        this.blaze = new Blaze(subnet, playerAddress);
        this.eventHandlers = new Map();
        this.setupEventListeners();
    }

    private setupEventListeners() {
        // Listen for balance changes
        this.on('balanceChange', async (newBalance) => {
            // Update game UI or state
        });
    }

    public on(event: string, handler: Function) {
        this.eventHandlers.set(event, handler);
    }
}
```

### 2. State Management Pattern

```typescript
class GameStateManager {
    private blaze: Blaze;
    private gameState: any;

    constructor(subnet: string, playerAddress: string) {
        this.blaze = new Blaze(subnet, playerAddress);
        this.gameState = {
            balance: 0,
            pendingTransactions: []
        };
    }

    async updateState() {
        const balance = await this.blaze.getBalance();
        this.gameState.balance = balance.confirmed + balance.unconfirmed;
    }
}
```

## Performance Optimization

### 1. Balance Caching

```typescript
class BalanceCache {
    private cache: Map<string, number>;
    private blaze: Blaze;

    constructor(subnet: string, playerAddress: string) {
        this.blaze = new Blaze(subnet, playerAddress);
        this.cache = new Map();
    }

    async getBalance(address: string): Promise<number> {
        if (this.cache.has(address)) {
            return this.cache.get(address)!;
        }
        
        const balance = await this.blaze.getBalance();
        this.cache.set(address, balance.confirmed + balance.unconfirmed);
        return this.cache.get(address)!;
    }
}
```

### 2. Transaction Batching

```typescript
class TransactionBatcher {
    private queue: Array<{to: string, amount: number}>;
    private blaze: Blaze;

    constructor(subnet: string, playerAddress: string) {
        this.blaze = new Blaze(subnet, playerAddress);
        this.queue = [];
    }

    addToQueue(to: string, amount: number) {
        this.queue.push({ to, amount });
        if (this.queue.length >= 100) { // Process in batches of 100
            this.processQueue();
        }
    }

    async processQueue() {
        const transfers = this.queue.map(tx => 
            this.blaze.transfer(tx)
        );
        this.queue = [];
        await Promise.all(transfers);
    }
}
```

## Best Practices

1. **Error Handling**
```typescript
async function safeTransfer(blaze: Blaze, to: string, amount: number) {
    try {
        const balance = await blaze.getBalance();
        if (balance.confirmed + balance.unconfirmed < amount) {
            throw new Error('Insufficient balance');
        }
        await blaze.transfer({ to, amount });
    } catch (error) {
        // Handle error appropriately
        console.error('Transfer failed:', error);
        // Notify user or retry
    }
}
```

2. **Balance Verification**
```typescript
async function verifyBalance(blaze: Blaze, requiredAmount: number): Promise<boolean> {
    const balance = await blaze.getBalance();
    return (balance.confirmed + balance.unconfirmed) >= requiredAmount;
}
```

3. **Transaction Monitoring**
```typescript
class TransactionMonitor {
    private transactions: Map<string, any>;

    async trackTransaction(txId: string) {
        this.transactions.set(txId, {
            status: 'pending',
            timestamp: Date.now()
        });
        // Implement your monitoring logic
    }
}
```

## Examples

### 1. Simple Game Shop

```typescript
class GameShop {
    private blaze: Blaze;
    
    constructor(subnet: string, shopAddress: string) {
        this.blaze = new Blaze(subnet, shopAddress);
    }

    async purchaseItem(itemId: string, cost: number, playerAddress: string) {
        // Verify player balance
        if (!await verifyBalance(this.blaze, cost)) {
            throw new Error('Insufficient balance');
        }

        // Process purchase
        await this.blaze.transfer({
            to: playerAddress,
            amount: cost
        });

        // Grant item to player
        return { success: true, itemId };
    }
}
```

### 2. NFT Trading System

```typescript
class NFTTrading {
    private blaze: Blaze;
    
    constructor(subnet: string, tradingAddress: string) {
        this.blaze = new Blaze(subnet, tradingAddress);
    }

    async createTrade(nftId: string, price: number) {
        // Implementation for creating trade
    }

    async executeTrade(tradeId: string, buyerAddress: string) {
        // Process payment
        await this.blaze.transfer({
            to: buyerAddress,
            amount: price
        });
        
        // Transfer NFT
        // Implement your NFT transfer logic
    }
}
```

## Troubleshooting

### Common Issues and Solutions

1. **Transaction Failures**
```typescript
async function handleTransactionError(error: any) {
    if (error.message.includes('insufficient balance')) {
        // Handle insufficient balance
        return 'Please check your balance';
    }
    if (error.message.includes('nonce')) {
        // Handle nonce issues
        return 'Please try again';
    }
    // Handle other errors
    return 'Unknown error occurred';
}
```

2. **Balance Synchronization Issues**
```typescript
async function resyncBalance(blaze: Blaze) {
    // Force a fresh balance check
    const balance = await blaze.getBalance();
    // Update your game state
    return balance;
}
```

### Debug Mode

```typescript
class DebugMode {
    static enable() {
        // Enable console logging
        // Monitor transaction times
        // Track balance updates
    }

    static disable() {
        // Disable debug features
    }
}
```

## Support and Resources

- [Blaze SDK Documentation](../README.md)
- [API Reference](../README.md#api-reference)
- [GitHub Issues](https://github.com/your-repo/blaze-sdk/issues)
- [Community Discord](https://discord.gg/your-discord) 