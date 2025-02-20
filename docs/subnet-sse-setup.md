# Setting Up Subnet Server-Sent Events (SSE)

This guide explains how to implement Server-Sent Events (SSE) for subnets in both Next.js and Express APIs. SSE provides real-time updates from your subnet to connected clients.

## Table of Contents
- [Overview](#overview)
- [Next.js API Implementation](#nextjs-api-implementation)
- [Express API Implementation](#express-api-implementation)
- [Client-Side Implementation](#client-side-implementation)
- [Event Types and Handling](#event-types-and-handling)
- [Error Handling and Reconnection](#error-handling-and-reconnection)

## Overview

Server-Sent Events (SSE) provide a one-way channel from server to client, perfect for real-time updates about subnet activities like:
- Balance changes
- Transfer status updates
- Deposit confirmations
- Withdrawal processing
- Batch processing status

## Next.js API Implementation

### 1. Create the SSE API Route

Create a new file `pages/api/subnets/[subnet]/events.ts`:

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { Subnet } from 'blaze-sdk/server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { subnet } = req.query;

    if (!subnet || !signer) {
        return res.status(400).json({ error: 'Missing subnet or signer parameter' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Initialize subnet
    const subnetInstance = new Subnet(subnet as string, process.env.SIGNER_ADDRESS as string);

    // Setup heartbeat
    const heartbeatInterval = setInterval(() => {
        res.write('data: heartbeat\n\n');
    }, 5000);

    // Setup event handler
    const eventHandler = (event: any) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Subscribe to events
    subnetInstance.addEventClient(signer as string, eventHandler);

    // Cleanup on client disconnect
    res.on('close', () => {
        clearInterval(heartbeatInterval);
        subnetInstance.removeEventClient(signer as string, eventHandler);
    });
}

export const config = {
    api: {
        bodyParser: false,
    },
};
```

### 2. Configure Next.js for SSE

Update your `next.config.js`:

```javascript
module.exports = {
    async headers() {
        return [
            {
                source: '/api/subnets/:subnet/events',
                headers: [
                    {
                        key: 'Connection',
                        value: 'keep-alive'
                    },
                    {
                        key: 'Cache-Control',
                        value: 'no-cache'
                    },
                    {
                        key: 'Content-Type',
                        value: 'text/event-stream'
                    }
                ]
            }
        ];
    }
};
```

## Express API Implementation

### 1. Create the SSE Endpoint

```typescript
import express from 'express';
import { Subnet } from 'blaze-sdk/server';

const router = express.Router();

router.get('/subnets/:subnet/events', async (req, res) => {
    const { subnet } = req.params;

    if (!subnet || !signer) {
        return res.status(400).json({ error: 'Missing subnet or signer parameter' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Initialize subnet
    const subnetInstance = new Subnet(subnet, process.env.SIGNER_ADDRESS as string);

    // Setup heartbeat
    const heartbeatInterval = setInterval(() => {
        res.write('data: heartbeat\n\n');
    }, 5000);

    // Setup event handler
    const eventHandler = (event: any) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Subscribe to events
    subnetInstance.addEventClient(signer as string, eventHandler);

    // Cleanup on client disconnect
    req.on('close', () => {
        clearInterval(heartbeatInterval);
        subnetInstance.removeEventClient(signer as string, eventHandler);
    });
});

export default router;
```

### 2. Configure Express for SSE

```typescript
import express from 'express';
import sseRouter from './routes/sse';

const app = express();

// Enable CORS for SSE
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
});

// Use SSE router
app.use('/api/v0', sseRouter);
```

## Client-Side Implementation

### Using the Built-in Client

```typescript
import { Blaze } from 'blaze-sdk/client';

const blaze = new Blaze(
    'SP2ZNGJ85ENDY6QRHQ5P2D4FXKGZWCKTB2T0Z55KS.blaze-welsh-v0',
    'SIGNER_ADDRESS',
    'https://your-api-url/api/v0'
);

// Subscribe to specific event types
blaze.subscribe('transfer', (event) => {
    console.log('Transfer event:', event);
});

blaze.subscribe('balance', (event) => {
    console.log('Balance update:', event);
});
```

### Manual EventSource Implementation

```typescript
const connectEventSource = (subnet: string, signer: string) => {
    const url = new URL(`https://your-api-url/api/v0/subnets/${subnet}/events`);
    url.searchParams.set('signer', signer);

    const eventSource = new EventSource(url.toString());

    eventSource.onmessage = (event) => {
        if (event.data === 'heartbeat') {
            console.log('Heartbeat received');
            return;
        }

        const blazeEvent = JSON.parse(event.data);
        console.log('Event received:', blazeEvent);
    };

    eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
        // Implement reconnection logic here
    };

    return eventSource;
};
```

## Event Types and Handling

The subnet SSE system supports the following event types:

```typescript
type EventType = 'transfer' | 'deposit' | 'withdraw' | 'balance' | 'batch';

interface BlazeEvent {
    type: EventType;
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
```

## Error Handling and Reconnection

The client SDK implements automatic reconnection with exponential backoff:

```typescript
const MAX_RETRY_DELAY = 32000; // Maximum retry delay of 32 seconds

class EventSourceManager {
    private retryCount = 0;

    private handleError() {
        const delay = Math.min(1000 * Math.pow(2, this.retryCount), MAX_RETRY_DELAY);
        this.retryCount++;
        setTimeout(() => this.connect(), delay);
    }

    private handleSuccess() {
        // Reset retry count on successful connection
        this.retryCount = 0;
    }
}
```

### Best Practices

1. Always implement heartbeat monitoring
2. Use exponential backoff for reconnection attempts
3. Handle all event types appropriately
4. Clean up event listeners when components unmount
5. Implement error handling for failed connections
6. Monitor connection state and notify users when disconnected
7. Consider implementing a message queue for missed events during disconnection

## Security Considerations

1. Validate subnet and signer parameters
2. Implement rate limiting
3. Use HTTPS for all connections
4. Consider implementing authentication
5. Validate event data before processing
6. Monitor for suspicious activity
7. Implement proper error logging 