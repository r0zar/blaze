# Client-Side Blaze Setup Guide

This guide explains how to set up and use Blaze in a React application using custom hooks for managing subnet interactions and real-time updates.

## Table of Contents
- [Installation](#installation)
- [Basic Setup](#basic-setup)
- [useBlaze Hook](#useblaze-hook)
- [Usage Examples](#usage-examples)
- [Advanced Usage](#advanced-usage)
- [TypeScript Support](#typescript-support)

## Installation

```bash
npm install blaze-sdk
# or
yarn add blaze-sdk
# or
pnpm add blaze-sdk
```

## Basic Setup

First, create a Blaze context to provide the Blaze instance throughout your application:

```typescript
// src/contexts/BlazeContext.tsx
import { createContext, useContext, ReactNode } from 'react';
import { Blaze } from 'blaze-sdk/client';

interface BlazeContextType {
  blaze: Blaze | null;
  isConnected: boolean;
}

const BlazeContext = createContext<BlazeContextType>({
  blaze: null,
  isConnected: false
});

export const useBlaze = () => useContext(BlazeContext);

interface BlazeProviderProps {
  children: ReactNode;
  subnet: string;
  signer: string;
  nodeUrl?: string;
}

export function BlazeProvider({ 
  children, 
  subnet, 
  signer, 
  nodeUrl = 'https://charisma.rocks/api/v0/blaze' 
}: BlazeProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const blazeRef = useRef<Blaze | null>(null);

  useEffect(() => {
    if (!subnet || !signer) return;

    blazeRef.current = new Blaze(subnet, signer, nodeUrl);
    
    // Monitor connection status
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    
    blazeRef.current.on('connect', handleConnect);
    blazeRef.current.on('disconnect', handleDisconnect);

    return () => {
      if (blazeRef.current) {
        blazeRef.current.off('connect', handleConnect);
        blazeRef.current.off('disconnect', handleDisconnect);
      }
    };
  }, [subnet, signer, nodeUrl]);

  return (
    <BlazeContext.Provider value={{ blaze: blazeRef.current, isConnected }}>
      {children}
    </BlazeContext.Provider>
  );
}
```

## useBlaze Hook

Create a custom hook for managing Blaze interactions:

```typescript
// src/hooks/useBlaze.ts
import { useState, useEffect, useCallback } from 'react';
import { useBlaze as useBlazeContext } from '../contexts/BlazeContext';
import type { BlazeEvent, Balance, TransactionResult } from 'blaze-sdk/client';

interface UseBlazeOptions {
  onBalanceUpdate?: (balance: Balance) => void;
  onTransferUpdate?: (event: BlazeEvent) => void;
  onError?: (error: Error) => void;
}

export function useBlaze(options: UseBlazeOptions = {}) {
  const { blaze, isConnected } = useBlazeContext();
  const [balance, setBalance] = useState<Balance>({ total: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Fetch balance
  const fetchBalance = useCallback(async () => {
    if (!blaze) return;
    
    try {
      setIsLoading(true);
      const balance = await blaze.getBalance({
        includeConfirmed: true,
        includeUnconfirmed: true
      });
      setBalance(balance);
      options.onBalanceUpdate?.(balance);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch balance');
      setError(error);
      options.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [blaze]);

  // Transfer tokens
  const transfer = useCallback(async (to: string, amount: number) => {
    if (!blaze) throw new Error('Blaze not initialized');
    
    try {
      setIsLoading(true);
      const result = await blaze.transfer({ to, amount });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Transfer failed');
      setError(error);
      options.onError?.(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [blaze]);

  // Subscribe to events
  useEffect(() => {
    if (!blaze) return;

    const handleBalanceUpdate = (event: BlazeEvent) => {
      if (event.type === 'balance' && event.data.balance) {
        setBalance(event.data.balance);
        options.onBalanceUpdate?.(event.data.balance);
      }
    };

    const handleTransferUpdate = (event: BlazeEvent) => {
      if (event.type === 'transfer') {
        options.onTransferUpdate?.(event);
      }
    };

    blaze.subscribe('balance', handleBalanceUpdate);
    blaze.subscribe('transfer', handleTransferUpdate);

    // Initial balance fetch
    fetchBalance();

    return () => {
      blaze.unsubscribe('balance', handleBalanceUpdate);
      blaze.unsubscribe('transfer', handleTransferUpdate);
    };
  }, [blaze, options.onBalanceUpdate, options.onTransferUpdate]);

  return {
    balance,
    isConnected,
    isLoading,
    error,
    transfer,
    fetchBalance
  };
}
```

## Usage Examples

### Basic Usage

```typescript
// src/App.tsx
import { BlazeProvider } from './contexts/BlazeContext';

function App() {
  return (
    <BlazeProvider 
      subnet="SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0"
      signer="YOUR_SIGNER_ADDRESS"
    >
      <YourComponents />
    </BlazeProvider>
  );
}
```

### Balance Display Component

```typescript
// src/components/Balance.tsx
import { useBlaze } from '../hooks/useBlaze';

function Balance() {
  const { balance, isLoading, error } = useBlaze({
    onBalanceUpdate: (newBalance) => {
      console.log('Balance updated:', newBalance);
    }
  });

  if (isLoading) return <div>Loading balance...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Balance</h2>
      <p>Total: {balance.total}</p>
      {balance.confirmed !== undefined && (
        <p>Confirmed: {balance.confirmed}</p>
      )}
      {balance.unconfirmed !== undefined && (
        <p>Unconfirmed: {balance.unconfirmed}</p>
      )}
    </div>
  );
}
```

### Transfer Component

```typescript
// src/components/Transfer.tsx
import { useState } from 'react';
import { useBlaze } from '../hooks/useBlaze';

function Transfer() {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const { transfer, isLoading, error } = useBlaze({
    onTransferUpdate: (event) => {
      console.log('Transfer status:', event.data.status);
    }
  });

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await transfer(recipient, Number(amount));
      console.log('Transfer submitted:', result);
    } catch (err) {
      console.error('Transfer failed:', err);
    }
  };

  return (
    <form onSubmit={handleTransfer}>
      <input
        type="text"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        placeholder="Recipient address"
      />
      <input
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Processing...' : 'Transfer'}
      </button>
      {error && <p>Error: {error.message}</p>}
    </form>
  );
}
```

## Advanced Usage

### Custom Event Handling

```typescript
function TransactionHistory() {
  const [transactions, setTransactions] = useState<BlazeEvent[]>([]);
  
  useBlaze({
    onTransferUpdate: (event) => {
      setTransactions(prev => [event, ...prev]);
    }
  });

  return (
    <div>
      <h2>Recent Transactions</h2>
      <ul>
        {transactions.map((tx, index) => (
          <li key={index}>
            {tx.data.status}: {tx.data.amount} tokens
            {tx.data.from && <> from {tx.data.from}</>}
            {tx.data.to && <> to {tx.data.to}</>}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Connection Status Monitor

```typescript
function ConnectionStatus() {
  const { isConnected } = useBlaze();

  return (
    <div className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
      {isConnected ? 'Connected' : 'Disconnected'}
    </div>
  );
}
```

## TypeScript Support

The hooks and components are fully typed. Here are the main types you'll work with:

```typescript
interface Balance {
  total: number;
  confirmed?: number;
  unconfirmed?: number;
}

interface BlazeEvent {
  type: 'transfer' | 'deposit' | 'withdraw' | 'balance' | 'batch';
  contract: string;
  data: {
    from?: string;
    to?: string;
    amount?: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    txid?: string;
    error?: string;
    timestamp: number;
    balance?: Balance;
  };
}

interface TransactionResult {
  txid: string;
  status: 'pending' | 'success' | 'error';
}
```

These types are exported from the `blaze-sdk/client` package and can be imported directly. 